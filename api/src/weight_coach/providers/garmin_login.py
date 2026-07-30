"""One-shot: python -m weight_coach.providers.garmin_login

Interactive: enters your Garmin Connect email + password, handles the MFA
code prompt, then dumps OAuth tokens to GARMIN_TOKENSTORE. Subsequent
non-interactive runs (worker, sync endpoint) use those tokens."""
import os
from getpass import getpass

from .. import http as _http
_http.install()

from garminconnect import Garmin

from ..config import settings


def main() -> None:
    email = settings.garmin_email or input("Garmin email: ").strip()
    password = settings.garmin_password or getpass("Garmin password: ")
    tokenstore = os.path.expanduser(settings.garmin_tokenstore)
    os.makedirs(tokenstore, exist_ok=True)

    g = Garmin(email=email, password=password, is_cn=False, prompt_mfa=lambda: input("MFA code: "))
    # Passing the tokenstore path makes garminconnect both authenticate AND persist
    # tokens to that directory in one call.
    g.login(tokenstore)
    print(f"Tokens cached to {tokenstore}")

    try:
        full = g.get_full_name()
        print(f"Logged in as: {full}")
    except Exception as e:
        print(f"(sanity check failed: {e})")


if __name__ == "__main__":
    main()
