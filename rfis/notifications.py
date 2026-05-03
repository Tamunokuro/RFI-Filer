"""
Shared notification helpers for the rfis app.

Used by:
  - RfiSerializer.create / update  (assignment notifications)
  - send_due_date_reminders management command (due-soon notifications)
"""
from django.conf import settings
from django.core.mail import send_mail

from rfis.models import Notification


def _rfi_extra(rfi):
    """Build the shared extra dict stored on every RFI-related notification."""
    return {
        "rfi_id":         rfi.id,
        "rfi_slug":       rfi.slug,
        "rfi_name":       rfi.rfi_name,
        "rfi_number":     rfi.rfi_number,
        "project_id":     rfi.project_id,
        "project_number": rfi.project.project_number,
        "project_name":   rfi.project.project_name,
        "due_date":       str(rfi.due_date),
    }


def _rfi_url(rfi):
    frontend_url = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    return f"{frontend_url}/rfi/{rfi.id}/{rfi.slug}"


def notify_rfi_assigned(member, rfi, actor_name=""):
    """
    Create an in-app notification + send an email to `member` telling them
    they have been assigned to `rfi`.

    Safe to call even when the member has no email address.
    """
    Notification.objects.create(
        recipient=member,
        verb=Notification.Verb.RFI_ASSIGNED,
        actor_name=actor_name,
        project=rfi.project,
        extra=_rfi_extra(rfi),
    )

    if not member.email:
        return

    subject = f"You've been assigned to RFI #{rfi.rfi_number}: {rfi.rfi_name}"
    body = (
        f"Hi {member.name},\n\n"
        f"{actor_name or 'A team member'} has assigned you to RFI #{rfi.rfi_number} "
        f"\"{rfi.rfi_name}\" on project "
        f"{rfi.project.project_number} – {rfi.project.project_name}.\n\n"
        f"The response is due by {rfi.due_date}.\n\n"
        f"View the RFI here:\n{_rfi_url(rfi)}\n\n"
        f"— RFI Filer"
    )
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@rfifiler.com"),
            recipient_list=[member.email],
            fail_silently=True,
        )
    except Exception:
        pass


def notify_rfi_due_soon(member, rfi, days_remaining=3):
    """
    Create an in-app notification + send an email to `member` reminding them
    that `rfi` is due in `days_remaining` days.

    Returns True if a new notification was created, False if skipped (duplicate).
    """
    from django.utils import timezone

    today = timezone.localdate()

    # Deduplicate: only one reminder per member per RFI per calendar day
    already = Notification.objects.filter(
        recipient=member,
        verb=Notification.Verb.RFI_DUE_SOON,
        extra__rfi_id=rfi.id,
        created_at__date=today,
    ).exists()
    if already:
        return False

    Notification.objects.create(
        recipient=member,
        verb=Notification.Verb.RFI_DUE_SOON,
        actor_name="",
        project=rfi.project,
        extra=_rfi_extra(rfi) | {"days_remaining": days_remaining},
    )

    if not member.email:
        return True

    day_word = "1 day" if days_remaining == 1 else f"{days_remaining} days"
    subject = f"RFI Due in {day_word}: {rfi.rfi_name}"
    body = (
        f"Hi {member.name},\n\n"
        f"This is a reminder that RFI #{rfi.rfi_number} \"{rfi.rfi_name}\" "
        f"on project {rfi.project.project_number} – {rfi.project.project_name} "
        f"is due in {day_word} (on {rfi.due_date}).\n\n"
        f"View the RFI here:\n{_rfi_url(rfi)}\n\n"
        f"— RFI Filer"
    )
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@rfifiler.com"),
            recipient_list=[member.email],
            fail_silently=True,
        )
    except Exception:
        pass

    return True
