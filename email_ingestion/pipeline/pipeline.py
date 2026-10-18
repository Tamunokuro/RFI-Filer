"""
email_ingestion.pipeline.pipeline
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
EmailIngestionPipeline — the single entry point that wires every layer together.

Flow per email config
---------------------
1. get_provider(config)            → BaseEmailProvider
2. provider.fetch_unseen()         → list[RawEmail]
3. MimeEmailParser.parse(raw)      → ParsedEmail
4. CompositeProjectMatcher.match() → MatchResult
5. Dedup check (message_id)
6. RfiCreator.save_inbound()       → InboundEmail
7a. confidence ≥ threshold  → RfiCreator.auto_create_rfi()
7b. confidence <  threshold → leave as PENDING for manual review

The pipeline is intentionally free of ORM imports beyond the EmailConfig
query — all DB writes are delegated to RfiCreator.
"""

from __future__ import annotations

import logging
import re as _re
from datetime import timezone

from django.utils import timezone as dj_timezone

from email_ingestion.matching.composite import CompositeProjectMatcher
from email_ingestion.models import EmailConfig, EmailFolder, InboundEmail
from email_ingestion.parsing.dataclasses import ParsedEmail
from email_ingestion.parsing.mime import MimeEmailParser
from email_ingestion.pipeline.rfi_creator import RfiCreator
from email_ingestion.providers.base import ProviderError
from email_ingestion.providers.factory import get_provider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Email type detection
# ---------------------------------------------------------------------------

_RFI_KEYWORDS: list[str] = [
    "rfi", "request for information", "request for info",
    "clarification request", "rfi-", "rfi –", "rfi –",
]

_PCN_KEYWORDS: list[str] = [
    "pcn", "project change notice", "change notice", "change order",
    "co-", "pcn-", "si-", "site instruction", "change directive", "cd-",
    "construction change directive", "supplemental instruction",
]

# Sender domains that indicate app / system notification emails
_APP_SENDER_DOMAINS: list[str] = [
    "asana.com", "jira.atlassian.net", "atlassian.net", "github.com",
    "gitlab.com", "monday.com", "basecamp.com", "trello.com",
    "slack.com", "teams.microsoft.com", "notifications.microsoft.com",
    "zapier.com", "hubspot.com", "salesforce.com", "notion.so",
    "linear.app", "clickup.com",
]


def _detect_email_type(parsed: ParsedEmail) -> str:
    """
    Classify an email as rfi / pcn / app_email / other.

    Checks are ordered from most-specific to least-specific:
    1. App notification (sender domain match)
    2. PCN / contract change (keyword match)
    3. RFI (keyword match)
    4. Other
    """
    subject_lower = (parsed.subject or "").lower()
    body_lower    = (parsed.body_text or "")[:500].lower()
    sender_lower  = (parsed.sender_email or "").lower()
    combined      = f"{subject_lower} {body_lower}"

    # App notifications — check sender domain first (most reliable signal)
    if any(domain in sender_lower for domain in _APP_SENDER_DOMAINS):
        return InboundEmail.EmailType.APP_EMAIL

    # PCN / contract change
    if any(kw in combined for kw in _PCN_KEYWORDS):
        return InboundEmail.EmailType.PCN

    # RFI
    if any(kw in combined for kw in _RFI_KEYWORDS):
        return InboundEmail.EmailType.RFI

    return InboundEmail.EmailType.OTHER


def _alnum(text: str) -> str:
    """Strip everything except letters/digits — used for fuzzy keyword matching."""
    return _re.sub(r"[^a-z0-9]", "", text.lower())


def _match_folder(parsed: ParsedEmail) -> "EmailFolder | None":
    """
    Find the first EmailFolder whose keywords appear in the email.

    Matching strategy (tried in order until one hits):
      1. Exact substring — keyword appears verbatim in sender + subject + body.
      2. Normalised substring — all non-alphanumeric chars stripped from both
         keyword and text before comparing.  This makes "GCKey Sign-In" match
         "GC Key Sign-In", "GCKEY SIGN IN", "GCKey-SignIn", etc.
         Only applied when the stripped keyword is ≥ 5 chars (avoids false
         positives from very short tokens like "in", "at", "no").

    Text checked: sender_email + subject + first 400 chars of body.
    """
    folders = list(EmailFolder.objects.all())
    if not folders:
        return None

    sender_lower  = (parsed.sender_email or "").lower()
    subject_lower = (parsed.subject or "").lower()
    body_lower    = (parsed.body_text or "")[:400].lower()
    check_text    = f"{sender_lower} {subject_lower} {body_lower}"
    check_alnum   = _alnum(check_text)

    for folder in folders:
        for kw in (folder.keywords or []):
            if not kw:
                continue
            kw_lower = kw.lower()
            # 1. Exact substring
            if kw_lower in check_text:
                return folder
            # 2. Normalised (strips spaces, hyphens, punctuation)
            kw_alnum = _alnum(kw)
            if len(kw_alnum) >= 5 and kw_alnum in check_alnum:
                return folder

    return None


class EmailIngestionPipeline:
    """
    Processes all active EmailConfigs in one run.

    Designed to be instantiated fresh per management-command invocation so
    there is no stale state between cron runs.

    Dependencies are injected so the pipeline is testable without real
    IMAP connections or a live database.
    """

    def __init__(
        self,
        parser: MimeEmailParser | None = None,
        matcher: CompositeProjectMatcher | None = None,
        creator: RfiCreator | None = None,
    ) -> None:
        self._parser = parser or MimeEmailParser()
        self._matcher = matcher or CompositeProjectMatcher()
        self._creator = creator or RfiCreator()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_all(self) -> dict[str, int]:
        """
        Process every active EmailConfig.
        Returns a summary dict: {config_label: emails_processed}.
        """
        configs = EmailConfig.objects.filter(is_active=True)
        if not configs.exists():
            logger.info("No active email configs found — nothing to do.")
            return {}

        summary: dict[str, int] = {}
        for config in configs:
            count = self._process_config(config)
            summary[config.label] = count

        return summary

    def run_one(self, config: EmailConfig) -> int:
        """
        Process a single EmailConfig. Returns number of emails processed.

        Unlike run_all (cron), provider errors are re-raised so an on-demand
        poll can tell the user their connection failed instead of silently
        reporting "0 new emails".
        """
        return self._process_config(config, reraise_provider_errors=True)

    # ------------------------------------------------------------------
    # Internal orchestration
    # ------------------------------------------------------------------

    def _process_config(
        self, config: EmailConfig, reraise_provider_errors: bool = False
    ) -> int:
        logger.info("Processing config: %s (%s)", config.label, config.username)
        processed = 0
        provider_error: ProviderError | None = None

        try:
            provider = get_provider(config)
            raw_emails = provider.fetch_unseen()
        except ProviderError as exc:
            logger.error("Provider error for '%s': %s", config.label, exc)
            provider_error = exc
            raw_emails = []   # fall through so last_polled_at is always stamped

        for raw in raw_emails:
            try:
                if self._process_single(raw, config):
                    processed += 1
            except Exception:
                logger.exception(
                    "Unhandled error processing UID %s from '%s'",
                    raw.uid,
                    config.label,
                )

        # Always stamp — even when the connection failed — so the UI shows
        # "Last polled: <time>" rather than "Never" after every attempt.
        config.last_polled_at = dj_timezone.now()
        config.save(update_fields=["last_polled_at"])

        if provider_error is not None and reraise_provider_errors:
            raise provider_error

        logger.info(
            "Config '%s' done — %d email(s) processed.", config.label, processed
        )
        return processed

    def _process_single(self, raw, config: EmailConfig) -> bool:
        """Parse, classify, match, dedup, and persist one raw email.

        Returns True if a new InboundEmail was saved, False for duplicates.
        """

        parsed = self._parser.parse(raw)

        # --- Deduplication ---
        if InboundEmail.objects.filter(message_id=parsed.message_id).exists():
            logger.debug("Skipping duplicate message_id: %s", parsed.message_id)
            return False

        # --- Classify email type ---
        email_type = _detect_email_type(parsed)

        # --- Project matching (still run for all types — useful for PCNs too) ---
        match = self._matcher.match(parsed)

        logger.info(
            "Email '%s' from %s → type=%s project=%s conf=%.2f",
            parsed.subject[:60],
            parsed.sender_email,
            email_type,
            match.project,
            match.confidence,
        )

        # --- Decide status ---
        if email_type == InboundEmail.EmailType.APP_EMAIL:
            initial_status = InboundEmail.Status.FILED
        else:
            initial_status = InboundEmail.Status.PENDING

        inbound = self._creator.save_inbound(parsed, match, config, status=initial_status)

        # --- Set email type ---
        inbound.email_type = email_type
        update_fields = ["email_type"]

        # --- Assign folder for ANY matching email (not just app emails) ---
        # Folder keywords act as an organisational tag regardless of type.
        # APP_EMAIL status was already set to FILED above; other types stay PENDING.
        folder = _match_folder(parsed)
        if folder:
            inbound.folder = folder
            update_fields.append("folder")
            logger.info(
                "Assigned InboundEmail #%d to folder '%s'", inbound.pk, folder.name
            )

        inbound.save(update_fields=update_fields)

        # --- Auto-create RFI if it's an RFI type and confidence meets threshold ---
        if (
            email_type in (InboundEmail.EmailType.RFI, InboundEmail.EmailType.OTHER)
            and match.confidence >= config.auto_create_threshold
            and match.project
        ):
            self._creator.auto_create_rfi(inbound)
        elif email_type == InboundEmail.EmailType.PCN:
            # PCN emails stay PENDING for manual review — they need to be
            # linked to a specific RFI response before a ContractChange is raised.
            logger.info(
                "InboundEmail #%d detected as PCN — left in PENDING for manual review.",
                inbound.pk,
            )

        return True
