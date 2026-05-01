"""
email_ingestion.providers.base
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Abstract contract that every email provider must fulfil.

Adding a new provider (e.g. Microsoft Graph API, Postmark webhook) means
subclassing BaseEmailProvider and registering it in factory.py — nothing
else in the system needs to change.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from email_ingestion.parsing.dataclasses import RawEmail


class BaseEmailProvider(ABC):
    """
    Defines the interface between the pipeline and any email source.

    Concrete implementations handle all provider-specific auth, transport,
    and protocol details so the pipeline stays provider-agnostic.
    """

    # ------------------------------------------------------------------
    # Core interface — every provider must implement these
    # ------------------------------------------------------------------

    @abstractmethod
    def fetch_unseen(self) -> list[RawEmail]:
        """
        Connect to the source, retrieve all unseen/unread messages,
        and return them as a list of RawEmail value objects.

        Implementations are responsible for:
        - Authentication
        - Marking retrieved messages as seen so they are not fetched again
        - Handling connection errors gracefully (raise ProviderError)
        """
        ...

    @abstractmethod
    def test_connection(self) -> bool:
        """
        Attempt a lightweight connection to verify credentials.
        Returns True on success, False on failure (does not raise).
        """
        ...

    # ------------------------------------------------------------------
    # Shared helpers — available to all providers
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        """Human-readable provider name for logging."""
        return self.__class__.__name__


class ProviderError(Exception):
    """Raised when a provider cannot connect or fetch messages."""
    pass
