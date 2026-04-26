from __future__ import annotations

import time
import unittest

try:
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - optional test dependency guard
    TestClient = None

from mohican_backend.main import app


class ApiTests(unittest.TestCase):
    @unittest.skipIf(TestClient is None, "fastapi test client is unavailable")
    def test_dry_run_job_completes_without_external_engines(self) -> None:
        request = {
            "target": {
                "baseUrl": "http://127.0.0.1:11434/api",
                "apiKey": "",
                "model": "llama3.1",
                "requestMode": "chat",
            },
            "selections": [
                {"featureId": "prompt-injection", "engines": ["promptfoo", "garak"]},
                {"featureId": "jailbreak", "engines": ["promptfoo"]},
            ],
            "runOptions": {
                "numTests": 2,
                "maxConcurrency": 1,
                "dryRun": True,
            },
        }

        with TestClient(app) as client:
            create_response = client.post("/api/jobs", json=request)
            self.assertEqual(create_response.status_code, 200)
            job_id = create_response.json()["jobId"]

            snapshot = None
            for _ in range(50):
                snapshot_response = client.get(f"/api/jobs/{job_id}")
                self.assertEqual(snapshot_response.status_code, 200)
                snapshot = snapshot_response.json()
                if snapshot["status"] == "completed":
                    break
                time.sleep(0.1)

            self.assertIsNotNone(snapshot)
            self.assertEqual(snapshot["status"], "completed")
            result_response = client.get(f"/api/jobs/{job_id}/result")
            self.assertEqual(result_response.status_code, 200)
            result = result_response.json()
            self.assertEqual(result["status"], "completed")
            self.assertEqual({item["engine"] for item in result["engineResults"]}, {"promptfoo", "garak"})
            artifact_types = {item["type"] for item in result["artifacts"]}
            self.assertIn("promptfoo-config", artifact_types)
            self.assertIn("garak-config", artifact_types)


if __name__ == "__main__":
    unittest.main()
