import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

from auth import ALGORITHM, SECRET_KEY
from dependencies import get_current_user


class AuthenticationTests(unittest.TestCase):
    def credentials_for(self, claims: dict) -> HTTPAuthorizationCredentials:
        token = jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def test_expired_token_returns_sign_in_guidance(self):
        credentials = self.credentials_for(
            {
                "sub": "1",
                "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
            }
        )

        with self.assertRaises(HTTPException) as raised:
            get_current_user(credentials, db=Mock())

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(
            raised.exception.detail,
            "Session expired. Please sign in again.",
        )

    def test_invalid_subject_returns_unauthorized_instead_of_server_error(self):
        credentials = self.credentials_for(
            {
                "sub": "not-a-user-id",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            }
        )

        with self.assertRaises(HTTPException) as raised:
            get_current_user(credentials, db=Mock())

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail, "Invalid authentication token")


if __name__ == "__main__":
    unittest.main()
