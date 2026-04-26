from __future__ import annotations

from dataclasses import dataclass

from .models import Engine, FeatureId


@dataclass(frozen=True)
class PromptfooMapping:
    plugins: tuple[str, ...]
    strategies: tuple[str, ...]


@dataclass(frozen=True)
class GarakMapping:
    probes: tuple[str, ...]
    buffs: tuple[str, ...]


PROMPTFOO_FEATURES: dict[FeatureId, PromptfooMapping] = {
    FeatureId.prompt_injection: PromptfooMapping(
        plugins=("prompt-extraction",),
        strategies=("basic",),
    ),
    FeatureId.indirect_injection: PromptfooMapping(
        plugins=("indirect-prompt-injection",),
        strategies=("basic",),
    ),
    FeatureId.jailbreak: PromptfooMapping(
        plugins=("harmbench",),
        strategies=("basic",),
    ),
    FeatureId.tool_abuse: PromptfooMapping(
        plugins=("tool-discovery",),
        strategies=("basic",),
    ),
}


GARAK_FEATURES: dict[FeatureId, GarakMapping] = {
    FeatureId.prompt_injection: GarakMapping(
        probes=("promptinject.HijackLongPrompt",),
        buffs=(),
    ),
    FeatureId.indirect_injection: GarakMapping(
        probes=("latentinjection.LatentInjectionReport",),
        buffs=(),
    ),
    FeatureId.jailbreak: GarakMapping(
        probes=("dan.Dan_11_0",),
        buffs=(),
    ),
    FeatureId.tool_abuse: GarakMapping(
        probes=("packagehallucination.Python",),
        buffs=(),
    ),
}


FEATURE_LABELS: dict[FeatureId, str] = {
    FeatureId.prompt_injection: "Prompt Injection",
    FeatureId.indirect_injection: "Indirect Injection",
    FeatureId.jailbreak: "Jailbreak",
    FeatureId.tool_abuse: "Tool Abuse",
}


RECOMMENDED_ENGINES: dict[FeatureId, tuple[Engine, ...]] = {
    FeatureId.prompt_injection: (Engine.garak, Engine.promptfoo),
    FeatureId.indirect_injection: (Engine.promptfoo,),
    FeatureId.jailbreak: (Engine.promptfoo, Engine.garak),
    FeatureId.tool_abuse: (Engine.promptfoo,),
}


def feature_mappings_for_engine(feature_ids: list[FeatureId], engine: Engine) -> dict[str, list[str]]:
    if engine == Engine.promptfoo:
        plugins: list[str] = []
        strategies: list[str] = []
        for feature_id in feature_ids:
            mapping = PROMPTFOO_FEATURES.get(feature_id)
            if not mapping:
                continue
            plugins.extend(mapping.plugins)
            strategies.extend(mapping.strategies)
        return {
            "plugins": sorted(set(plugins)),
            "strategies": sorted(set(strategies)),
        }
    if engine == Engine.garak:
        probes: list[str] = []
        buffs: list[str] = []
        for feature_id in feature_ids:
            mapping = GARAK_FEATURES.get(feature_id)
            if not mapping:
                continue
            probes.extend(mapping.probes)
            buffs.extend(mapping.buffs)
        return {
            "probes": sorted(set(probes)),
            "buffs": sorted(set(buffs)),
        }
    return {}


def catalog_response() -> dict[str, object]:
    return {
        "engines": [engine.value for engine in (Engine.promptfoo, Engine.garak, Engine.custom_suite)],
        "features": [
            {
                "id": feature_id.value,
                "label": FEATURE_LABELS[feature_id],
                "recommendedEngines": [engine.value for engine in RECOMMENDED_ENGINES[feature_id]],
            }
            for feature_id in FeatureId
        ],
        "mappings": {
            feature_id.value: {
                "promptfoo": {
                    "plugins": list(PROMPTFOO_FEATURES[feature_id].plugins),
                    "strategies": list(PROMPTFOO_FEATURES[feature_id].strategies),
                },
                "garak": {
                    "probes": list(GARAK_FEATURES[feature_id].probes),
                    "buffs": list(GARAK_FEATURES[feature_id].buffs),
                },
            }
            for feature_id in FeatureId
        },
    }
