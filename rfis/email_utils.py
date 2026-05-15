"""
Email notification helpers for RFI Filer.

All functions are fire-and-forget: they catch every exception and log a
warning rather than letting an email failure break an API response.

Production switch
-----------------
In settings.py (or settings/production.py):

    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST        = "smtp.sendgrid.net"        # or SES / Mailgun etc.
    EMAIL_PORT        = 587
    EMAIL_USE_TLS     = True
    EMAIL_HOST_USER   = "apikey"
    EMAIL_HOST_PASSWORD = env("SENDGRID_API_KEY")  # use django-environ
    DEFAULT_FROM_EMAIL = "rfi-filer@yourcompany.com"
    FRONTEND_URL       = "https://app.yourcompany.com"

For local development the default backend is the console backend
(emails are printed to stdout) — no additional config needed.
"""

import logging
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _frontend_url() -> str:
    return getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _rfi_url(rfi) -> str:
    return f"{_frontend_url()}/rfi/{rfi.id}/{rfi.slug}"


def _send(subject: str, body: str, recipients: list[str]) -> None:
    """Send a plain-text email, swallowing all errors."""
    if not recipients:
        return
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@rfifiler.com")
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=from_email,
            recipient_list=recipients,
            fail_silently=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Email send failed (%s) — subject: %r", exc, subject)


def _rfi_subject(rfi, verb: str) -> str:
    return f"[RFI {rfi.rfi_number}] {verb} — {rfi.project.project_name}"


def _opt_in_emails(members) -> list[str]:
    """Return email addresses of members who have email_notifications enabled."""
    return [m.email for m in members if m.email and m.email_notifications]


# ---------------------------------------------------------------------------
# Trigger functions — called from views.py
# ---------------------------------------------------------------------------

def notify_rfi_assigned(rfi, assignee, actor_name: str) -> None:
    """Sent to a member when they are added as a designer or CA on an RFI."""
    if not assignee.email_notifications or not assignee.email:
        return
    url = _rfi_url(rfi)
    _send(
        subject=_rfi_subject(rfi, "You have been assigned"),
        body=(
            f"Hi {assignee.name},\n\n"
            f"{actor_name} has assigned you to RFI {rfi.rfi_number}: {rfi.rfi_name}\n"
            f"Project: {rfi.project.project_name} ({rfi.project.project_number})\n"
            f"Due date: {rfi.due_date}\n\n"
            f"View the RFI:\n{url}\n\n"
            f"— RFI Filer"
        ),
        recipients=[assignee.email],
    )


def notify_rfi_comment(rfi, comment, watchers, exclude_member=None) -> None:
    """
    Notify designers, CAs, the author, and watchers when a new discussion
    comment is posted.

    ``exclude_member`` is the comment author — we skip them so they don't
    get a notification for their own message.
    """
    recipients_qs = set()
    # Always notify the RFI's author (the submitter)
    if hasattr(rfi.author, "member"):
        recipients_qs.add(rfi.author.member)
    for m in rfi.designers.all():
        recipients_qs.add(m)
    for m in rfi.contract_administrators.all():
        recipients_qs.add(m)
    for w in watchers:
        recipients_qs.add(w)

    if exclude_member:
        recipients_qs.discard(exclude_member)

    emails = _opt_in_emails(recipients_qs)
    if not emails:
        return

    author_name = comment.author.name if comment.author else "Someone"
    preview = comment.body[:200] if comment.body else "(attachment)"
    url = _rfi_url(rfi)
    _send(
        subject=_rfi_subject(rfi, f"New comment from {author_name}"),
        body=(
            f"Hi,\n\n"
            f"{author_name} posted a comment on RFI {rfi.rfi_number}: {rfi.rfi_name}\n"
            f"Project: {rfi.project.project_name}\n\n"
            f"\"{preview}\"\n\n"
            f"View the discussion:\n{url}\n\n"
            f"— RFI Filer"
        ),
        recipients=emails,
    )


def notify_official_response(rfi, responder, response_body: str, watchers) -> None:
    """Sent to the RFI submitter and watchers when an official response is posted."""
    recipients_qs = set()
    if hasattr(rfi.author, "member"):
        recipients_qs.add(rfi.author.member)
    for w in watchers:
        recipients_qs.add(w)
    recipients_qs.discard(responder)

    emails = _opt_in_emails(recipients_qs)
    if not emails:
        return

    preview = response_body[:300]
    url = _rfi_url(rfi)
    _send(
        subject=_rfi_subject(rfi, f"Official response from {responder.name}"),
        body=(
            f"Hi,\n\n"
            f"{responder.name} has submitted an official response to "
            f"RFI {rfi.rfi_number}: {rfi.rfi_name}\n"
            f"Project: {rfi.project.project_name}\n\n"
            f"Response preview:\n\"{preview}\"\n\n"
            f"View the full response:\n{url}\n\n"
            f"— RFI Filer"
        ),
        recipients=emails,
    )


def notify_rfi_returned(rfi, returned_by, return_note: str) -> None:
    """
    Notify the original submitter (and watchers) when a designer/CA returns
    the RFI requesting clarification.
    """
    # Notify the submitter
    submitter = getattr(rfi.author, "member", None)
    recipients = set()
    if submitter:
        recipients.add(submitter)
    # Also notify watchers
    for w in rfi.watchers.select_related("member"):
        recipients.add(w.member)
    recipients.discard(returned_by)

    emails = _opt_in_emails(recipients)
    if not emails:
        return

    url = _rfi_url(rfi)
    _send(
        subject=_rfi_subject(rfi, f"Returned by {returned_by.name} — action required"),
        body=(
            f"Hi,\n\n"
            f"RFI {rfi.rfi_number}: {rfi.rfi_name} has been returned to the submitter "
            f"by {returned_by.name}.\n"
            f"Project: {rfi.project.project_name}\n\n"
            f"Reason:\n{return_note or '(no note provided)'}\n\n"
            f"Please review and resubmit:\n{url}\n\n"
            f"— RFI Filer"
        ),
        recipients=emails,
    )


def notify_status_change(rfi, new_status: str, changed_by, watchers) -> None:
    """Notify watchers and key parties when the RFI status changes."""
    recipients = set()
    if hasattr(rfi.author, "member"):
        recipients.add(rfi.author.member)
    for m in rfi.designers.all():
        recipients.add(m)
    for m in rfi.contract_administrators.all():
        recipients.add(m)
    for w in watchers:
        recipients.add(w)
    if changed_by:
        recipients.discard(changed_by)

    emails = _opt_in_emails(recipients)
    if not emails:
        return

    status_display = {
        "open": "Open (Draft)",
        "submitted": "Submitted",
        "under_review": "Under Review",
        "responded": "Responded",
        "returned": "Returned to Submitter",
        "closed": "Closed",
    }.get(new_status, new_status.replace("_", " ").title())

    url = _rfi_url(rfi)
    actor = changed_by.name if changed_by else "Someone"
    _send(
        subject=_rfi_subject(rfi, f"Status changed to {status_display}"),
        body=(
            f"Hi,\n\n"
            f"{actor} changed the status of RFI {rfi.rfi_number}: {rfi.rfi_name} "
            f"to \"{status_display}\".\n"
            f"Project: {rfi.project.project_name}\n\n"
            f"View the RFI:\n{url}\n\n"
            f"— RFI Filer"
        ),
        recipients=emails,
    )


def notify_overdue(rfi) -> None:
    """
    Sent once by the overdue-escalation management command.
    Notifies the PM, all assigned members, and watchers.
    """
    recipients = set()
    pm = rfi.project.project_manager
    if pm:
        recipients.add(pm)
    for m in rfi.designers.all():
        recipients.add(m)
    for m in rfi.contract_administrators.all():
        recipients.add(m)
    for w in rfi.watchers.select_related("member"):
        recipients.add(w.member)

    emails = _opt_in_emails(recipients)
    if not emails:
        return

    days_overdue = 0
    from django.utils import timezone
    today = timezone.now().date()
    if rfi.due_date:
        days_overdue = (today - rfi.due_date).days

    url = _rfi_url(rfi)
    _send(
        subject=_rfi_subject(rfi, f"OVERDUE — {days_overdue} day(s) past due"),
        body=(
            f"OVERDUE NOTICE\n\n"
            f"RFI {rfi.rfi_number}: {rfi.rfi_name} was due on {rfi.due_date} "
            f"and is now {days_overdue} day(s) overdue.\n"
            f"Project: {rfi.project.project_name} ({rfi.project.project_number})\n"
            f"Current status: {rfi.status.replace('_', ' ').title()}\n"
            f"Priority: {rfi.priority.title()} → escalated to the next level\n\n"
            f"Please take action:\n{url}\n\n"
            f"— RFI Filer (automated)"
        ),
        recipients=emails,
    )


def notify_watcher_added(rfi, watcher_member, added_by) -> None:
    """Notify a member when they are added as a watcher on an RFI."""
    if not watcher_member.email_notifications or not watcher_member.email:
        return
    url = _rfi_url(rfi)
    actor = added_by.name if added_by else "Someone"
    _send(
        subject=_rfi_subject(rfi, f"You are now watching this RFI"),
        body=(
            f"Hi {watcher_member.name},\n\n"
            f"{actor} has added you as a watcher on "
            f"RFI {rfi.rfi_number}: {rfi.rfi_name}.\n"
            f"Project: {rfi.project.project_name}\n\n"
            f"You will receive email notifications for all activity on this RFI.\n\n"
            f"View the RFI:\n{url}\n\n"
            f"— RFI Filer"
        ),
        recipients=[watcher_member.email],
    )


def notify_mention(rfi, comment, mentioned_member, actor_name: str) -> None:
    """Notify a member when they are @mentioned in a comment."""
    if not mentioned_member.email_notifications or not mentioned_member.email:
        return
    preview = comment.body[:200] if comment.body else ""
    url = f"{_rfi_url(rfi)}?comment={comment.id}"
    _send(
        subject=_rfi_subject(rfi, f"{actor_name} mentioned you"),
        body=(
            f"Hi {mentioned_member.name},\n\n"
            f"{actor_name} mentioned you in a comment on "
            f"RFI {rfi.rfi_number}: {rfi.rfi_name}\n"
            f"Project: {rfi.project.project_name}\n\n"
            f"\"{preview}\"\n\n"
            f"Jump to the comment:\n{url}\n\n"
            f"— RFI Filer"
        ),
        recipients=[mentioned_member.email],
    )
