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
from datetime import timezone

from django.utils import timezone as dj_timezone

from email_ingestion.matching.composite import CompositeProjectMatcher
from email_ingestion.models import EmailConfig, InboundEmail
from email_ingestion.parsing.mime import MimeEmailParser
from email_ingestion.pipeline.rfi_creator import RfiCreator
from email_ingestion.providers.base import ProviderError
from email_ingestion.providers.factory import get_provider

logger = logging.getLogger(__name__)


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
        """Process a single EmailConfig. Returns number of emails processed."""
        return self._process_config(config)

    # ------------------------------------------------------------------
    # Internal orchestration
    # ------------------------------------------------------------------

    def _process_config(self, config: EmailConfig) -> int:
        logger.info("Processing config: %s (%s)", config.label, config.username)
        processed = 0

        try:
            provider = get_provider(config)
            raw_emails = provider.fetch_unseen()
        except ProviderError as exc:
            logger.error("Provider error for '%s': %s", config.label, exc)
            return 0

        for raw in raw_emails:
            try:
                self._process_single(raw, config)
                processed += 1
            except Exception:
                logger.exception(
                    "Unhandled error processing UID %s from '%s'",
                    raw.uid,
                    config.label,
                )

        # Stamp the last-polled timestamp
        config.last_polled_at = dj_timezone.now()
        config.save(update_fields=["last_polled_at"])

        logger.info(
            "Config '%s' done — %d email(s) processed.", config.label, processed
        )
        return processed

    def _process_single(self, raw, config: EmailConfig) -> None:
        """Parse, match, dedup, and persist one raw email."""

        parsed = self._parser.parse(raw)

        # --- Deduplication ---
        if InboundEmail.objects.filter(message_id=parsed.message_id).exists():
            logger.debug("Skipping duplicate message_id: %s", parsed.message_id)
            return

        match = self._matcher.match(parsed)

        logger.info(
            "Email '%s' from %s → project=%s conf=%.2f",
            parsed.subject[:60],
            parsed.sender_email,
            match.project,
            match.confidence,
        )

        # --- Decide status before saving ---
        if match.confidence >= config.auto_create_threshold and match.project:
            status = InboundEmail.Status.PENDING   # Will be updated to AUTO_CREATED below
        else:
            status = InboundEmail.Status.PENDING

        inbound = self._creator.save_inbound(parsed, match, config, status=status)

        # --- Auto-create RFI if confidence meets the threshold ---
        if match.confidence >= config.auto_create_threshold and match.project:
            self._creator.auto_create_rfi(inbound)
