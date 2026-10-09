import json
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from main import (
    AssistantMessage,
    AssistantRequest,
    ask_assistant,
    gemini_configuration,
    get_assistant_status,
)


class FakeProviderResponse:
    def __init__(self, body: dict):
        self.body = json.dumps(body).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return self.body


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[Base.metadata.tables["market_prices"]],
        )
        self.session = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_status_reports_configured_gemini_model_without_exposing_key(self):
        with patch.dict(
            os.environ,
            {
                "GEMINI_API_KEY": "test-secret-key",
                "GEMINI_MODEL": "gemini-test-model",
            },
        ):
            result = get_assistant_status()

        self.assertEqual(
            result,
            {
                "provider": "Gemini",
                "configured": True,
                "model": "gemini-test-model",
            },
        )
        self.assertNotIn("test-secret-key", json.dumps(result))

    def test_placeholder_api_key_is_not_treated_as_configured(self):
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "add-your-gemini-api-key"},
        ):
            self.assertFalse(gemini_configuration()["configured"])
        with patch.dict(os.environ, {"GEMINI_API_KEY": "   "}):
            self.assertFalse(gemini_configuration()["configured"])

    def test_default_model_is_current_gemini_flash(self):
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "test-secret-key"},
            clear=True,
        ):
            self.assertEqual(
                gemini_configuration()["model"],
                "gemini-3.8-flash",
            )

    def test_assistant_sends_user_message_to_gemini_and_returns_text(self):
        fake_response = FakeProviderResponse(
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": "Check your local soil test before planting."}]
                        }
                    }
                ]
            }
        )
        request = AssistantRequest(
            messages=[
                AssistantMessage(
                    role="user",
                    content="How should I prepare soil before planting?",
                )
            ]
        )

        with (
            patch.dict(
                os.environ,
                {
                    "GEMINI_API_KEY": "test-secret-key",
                    "GEMINI_MODEL": "gemini-test-model",
                },
            ),
            patch("main.urlopen", return_value=fake_response) as provider_call,
        ):
            result = ask_assistant(request, current_user=object(), db=self.session)

        provider_request = provider_call.call_args.args[0]
        provider_payload = json.loads(provider_request.data)
        self.assertEqual(
            provider_request.get_header("X-goog-api-key"),
            "test-secret-key",
        )
        self.assertNotIn("test-secret-key", provider_request.full_url)
        self.assertEqual(provider_payload["contents"][0]["role"], "user")
        self.assertIn(
            "Check your local soil test before planting.",
            result["answer"],
        )
        self.assertEqual(result["model"], "gemini-test-model")

    def test_assistant_reports_missing_server_key(self):
        request = AssistantRequest(
            messages=[AssistantMessage(role="user", content="Hello")]
        )
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with self.assertRaises(HTTPException) as raised:
                ask_assistant(request, current_user=object(), db=self.session)
        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("GEMINI_API_KEY", raised.exception.detail)

    def test_provider_http_failure_does_not_return_or_log_api_key(self):
        from urllib.error import HTTPError

        request = AssistantRequest(
            messages=[AssistantMessage(role="user", content="Hello")]
        )
        provider_error = HTTPError(
            "https://generativelanguage.googleapis.com/test",
            403,
            "Forbidden",
            {},
            None,
        )
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret-key"}),
            patch("main.urlopen", side_effect=provider_error),
        ):
            with self.assertRaises(HTTPException) as raised:
                ask_assistant(request, current_user=object(), db=self.session)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("test-secret-key", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
