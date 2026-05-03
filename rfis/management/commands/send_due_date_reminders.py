"""
Management command: send_due_date_reminders

Sends in-app notifications (and emails) to all designers and contract
administrators assigned to RFIs that are due in exactly N days (default 3).

Run manually:
    python manage.py send_due_date_reminders
    python manage.py send_due_date_reminders --days 1

Recommended cron (daily at 8 AM server time):
    0 8 * * * cd /path/to/project && source venv/bin/activate && python manage.py send_due_date_reminders
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from rfis.models import Rfi
from rfis.notifications import notify_rfi_due_soon

# RFI statuses that are still actionable (exclude closed)
OPEN_STATUSES = ("open", "submitted", "under_review", "responded")


class Command(BaseCommand):
    help = "Send due-date reminder notifications for RFIs due in N days (default 3)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=3,
            help="How many days ahead to look for due RFIs (default: 3).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would be sent without creating notifications or sending emails.",
        )

    def handle(self, *args, **options):
        days = options["days"]
        dry_run = options["dry_run"]

        target_date = timezone.localdate() + timedelta(days=days)

        rfis = (
            Rfi.objects
            .filter(status__in=OPEN_STATUSES, due_date=target_date)
            .select_related("project")
            .prefetch_related("designers", "contract_administrators")
        )

        total_sent = 0
        total_skipped = 0

        for rfi in rfis:
            recipients = set(rfi.designers.all()) | set(rfi.contract_administrators.all())

            if not recipients:
                self.stdout.write(
                    self.style.WARNING(
                        f"  RFI #{rfi.rfi_number} '{rfi.rfi_name}' — no assignees, skipping."
                    )
                )
                continue

            for member in recipients:
                if dry_run:
                    self.stdout.write(
                        f"  [DRY RUN] Would notify {member.name} <{member.email}> "
                        f"about RFI #{rfi.rfi_number} due {rfi.due_date}"
                    )
                    total_sent += 1
                else:
                    created = notify_rfi_due_soon(member, rfi, days_remaining=days)
                    if created:
                        total_sent += 1
                    else:
                        total_skipped += 1

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}Done — {total_sent} reminder(s) sent"
                + (f", {total_skipped} skipped (already notified today)." if total_skipped else ".")
            )
        )
