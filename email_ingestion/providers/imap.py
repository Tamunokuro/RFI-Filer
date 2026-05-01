"""
email_ingestion.providers.imap
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
IMAP-based email provider.

Works with any IMAP-over-SSL server:
  - Gmail       → imap.gmail.com:993  (requires an App Password)
  - Outlook 365 → outlook.office365.com:993

Switching between them is purely a config change (host/port/username/password
in the EmailConfig row) — no code changes needed.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime, timezone

from imapclient import IMAPClient
from imapclient.exceptions import IMAPClientError

from email_ingestion.parsing.dataclasses import RawEmail
from email_ingestion.providers.base import BaseEmailProvider, ProviderError

logger = logging.getLogger(__name__)


class ImapEmailProvider(BaseEmailProvider):
    """
    Fetches unseen messages from an IMAP mailbox and returns them as
    RawEmail value objects, ready for the parsing layer.

    Each instance is bound to a single EmailConfig so one poller run
    can handle multiple configs independently.
    """

    # Max emails to fetch in a single poll run — prevents hanging on
    # inboxes with hundreds of unread messages.
    BATCH_SIZE = 20

    # Socket timeout in seconds — if the server goes silent, we bail.
    TIMEOUT_SECONDS = 30

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        mailbox: str = "INBOX",
        gmail_primary_only: bool = False,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._mailbox = mailbox
        self._gmail_primary_only = gmail_primary_only

    @property
    def _is_gmail(self) -> bool:
        return "gmail" in self._host.lower()

    # ------------------------------------------------------------------
    # BaseEmailProvider interface
    # ------------------------------------------------------------------

    def fetch_unseen(self) -> list[RawEmail]:
        """
        Open a connection, search for UNSEEN messages, fetch their raw
        RFC 2822 bytes, mark them SEEN, then close the connection.

        Returns an empty list if the mailbox has no new messages.
        Raises ProviderError on any connection / auth failure.
        """
        raw_emails: list[RawEmail] = []

        try:
            with self._connection() as client:
                client.select_folder(self._mailbox, readonly=False)
                logger.debug(
                    "%s: selected mailbox %s on host %s",
                    self._username,
                    self._mailbox,
                    self._host,
                )
                uids = self._search_unseen(client)

                if not uids:
                    logger.debug(
                        "%s: no unseen messages in %s",
                        self._username,
                        self._mailbox,
                    )
                    return raw_emails

                # Cap to BATCH_SIZE — remaining unseen mail is picked up next run
                batch = uids[: self.BATCH_SIZE]
                if len(uids) > self.BATCH_SIZE:
                    logger.info(
                        "%s: %d unseen message(s) found — fetching first %d (remainder next run)",
                        self._username,
                        len(uids),
                        self.BATCH_SIZE,
                    )
                else:
                    logger.info(
                        "%s: fetching %d unseen message(s) from %s",
                        self._username,
                        len(batch),
                        self._mailbox,
                    )

                response = client.fetch(batch, ["RFC822", "INTERNALDATE"])

                for uid, data in response.items():
                    raw_bytes = data.get(b"RFC822", b"")
                    internal_date: datetime = data.get(b"INTERNALDATE") or datetime.now(
                        tz=timezone.utc
                    )

                    if not raw_bytes:
                        logger.warning("UID %s returned empty RFC822 body — skipping", uid)
                        continue

                    raw_emails.append(
                        RawEmail(
                            uid=str(uid),
                            raw_bytes=raw_bytes,
                            server_received_at=internal_date,
                        )
                    )

                # Mark fetched batch as SEEN so we don't re-process
                client.add_flags(batch, [b"\\Seen"])

        except IMAPClientError as exc:
            raise ProviderError(
                f"IMAP error for {self._username}@{self._host}: {exc}"
            ) from exc
        except OSError as exc:
            raise ProviderError(
                f"Network error connecting to {self._host}:{self._port}: {exc}"
            ) from exc

        return raw_emails

    def test_connection(self) -> bool:
        """
        Try to log in and immediately log out.
        Returns True on success, False on any error (safe to call from admin).
        """
        try:
            with self._connection():
                return True
        except (ProviderError, Exception):
            logger.exception("Connection test failed for %s", self._username)
            return False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _search_unseen(self, client) -> list:
        """
        Return UIDs of unread messages.

        Gmail supports X-GM-RAW search syntax. By default, fetch unread
        messages from the Inbox instead of forcing the Primary tab. This avoids
        accidentally restricting results to a Gmail category such as Promotions.

        If gmail_primary_only=True is explicitly configured, restrict the search
        to Gmail's Primary category.

        Falls back to standard IMAP UNSEEN for non-Gmail providers or if Gmail
        raw search fails.
        """
        if self._is_gmail:
            gmail_query = (
                "category:primary is:unread"
                if self._gmail_primary_only
                else "in:inbox is:unread"
            )

            try:
                uids = client.gmail_search(gmail_query)
                logger.debug(
                    "%s: gmail_search(%r) returned %d UID(s)",
                    self._username,
                    gmail_query,
                    len(uids),
                )
                return uids
            except Exception:
                logger.warning(
                    "gmail_search failed for %s using query %r — falling back to standard UNSEEN search",
                    self._username,
                    gmail_query,
                )

        uids = client.search(["UNSEEN"])
        logger.debug(
            "%s: standard IMAP UNSEEN search returned %d UID(s)",
            self._username,
            len(uids),
        )
        return uids

    @contextmanager
    def _connection(self):
        """
        Context manager that opens an authenticated IMAPClient session
        and guarantees logout even if an exception is raised.
        """
        client = IMAPClient(
            host=self._host,
            port=self._port,
            ssl=True,
            timeout=self.TIMEOUT_SECONDS,
        )
        try:
            client.login(self._username, self._password)
            yield client
        finally:
            try:
                client.logout()
            except Exception:
                pass  # Best-effort logout; original exception takes priority
