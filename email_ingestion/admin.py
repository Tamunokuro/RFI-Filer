"""
email_ingestion.admin
~~~~~~~~~~~~~~~~~~~~~~
Django admin configuration for the email ingestion app.

Provides the team with:
  - Full audit log of every inbound email
  - Inline attachment preview
  - Bulk actions (approve, reject, retry matching)
  - Connection testing directly from the EmailConfig change page
  - Clear confidence-score colouring in the list view
"""

from __future__ import annotations

import logging

from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from .models import EmailConfig, InboundEmail, InboundEmailAttachment
from .matching.composite import CompositeProjectMatcher
from .parsing.dataclasses import ParsedEmail
from .pipeline.rfi_creator import RfiCreator
from .providers.factory import get_provider
from .providers.base import ProviderError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _confidence_badge(confidence: float) -> str:
    """Return a coloured HTML badge for a confidence score."""
    pct = int(confidence * 100)
    if confidence >= 0.85:
        colour = "#16a34a"   # green-600
    elif confidence >= 0.65:
        colour = "#d97706"   # amber-600
    else:
        colour = "#dc2626"   # red-600
    return format_html(
        '<span style="background:{};color:#fff;padding:2px 8px;border-radius:4px;'
        'font-size:12px;font-weight:600;">{} %</span>',
        colour,
        pct,
    )


# ---------------------------------------------------------------------------
# InboundEmailAttachment — inline
# ---------------------------------------------------------------------------

class InboundEmailAttachmentInline(admin.TabularInline):
    model = InboundEmailAttachment
    extra = 0
    readonly_fields = ["original_filename", "content_type", "size", "file_link"]
    fields = ["original_filename", "content_type", "size", "file_link"]
    can_delete = False

    @admin.display(description="Download")
    def file_link(self, obj):
        if obj.file:
            return format_html('<a href="{}" target="_blank">Download</a>', obj.file.url)
        return "—"


# ---------------------------------------------------------------------------
# InboundEmail
# ---------------------------------------------------------------------------

@admin.register(InboundEmail)
class InboundEmailAdmin(admin.ModelAdmin):
    # --- List view ---
    list_display = [
        "id",
        "received_at",
        "sender_email",
        "subject_truncated",
        "project",
        "confidence_badge",
        "status_badge",
        "attachment_count",
    ]
    list_filter = ["status", "email_config", "project"]
    search_fields = ["sender_email", "sender_name", "subject", "body_text"]
    ordering = ["-received_at"]
    date_hierarchy = "received_at"
    list_per_page = 30

    # --- Detail view ---
    readonly_fields = [
        "message_id",
        "fetched_at",
        "received_at",
        "sender_name",
        "sender_email",
        "subject",
        "body_text",
        "confidence",
        "confidence_badge",
        "match_reason",
        "status",
        "rfi",
        "rejection_reason",
        "error_message",
        "email_config",
    ]
    fieldsets = [
        ("Email", {
            "fields": [
                "email_config",
                "message_id",
                "received_at",
                "fetched_at",
                "sender_name",
                "sender_email",
                "subject",
                "body_text",
            ]
        }),
        ("Project Matching", {
            "fields": [
                "project",
                "confidence",
                "confidence_badge",
                "match_reason",
            ]
        }),
        ("Parsed RFI Fields", {
            "fields": [
                "parsed_rfi_name",
                "parsed_question",
                "parsed_trade",
            ]
        }),
        ("Outcome", {
            "fields": [
                "status",
                "rfi",
                "rejection_reason",
                "error_message",
            ]
        }),
    ]
    inlines = [InboundEmailAttachmentInline]

    # --- Bulk actions ---
    actions = ["action_approve", "action_reject", "action_retry_matching"]

    # --- Custom list columns ---

    @admin.display(description="Subject")
    def subject_truncated(self, obj):
        return obj.subject[:60] + "…" if len(obj.subject) > 60 else obj.subject

    @admin.display(description="Confidence")
    def confidence_badge(self, obj):
        return mark_safe(_confidence_badge(obj.confidence))

    @admin.display(description="Status")
    def status_badge(self, obj):
        colours = {
            InboundEmail.Status.PENDING:      "#6366f1",  # indigo
            InboundEmail.Status.AUTO_CREATED: "#16a34a",  # green
            InboundEmail.Status.APPROVED:     "#0284c7",  # blue
            InboundEmail.Status.REJECTED:     "#dc2626",  # red
            InboundEmail.Status.ERROR:        "#d97706",  # amber
        }
        colour = colours.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 8px;border-radius:4px;'
            'font-size:12px;font-weight:600;">{}</span>',
            colour,
            obj.get_status_display(),
        )

    @admin.display(description="Attachments")
    def attachment_count(self, obj):
        count = obj.attachments.count()
        return count if count else "—"

    # --- Bulk actions ---

    @admin.action(description="✅ Approve selected emails → create RFIs")
    def action_approve(self, request, queryset):
        creator = RfiCreator()
        approved = 0
        skipped = 0
        for inbound in queryset:
            if inbound.status not in (InboundEmail.Status.PENDING, InboundEmail.Status.ERROR):
                skipped += 1
                continue
            if not inbound.project:
                self.message_user(
                    request,
                    f"Email #{inbound.pk} has no matched project — assign one first.",
                    level=messages.WARNING,
                )
                skipped += 1
                continue
            rfi = creator.auto_create_rfi(inbound)
            if rfi:
                inbound.refresh_from_db()
                inbound.status = InboundEmail.Status.APPROVED
                inbound.save(update_fields=["status"])
                approved += 1
            else:
                skipped += 1

        if approved:
            self.message_user(request, f"{approved} RFI(s) created successfully.", messages.SUCCESS)
        if skipped:
            self.message_user(request, f"{skipped} email(s) skipped (check logs).", messages.WARNING)

    @admin.action(description="❌ Reject selected emails")
    def action_reject(self, request, queryset):
        updated = queryset.filter(
            status__in=[InboundEmail.Status.PENDING, InboundEmail.Status.ERROR]
        ).update(status=InboundEmail.Status.REJECTED)
        self.message_user(request, f"{updated} email(s) marked as rejected.", messages.SUCCESS)

    @admin.action(description="🔄 Retry project matching on selected emails")
    def action_retry_matching(self, request, queryset):
        matcher = CompositeProjectMatcher()
        retried = 0
        for inbound in queryset.filter(
            status__in=[InboundEmail.Status.PENDING, InboundEmail.Status.ERROR]
        ):
            pseudo = ParsedEmail(
                message_id=inbound.message_id,
                received_at=inbound.received_at,
                sender_name=inbound.sender_name,
                sender_email=inbound.sender_email,
                subject=inbound.subject,
                body_text=inbound.body_text,
            )
            match = matcher.match(pseudo)
            inbound.project = match.project
            inbound.confidence = match.confidence
            inbound.match_reason = match.reason
            inbound.status = InboundEmail.Status.PENDING
            inbound.error_message = ""
            inbound.save(update_fields=[
                "project", "confidence", "match_reason", "status", "error_message"
            ])
            retried += 1
        self.message_user(request, f"Re-matched {retried} email(s).", messages.SUCCESS)


# ---------------------------------------------------------------------------
# EmailConfig
# ---------------------------------------------------------------------------

@admin.register(EmailConfig)
class EmailConfigAdmin(admin.ModelAdmin):
    list_display = [
        "label",
        "provider",
        "username",
        "mailbox",
        "is_active",
        "auto_create_threshold",
        "last_polled_at",
        "test_connection_link",
    ]
    list_filter = ["provider", "is_active"]
    search_fields = ["label", "username"]
    readonly_fields = ["last_polled_at", "test_connection_link"]

    fieldsets = [
        ("Identity", {
            "fields": ["label", "provider", "is_active"]
        }),
        ("Connection", {
            "fields": ["imap_host", "imap_port", "username", "password", "mailbox"],
            "description": (
                "For Gmail: use an App Password (Google Account → Security → App passwords). "
                "For Outlook: use outlook.office365.com:993 with your M365 password."
            ),
        }),
        ("Behaviour", {
            "fields": ["auto_create_threshold", "gmail_primary_only"],
            "description": (
                "Emails matched with confidence ≥ this threshold are auto-converted "
                "to RFIs without manual review. Range: 0.0–1.0 (recommended: 0.85)."
            ),
        }),
        ("Status", {
            "fields": ["last_polled_at", "test_connection_link"],
        }),
    ]

    @admin.display(description="Test connection")
    def test_connection_link(self, obj):
        if not obj.pk:
            return "Save first to test."
        return format_html(
            '<a href="{}" style="color:#4f46e5;font-weight:600;" '
            'onclick="return confirm(\'Test IMAP connection for {}?\');">'
            'Test now ↗</a>',
            f"/api/email/configs/{obj.pk}/test/",
            obj.label,
        )

    def save_model(self, request, obj, form, change):
        """Show a warning if the password is blank on a new config."""
        if not obj.pk and not obj.password:
            self.message_user(
                request,
                "Warning: no password was set. The poller will not be able to authenticate.",
                level=messages.WARNING,
            )
        super().save_model(request, obj, form, change)
