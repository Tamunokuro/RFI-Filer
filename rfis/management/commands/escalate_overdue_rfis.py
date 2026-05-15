"""
Management command: escalate_overdue_rfis

Scans all active RFIs that are past their due date and have not yet been
escalated.  For each one it:

  1. Bumps the priority one level (Low → Medium → High → Critical).
  2. Sets ``rfi.escalated = True`` to prevent duplicate escalations.
  3. Sends an overdue email notification to the PM, assignees, and watchers.
  4. Writes an AuditLog entry so the escalation is traceable.

Run this daily via cron, a Celery beat schedule, or a serverless scheduler:

    python manage.py escalate_overdue_rfis

Dry-run mode (no changes made, just printed):

    python manage.py escalate_overdue_rfis --dry-run
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from rfis.models import Rfi, AuditLog
from rfis.email_utils import notify_overdue


PRIORITY_ESCALATION = {
    Rfi.Priority.LOW:      Rfi.Priority.MEDIUM,
    Rfi.Priority.MEDIUM:   Rfi.Priority.HIGH,
    Rfi.Priority.HIGH:     Rfi.Priority.CRITICAL,
    Rfi.Priority.CRITICAL: Rfi.Priority.CRITICAL,  # already at max
}

ACTIVE_STATUSES = [
    Rfi.Status.OPEN,
    Rfi.Status.SUBMITTED,
    Rfi.Status.UNDER_REVIEW,
    Rfi.Status.RESPONDED,
    Rfi.Status.RETURNED,
]


class Command(BaseCommand):
    help = "Escalate overdue RFIs: bump priority and send notifications."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would happen without making any changes.",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        today = timezone.now().date()

        overdue_qs = (
            Rfi.objects
            .filter(
                status__in=ACTIVE_STATUSES,
                due_date__lt=today,
                escalated=False,
            )
            .select_related("project", "project__project_manager")
            .prefetch_related("designers", "contract_administrators", "watchers__member")
        )

        count = overdue_qs.count()
        self.stdout.write(f"Found {count} overdue, non-escalated RFI(s).")

        for rfi in overdue_qs:
            old_priority = rfi.priority
            new_priority = PRIORITY_ESCALATION.get(old_priority, old_priority)
            days_overdue = (today - rfi.due_date).days

            self.stdout.write(
                f"  [{rfi.rfi_number}] {rfi.rfi_name} — "
                f"{days_overdue}d overdue — "
                f"priority {old_priority} → {new_priority}"
                + (" [DRY RUN]" if dry_run else "")
            )

            if not dry_run:
                rfi.priority  = new_priority
                rfi.escalated = True
                rfi.save(update_fields=["priority", "escalated"])

                AuditLog.objects.create(
                    rfi=rfi,
                    actor=None,  # system action
                    action="escalated",
                    detail={
                        "reason": "overdue",
                        "days_overdue": days_overdue,
                        "old_priority": old_priority,
                        "new_priority": new_priority,
                    },
                )

                notify_overdue(rfi)

        self.stdout.write(
            self.style.SUCCESS(
                f"Done — {'would escalate' if dry_run else 'escalated'} {count} RFI(s)."
            )
        )
