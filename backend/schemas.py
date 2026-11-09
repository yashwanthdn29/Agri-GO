import re

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    role: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if not re.search(r"[A-Z]", password):
            raise ValueError("Password must include an uppercase letter.")
        if not re.search(r"[a-z]", password):
            raise ValueError("Password must include a lowercase letter.")
        if not re.search(r"\d", password):
            raise ValueError("Password must include a number.")
        if not re.search(r"[^A-Za-z0-9]", password):
            raise ValueError("Password must include a symbol.")
        return password


class UserLogin(BaseModel):
    email: EmailStr
    password: str