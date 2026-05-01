"""
email_ingestion.pipeline.rfi_creator
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
RfiCreator — responsible for all database writes when an inbound email
results in a new RFI (or is saved for manual review).

Keeps every DB write in one place so the pipeline itself stays free of
ORM calls and is easy to unit-test with a mock creator.
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.utils import timezone

from email_ingestion.matching.result import MatchResult
from email_ingestion.models import InboundEmail, InboundEmailAttachment
from email_ingestion.parsing.dataclasses import ParsedEmail
from rfis.models import Rfi, RfiAttachment

logger = logging.getLogger(__name__)

User = get_user_model()


def _next_rfi_number(project) -> str:
    """
    Mirror of the logic in rfis/views.py NextRfiNumberView — kept here
    so the pipeline can generate numbers without an HTTP round-trip.
    """
    numbers = Rfi.objects.filter(project=project).values_list("rfi_number", flat=True)
    max_num = 0
    for rfi_number in numbers:
        m = re.search(r"(\d+)\s*$", rfi_number.strip())
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"RFI-{max_num + 1:03d}"


def _system_user():
    """
    Return the first superuser as the 'author' for auto-created RFIs.
    Falls back to the first user if no superuser exists.
    This is a stand-in; auto-created RFIs are clearly marked via source_email.
    """
    user = User.objects.filter(is_superuser=True).first()
    if user is None:
        user = User.objects.first()
    return user


class RfiCreator:
    """
    Handles all persistence for the ingestion pipeline.

    Methods
    -------
    save_inbound(parsed, match, config, status)
        Persist a raw InboundEmail row regardless of outcome.

    auto_create_rfi(inbound)
        Build an Rfi from a fully-matched InboundEmail and link the two.

    copy_attachments(inbound, rfi)
        Copy InboundEmailAttachments → RfiAttachments on the new RFI.
    """

    # ------------------------------------------------------------------
    # Step 1 — always called first: persist the raw email
    # ------------------------------------------------------------------

    def save_inbound(
        self,
        parsed: ParsedEmail,
        match: MatchResult,
        config,                         # EmailConfig instance
        status: str = InboundEmail.Status.PENDING,
    ) -> InboundEmail:
        """
        Save the parsed email and matching result to InboundEmail.
        Returns the saved instance.
        """
        inbound = InboundEmail.objects.create(
            email_config=config,
            message_id=parsed.message_id,
            received_at=parsed.received_at,
            sender_name=parsed.sender_name,
            sender_email=parsed.sender_email,
            subject=parsed.subject,
            body_text=parsed.body_text,
            project=match.project,
            confidence=match.confidence,
            match_reason=match.reason,
            parsed_rfi_name=self._extract_rfi_name(parsed.subject),
            parsed_question=parsed.body_text,
            parsed_trade="M",   # Default; reviewer can change before approving
            status=status,
        )

        self._save_attachments(parsed, inbound)
        logger.info(
            "Saved InboundEmail #%d — status=%s conf=%.2f project=%s",
            inbound.pk,
            status,
            match.confidence,
            match.project,
        )
        return inbound

    # ------------------------------------------------------------------
    # Step 2 — called only when confidence ≥ threshold
    # ------------------------------------------------------------------

    def auto_create_rfi(self, inbound: InboundEmail) -> Rfi | None:
        """
        Create an Rfi from a high-confidence InboundEmail.
        Updates inbound.status and inbound.rfi on success.
        Returns None if creation fails (logs the error).
        """
        if not inbound.project:
            logger.error("auto_create_rfi called with no project on InboundEmail #%d", inbound.pk)
            return None

        author = _system_user()
        if author is None:
            logger.error("No users in the database — cannot auto-create RFI")
            return None

        rfi_number = _next_rfi_number(inbound.project)
        received = inbound.received_at.date() if inbound.received_at else date.today()
        due = received + timedelta(days=14)   # Default 14-day turnaround

        try:
            rfi = Rfi.objects.create(
                project=inbound.project,
                author=author,
                rfi_number=rfi_number,
                rfi_name=inbound.parsed_rfi_name or inbound.subject[:200],
                trade=inbound.parsed_trade or "M",
                received_date=received,
                due_date=due,
                question=inbound.parsed_question,
                proposed_solution="",
            )
        except Exception:
            logger.exception("Failed to create RFI from InboundEmail #%d", inbound.pk)
            inbound.status = InboundEmail.Status.ERROR
            inbound.error_message = "RFI creation failed — see server logs"
            inbound.save(update_fields=["status", "error_message"])
            return None

        self.copy_attachments(inbound, rfi)

        inbound.rfi = rfi
        inbound.status = InboundEmail.Status.AUTO_CREATED
        inbound.save(update_fields=["rfi", "status"])

        logger.info(
            "Auto-created RFI %s for project %s from InboundEmail #%d",
            rfi.rfi_number,
            inbound.project,
            inbound.pk,
        )
        return rfi

    # ------------------------------------------------------------------
    # Shared helper — also called from the approve API view (Step 6)
    # ------------------------------------------------------------------

    def copy_attachments(self, inbound: InboundEmail, rfi: Rfi) -> None:
        """
        Copy every InboundEmailAttachment to an RfiAttachment on the given RFI.
        """
        for email_att in inbound.attachments.all():
            try:
                content = email_att.file.read()
                rfi_att = RfiAttachment(
                    rfi=rfi,
                    uploaded_by=None,   # External sender — no Member record
                    original_filename=email_att.original_filename,
                    content_type=email_att.content_type,
                    size=email_att.size,
                )
                rfi_att.file.save(
                    email_att.original_filename,
                    ContentFile(content),
                    save=True,
                )
                logger.debug("Copied attachment '%s' to RFI #%d", email_att.original_filename, rfi.pk)
            except Exception:
                logger.exception(
                    "Failed to copy attachment '%s' to RFI #%d",
                    email_att.original_filename,
                    rfi.pk,
                )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_rfi_name(subject: str) -> str:
        """
        Strip common prefixes (Re:, Fwd:, [Project …]) from the subject
        to produce a clean RFI name.
        """
        cleaned = re.sub(r"^(re|fwd?|fw)\s*:\s*", "", subject.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"^\[.*?\]\s*", "", cleaned)   # Strip [bracketed] prefixes
        return cleaned[:200].strip()

    @staticmethod
    def _save_attachments(parsed: ParsedEmail, inbound: InboundEmail) -> None:
        """Persist ParsedAttachment objects to InboundEmailAttachment rows."""
        for att in parsed.attachments:
            try:
                obj = InboundEmailAttachment(
                    inbound_email=inbound,
                    original_filename=att.filename,
                    content_type=att.content_type,
                    size=att.size,
                )
                obj.file.save(att.filename, ContentFile(att.payload), save=True)
            except Exception:
                logger.exception(
                    "Failed to save attachment '%s' for InboundEmail #%d",
                    att.filename,
                    inbound.pk,
                )
