"""SSL trust bootstrap — call once at process start, before any TLS.

Uses the OS keychain instead of certifi so we work behind corporate
TLS-inspection proxies (e.g. Zscaler) that inject their own CA into the
system trust store."""
from __future__ import annotations

import truststore


def install() -> None:
    truststore.inject_into_ssl()
