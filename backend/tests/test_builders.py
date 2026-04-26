from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from mohican_backend.catalog import catalog_response, feature_mappings_for_engine
from mohican_backend.engines.garak import (
    build_garak_config,
    build_garak_generator_options,
    garak_env,
    garak_request_timeout_seconds,
)
from mohican_backend.engines.promptfoo import (
    build_promptfoo_config,
    build_promptfoo_fallback_config,
    promptfoo_env,
)
from mohican_backend.models import Engine, FeatureId, JobRequest


def make_request(*, request_mode: str = "chat") -> JobRequest:
    return JobRequest.model_validate(
        {
            "target": {
                "baseUrl": "http://127.0.0.1:11434/api",
                "apiKey": "secret",
                "model": "llama3.1",
                "requestMode": request_mode,
            },
            "selections": [
                {"featureId": "prompt-injection", "engines": ["promptfoo", "garak"]},
                {"featureId": "jailbreak", "engines": ["promptfoo"]},
            ],
            "runOptions": {"numTests": 3, "maxConcurrency": 2, "dryRun": True},
        }
    )


class BuilderTests(unittest.TestCase):
    def test_promptfoo_chat_config_targets_ollama_chat(self) -> None:
        request = make_request(request_mode="chat")
        mappings = feature_mappings_for_engine([FeatureId.prompt_injection], Engine.promptfoo)
        config = build_promptfoo_config(request, mappings)

        provider = config["providers"][0]["config"]
        self.assertEqual(provider["url"], "http://127.0.0.1:11434/api/chat")
        self.assertFalse(provider["body"]["think"])
        self.assertEqual(provider["body"]["options"]["num_predict"], 256)
        self.assertNotIn("messages", provider["body"])
        self.assertIn("messages", provider["transformRequest"])
        self.assertIn("Array.isArray(prompt)", provider["transformRequest"])
        self.assertEqual(provider["transformResponse"], "json.message.content")
        self.assertIn("prompt-extraction", config["redteam"]["plugins"])
        self.assertIn("basic", config["redteam"]["strategies"])
        self.assertEqual(config["redteam"]["numTests"], 1)
        self.assertNotIn("base64", config["redteam"]["strategies"])
        self.assertEqual(config["redteam"]["provider"]["config"]["url"], provider["url"])

    def test_promptfoo_generate_config_targets_ollama_generate(self) -> None:
        request = make_request(request_mode="generate")
        mappings = feature_mappings_for_engine([FeatureId.jailbreak], Engine.promptfoo)
        config = build_promptfoo_config(request, mappings)

        provider = config["providers"][0]["config"]
        self.assertEqual(provider["url"], "http://127.0.0.1:11434/api/generate")
        self.assertFalse(provider["body"]["think"])
        self.assertEqual(provider["body"]["options"]["num_predict"], 256)
        self.assertNotIn("prompt", provider["body"])
        self.assertIn("prompt:", provider["transformRequest"])
        self.assertEqual(provider["transformResponse"], "json.response")
        self.assertIn("harmbench", config["redteam"]["plugins"])
        self.assertEqual(config["redteam"]["strategies"], ["basic"])
        self.assertIn("transformRequest", config["redteam"]["provider"]["config"])

    def test_promptfoo_env_bypasses_proxy_for_target(self) -> None:
        request = make_request()
        env = promptfoo_env(request)

        self.assertNotIn("HTTP_PROXY", env)
        self.assertNotIn("HTTPS_PROXY", env)
        self.assertIn("127.0.0.1", env["NO_PROXY"])
        self.assertIn("localhost", env["NO_PROXY"])
        self.assertEqual(env["PROMPTFOO_PASS_RATE_THRESHOLD"], "0")

    def test_promptfoo_fallback_config_contains_static_redteam_test(self) -> None:
        request = make_request()
        mappings = feature_mappings_for_engine([FeatureId.prompt_injection], Engine.promptfoo)
        config = build_promptfoo_fallback_config(request, mappings)

        self.assertEqual(config["tests"][0]["metadata"]["pluginId"], "prompt-extraction")
        self.assertEqual(config["tests"][0]["assert"][0]["type"], "promptfoo:redteam:prompt-extraction")
        self.assertEqual(config["defaultTest"]["metadata"]["purpose"], config["redteam"]["purpose"])

    def test_promptfoo_fallback_config_supplies_plugin_required_values(self) -> None:
        request = make_request()
        mappings = feature_mappings_for_engine(
            [FeatureId.indirect_injection, FeatureId.jailbreak, FeatureId.tool_abuse],
            Engine.promptfoo,
        )
        config = build_promptfoo_fallback_config(request, mappings)
        tests = {test["metadata"]["pluginId"]: test for test in config["tests"]}

        self.assertIn("value", tests["indirect-prompt-injection"]["assert"][0])
        self.assertIn(
            "SYSTEM OVERRIDE",
            tests["indirect-prompt-injection"]["assert"][0]["value"],
        )
        self.assertIn("harmbenchBehavior", tests["harmbench"]["metadata"])
        self.assertNotIn("value", tests["tool-discovery"]["assert"][0])

    def test_garak_generator_options_match_request_mode(self) -> None:
        chat_options = build_garak_generator_options(make_request(request_mode="chat"))
        chat_generator = chat_options["rest"]["RestGenerator"]
        self.assertEqual(chat_generator["uri"], "http://127.0.0.1:11434/api/chat")
        self.assertFalse(chat_generator["req_template_json_object"]["think"])
        self.assertEqual(chat_generator["req_template_json_object"]["options"]["num_predict"], 256)
        self.assertEqual(chat_generator["req_template_json_object"]["messages"][0]["content"], "$INPUT")
        self.assertEqual(chat_generator["response_json_field"], "$.message.content")
        self.assertEqual(chat_generator["request_timeout"], 300)

        generate_options = build_garak_generator_options(make_request(request_mode="generate"))
        generate_generator = generate_options["rest"]["RestGenerator"]
        self.assertEqual(generate_generator["uri"], "http://127.0.0.1:11434/api/generate")
        self.assertFalse(generate_generator["req_template_json_object"]["think"])
        self.assertEqual(generate_generator["req_template_json_object"]["options"]["num_predict"], 256)
        self.assertEqual(generate_generator["req_template_json_object"]["prompt"], "$INPUT")
        self.assertEqual(generate_generator["response_json_field"], "$.response")

    def test_garak_request_timeout_is_capped_but_not_tiny(self) -> None:
        default_request = make_request()
        self.assertEqual(garak_request_timeout_seconds(default_request), 300)

        short_request = JobRequest.model_validate(
            {
                "target": {
                    "baseUrl": "http://127.0.0.1:11434/api",
                    "model": "llama3.1",
                    "requestMode": "chat",
                },
                "selections": [{"featureId": "prompt-injection", "engines": ["garak"]}],
                "runOptions": {"engineTimeoutSeconds": 45},
            }
        )
        self.assertEqual(garak_request_timeout_seconds(short_request), 60)

    def test_garak_config_includes_probe_and_buff_specs(self) -> None:
        request = make_request()
        mappings = feature_mappings_for_engine([FeatureId.prompt_injection, FeatureId.jailbreak], Engine.garak)
        with tempfile.TemporaryDirectory() as tmpdir:
            config = build_garak_config(request, mappings, Path(tmpdir), "job_test")

        self.assertIn("promptinject.HijackLongPrompt", config["plugins"]["probe_spec"])
        self.assertIn("dan.Dan_11_0", config["plugins"]["probe_spec"])
        self.assertEqual(config["run"]["soft_probe_prompt_cap"], 1)
        self.assertNotIn("doctor", config["plugins"]["probe_spec"])
        self.assertNotIn("smuggling", config["plugins"]["probe_spec"])
        self.assertIsNone(config["plugins"]["buff_spec"])
        self.assertEqual(config["reporting"]["report_prefix"], "job_test")

    def test_prompt_injection_garak_mapping_is_single_action(self) -> None:
        mappings = feature_mappings_for_engine([FeatureId.prompt_injection], Engine.garak)

        self.assertEqual(mappings["probes"], ["promptinject.HijackLongPrompt"])
        self.assertEqual(mappings["buffs"], [])

    def test_demo_mappings_use_one_attack_per_feature(self) -> None:
        for feature_id in FeatureId:
            promptfoo_mapping = feature_mappings_for_engine([feature_id], Engine.promptfoo)
            garak_mapping = feature_mappings_for_engine([feature_id], Engine.garak)

            self.assertEqual(len(promptfoo_mapping["plugins"]), 1)
            self.assertEqual(promptfoo_mapping["strategies"], ["basic"])
            self.assertEqual(len(garak_mapping["probes"]), 1)
            self.assertEqual(garak_mapping["buffs"], [])

    def test_garak_env_uses_workspace_xdg_dirs(self) -> None:
        request = make_request()
        env = garak_env(request)

        self.assertIn("127.0.0.1", env["NO_PROXY"])
        self.assertIn(".mohican", env["XDG_CONFIG_HOME"])
        self.assertIn(".mohican", env["XDG_DATA_HOME"])
        self.assertIn(".mohican", env["XDG_CACHE_HOME"])
        self.assertEqual(env["REST_API_KEY"], "secret")

    def test_catalog_exposes_engine_mappings(self) -> None:
        catalog = catalog_response()
        self.assertIn("promptfoo", catalog["engines"])
        self.assertIn("garak", catalog["engines"])
        self.assertIn("prompt-injection", catalog["mappings"])
        self.assertIn("plugins", catalog["mappings"]["prompt-injection"]["promptfoo"])
        self.assertIn("probes", catalog["mappings"]["prompt-injection"]["garak"])


if __name__ == "__main__":
    unittest.main()
