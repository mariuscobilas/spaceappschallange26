import json
import sys
import unittest
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from shared.python.schemas import MeridianChatRequest


class MeridianChatContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((REPO_ROOT / "shared/payloads/meridian-chat-request.json").read_text())

    def test_shared_fixture_is_valid_and_optional_context_can_be_omitted(self):
        parsed = MeridianChatRequest.model_validate(self.fixture)
        self.assertEqual(parsed.messages[0].role, "user")

        payload = deepcopy(self.fixture)
        payload["context"].pop("fieldId")
        payload["context"].pop("plan")
        self.assertIsNone(MeridianChatRequest.model_validate(payload).context.plan)

    def test_rejects_non_user_or_assistant_roles_and_extra_fields(self):
        for role in ("system", "tool"):
            payload = deepcopy(self.fixture)
            payload["messages"][0]["role"] = role
            with self.subTest(role=role), self.assertRaises(ValueError):
                MeridianChatRequest.model_validate(payload)

        payload = deepcopy(self.fixture)
        payload["provider"] = "caller-selected"
        with self.assertRaises(ValueError):
            MeridianChatRequest.model_validate(payload)

        payload = deepcopy(self.fixture)
        payload["messages"][0]["parts"][0]["type"] = "tool-result"
        with self.assertRaises(ValueError):
            MeridianChatRequest.model_validate(payload)

    def test_rejects_invalid_dates_and_coordinates(self):
        invalid_payloads = []

        malformed_date = deepcopy(self.fixture)
        malformed_date["context"]["observationDate"] = "2026-02-30"
        invalid_payloads.append(malformed_date)

        future_date = deepcopy(self.fixture)
        future_date["context"]["observationDate"] = (date.today() + timedelta(days=1)).isoformat()
        invalid_payloads.append(future_date)

        out_of_range = deepcopy(self.fixture)
        out_of_range["context"]["latitude"] = 51.0
        invalid_payloads.append(out_of_range)

        coerced_string = deepcopy(self.fixture)
        coerced_string["context"]["latitude"] = "38.5"
        invalid_payloads.append(coerced_string)

        for payload in invalid_payloads:
            with self.subTest(context=payload["context"]), self.assertRaises(ValueError):
                MeridianChatRequest.model_validate(payload)

    def test_rejects_invalid_plan_limits_and_text_part_sizes(self):
        empty_crop = deepcopy(self.fixture)
        empty_crop["context"]["plan"]["coverCrop"] = ""
        with self.assertRaises(ValueError):
            MeridianChatRequest.model_validate(empty_crop)

        bool_termination = deepcopy(self.fixture)
        bool_termination["context"]["plan"]["terminationDays"] = True
        with self.assertRaises(ValueError):
            MeridianChatRequest.model_validate(bool_termination)

        oversized_text = deepcopy(self.fixture)
        oversized_text["messages"][0]["parts"][0]["text"] = "x" * 16001
        with self.assertRaises(ValueError):
            MeridianChatRequest.model_validate(oversized_text)


if __name__ == "__main__":
    unittest.main()
