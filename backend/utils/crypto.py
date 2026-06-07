import os
import base64
import json
from typing import Optional, Dict

from cryptography.fernet import Fernet, InvalidToken

SECRETS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".secrets"))
ENC_PATH = os.path.join(SECRETS_DIR, "service_account.enc")

def get_fernet_from_env_key() -> Optional[Fernet]:
    key_b64 = os.environ.get("SERVICE_ACCOUNT_ENC_KEY")
    if not key_b64:
        return None
    try:
        # Allow raw key or base64-encoded
        if len(key_b64) == 44 or key_b64.endswith("="):
            key = key_b64.encode()
        else:
            key = base64.urlsafe_b64encode(key_b64.encode())
        return Fernet(key)
    except Exception:
        return None

def save_encrypted_service_account(json_bytes: bytes) -> bool:
    """Encrypt and save service account JSON to backend/.secrets/service_account.enc
    Requires SERVICE_ACCOUNT_ENC_KEY env var to be set.
    """
    fernet = get_fernet_from_env_key()
    if not fernet:
        return False
    os.makedirs(SECRETS_DIR, exist_ok=True)
    token = fernet.encrypt(json_bytes)
    with open(ENC_PATH, "wb") as f:
        f.write(token)
    return True

def load_decrypted_service_account() -> Optional[Dict]:
    """Load and decrypt the stored service account JSON if present and key available."""
    fernet = get_fernet_from_env_key()
    if not fernet:
        return None
    if not os.path.exists(ENC_PATH):
        return None
    try:
        with open(ENC_PATH, "rb") as f:
            token = f.read()
        data = fernet.decrypt(token)
        return json.loads(data)
    except (InvalidToken, Exception):
        return None

def remove_encrypted_service_account() -> bool:
    if os.path.exists(ENC_PATH):
        try:
            os.remove(ENC_PATH)
            return True
        except Exception:
            return False
    return False
