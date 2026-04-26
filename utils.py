"""
utils.py

Shared utility functions used across the project.

Connects to: app.py (environment loading, input validation)
"""

import os
import re
from pathlib import Path


def load_env_file(path: str = ".env") -> None:
    """
    Load key=value pairs from a .env file into os.environ.
    Does NOT override variables already set in the environment.

    This is a minimal implementation so we don't need python-dotenv.
    """
    env_path = Path(path)
    if not env_path.exists():
        return

    with open(env_path) as f:
        for line in f:
            line = line.strip()
            # Skip comments and blank lines
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # Only set if not already in environment
            if key and key not in os.environ:
                os.environ[key] = value


def sanitize_input(text: str, max_length: int = 500) -> str:
    """
    Basic sanitization of user-provided problem text.

    - Strips leading/trailing whitespace
    - Collapses multiple spaces
    - Truncates to max_length characters

    Args:
        text:       Raw user input string.
        max_length: Maximum allowed length.

    Returns:
        Cleaned input string.
    """
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text[:max_length]


def is_valid_input(text: str, min_length: int = 3) -> tuple[bool, str]:
    """
    Validate that user input is worth sending to the LLM.

    Args:
        text:       The sanitized problem string.
        min_length: Minimum number of characters required.

    Returns:
        (is_valid: bool, error_message: str)
        error_message is empty if valid.
    """
    if not text:
        return False, "Please enter a math problem."
    if len(text) < min_length:
        return False, f"Input is too short (minimum {min_length} characters)."
    if not any(c.isalpha() or c.isdigit() for c in text):
        return False, "Input must contain letters or numbers."
    return True, ""


def format_formulas_as_list(formulas: list[str]) -> str:
    """
    Convert a list of formula strings into a bullet-point markdown string.

    Args:
        formulas: List of formula strings from the solver response.

    Returns:
        Markdown-formatted string.
    """
    if not formulas:
        return "_No formulas returned._"
    return "\n".join(f"- {f}" for f in formulas)
