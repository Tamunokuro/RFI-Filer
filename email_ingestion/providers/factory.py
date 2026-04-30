"""
email_ingestion.providers.factory
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Factory function that maps an EmailConfig to the correct provider instance.

To add a new provider (e.g. Microsoft Graph API):
  1. Create email_ingestion/providers/graph.py with a GraphEmailProvider class
  2. Add an entry to _PROVIDER_MAP below
  3. Done — nothing else in the system needs to change.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from email_ingestion.providers.base import BaseEmailProvider
from email_ingestion.providers.imap import ImapEmailProvider

if TYPE_CHECKING:
    from email_ingestion.models import EmailConfig

logger = logging.getLogger(__name__)

# Registry: EmailConfig.provider value → provider class
# Add new providers here.
_PROVIDER_MAP: dict[str, type[BaseEmailProvider]] = {
    "gmail": ImapEmailProvider,
    "outlook": ImapEmailProvider,   # Outlook IMAP — same protocol, different host
    "other": ImapEmailProvider,
}


def get_provider(config: EmailConfig) -> BaseEmailProvider:
    """
    Instantiate and return the correct BaseEmailProvider for the given
    EmailConfig.

    Raises ValueError if the provider type is unknown.
    """
    provider_cls = _PROVIDER_MAP.get(config.provider)

    if provider_cls is None:
        raise ValueError(
            f"Unknown provider '{config.provider}' for config '{config.label}'. "
            f"Registered providers: {list(_PROVIDER_MAP)}"
        )

    logger.debug(
        "Using provider %s for config '%s' (%s)",
        provider_cls.__name__,
        config.label,
        config.username,
    )

    return provider_cls(
        host=config.imap_host,
        port=config.imap_port,
        username=config.username,
        password=config.password,
        mailbox=config.mailbox,
        gmail_primary_only=getattr(config, "gmail_primary_only", True),
    )
