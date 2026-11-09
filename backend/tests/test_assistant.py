import json
import os
import unittest
from urllib.error import HTTPError
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from main import (
    AssistantMessage,
    AssistantRequest,
    GEMINI_FALLBACK_MODEL,
    GEMINI_REQUEST_TIMEOUT_SECONDS,
    ask_assistant,
    gemini_configuration,
    get_assistant_status,
    market_context_for_assistant,
)
from sqlalchemy.exc import SQLAlchemyError


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

        self.assertEqual(
            provider_call.call_args.kwargs["timeout"],
            GEMINI_REQUEST_TIMEOUT_SECONDS,
        )
        provider_request = provider_call.call_args.args[0]
        provider_payload = json.loads(provider_request.data)
        self.assertEqual(
            provider_request.get_header("X-goog-api-key"),
            "test-secret-key",
        )
        self.assertNotIn("test-secret-key", provider_request.full_url)
        self.assertEqual(provider_payload["contents"][0]["role"], "user")
        self.assertEqual(
            provider_payload["generationConfig"]["thinkingConfig"]["thinkingLevel"],
            "low",
        )
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

    def test_non_market_question_does_not_query_market_database(self):
        class NoQueryDatabase:
            def query(self, *args):
                raise AssertionError("non-market questions should skip market lookup")

        self.assertIsNone(
            market_context_for_assistant(
                NoQueryDatabase(),
                "How can I improve soil health?",
            )
        )

    def test_market_database_failure_does_not_block_assistant_context(self):
        class UnavailableDatabase:
            def query(self, *args):
                raise SQLAlchemyError("database unavailable")

        context = market_context_for_assistant(
            UnavailableDatabase(),
            "What is the latest tomato price?",
        )

        self.assertIn("market-data lookup is temporarily unavailable", context)
        self.assertIn("Do not provide a price estimate", context)

    def test_provider_http_failure_does_not_return_or_log_api_key(self):
        request = AssistantRequest(
            messages=[AssistantMessage(role="user", content="Hello")]
        )
        provider_error = HTTPError(
            "https://generativelanguage.googleapis.com/test",
            401,
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
        self.assertIn("not authorized", raised.exception.detail)
        self.assertNotIn("test-secret-key", raised.exception.detail)

    def test_provider_http_errors_identify_model_and_quota_problems(self):
        request = AssistantRequest(
            messages=[AssistantMessage(role="user", content="Hello")]
        )
        expected_details = {
            404: "could not find the configured model",
            429: "quota or rate limit reached",
            503: "temporarily unavailable (HTTP 503)",
        }

        for status_code, expected_detail in expected_details.items():
            with self.subTest(status_code=status_code):
                provider_error = HTTPError(
                    "https://generativelanguage.googleapis.com/test",
                    status_code,
                    "Provider error",
                    {},
                    None,
                )
                with (
                    patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret-key"}),
                    patch("main.urlopen", side_effect=provider_error),
                ):
                    with self.assertRaises(HTTPException) as raised:
                        ask_assistant(
                            request,
                            current_user=object(),
                            db=self.session,
                        )

                self.assertEqual(raised.exception.status_code, 502)
                self.assertIn(expected_detail, raised.exception.detail)

    def test_assistant_reports_provider_timeout(self):
        request = AssistantRequest(
            messages=[AssistantMessage(role="user", content="Hello")]
        )
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret-key"}),
            patch("main.urlopen", side_effect=TimeoutError) as provider_call,
        ):
            with self.assertRaises(HTTPException) as raised:
                ask_assistant(request, current_user=object(), db=self.session)

        self.assertEqual(
            provider_call.call_args.kwargs["timeout"],
            GEMINI_REQUEST_TIMEOUT_SECONDS,
        )
        self.assertEqual(raised.exception.status_code, 504)
        self.assertIn("configured and fallback models", raised.exception.detail)
        self.assertEqual(provider_call.call_count, 2)

    def test_assistant_retries_timed_out_model_with_fast_fallback(self):
        fake_response = FakeProviderResponse(
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": "Add compost after checking soil needs."}]
                        }
                    }
                ]
            }
        )
        request = AssistantRequest(
            messages=[AssistantMessage(role="user", content="How do I improve soil?")]
        )

        with (
            patch.dict(
                os.environ,
                {
                    "GEMINI_API_KEY": "test-secret-key",
                    "GEMINI_MODEL": "gemini-primary-test",
                },
            ),
            patch(
                "main.urlopen",
                side_effect=[TimeoutError, fake_response],
            ) as provider_call,
        ):
            result = ask_assistant(request, current_user=object(), db=self.session)

        self.assertEqual(provider_call.call_count, 2)
        self.assertIn("models/gemini-primary-test:", provider_call.call_args_list[0].args[0].full_url)
        self.assertIn(
            f"models/{GEMINI_FALLBACK_MODEL}:",
            provider_call.call_args_list[1].args[0].full_url,
        )
        self.assertEqual(result["model"], GEMINI_FALLBACK_MODEL)

    def test_assistant_retries_temporary_provider_error_with_fast_fallback(self):
        fake_response = FakeProviderResponse(
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": "Test your soil before planting."}]
                        }
                    }
                ]
            }
        )
        provider_error = HTTPError(
            "https://generativelanguage.googleapis.com/test",
            503,
            "Service Unavailable",
            {},
            None,
        )
        request = AssistantRequest(
            messages=[AssistantMessage(role="user", content="How do I prepare soil?")]
        )

        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret-key"}),
            patch(
                "main.urlopen",
                side_effect=[provider_error, fake_response],
            ) as provider_call,
        ):
            result = ask_assistant(request, current_user=object(), db=self.session)

        self.assertEqual(provider_call.call_count, 2)
        self.assertEqual(result["model"], GEMINI_FALLBACK_MODEL)


if __name__ == "__main__":
    unittest.main()
