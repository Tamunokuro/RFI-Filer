"""
management command: poll_inbox
--------------------------------
Fetches unseen emails from all active EmailConfigs and runs them through
the ingestion pipeline.

Usage
-----
    python manage.py poll_inbox                  # process all active configs
    python manage.py poll_inbox --config-id 1   # process one specific config
    python manage.py poll_inbox --test           # test connections only, no fetching

Cron example (every 5 minutes)
--------------------------------
    */5 * * * * /path/to/venv/bin/python /path/to/manage.py poll_inbox >> /var/log/rfi_poll.log 2>&1
"""

import logging

from django.core.management.base import BaseCommand, CommandError

from email_ingestion.models import EmailConfig
from email_ingestion.pipeline.pipeline import EmailIngestionPipeline
from email_ingestion.providers.factory import get_provider
from email_ingestion.providers.base import ProviderError

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Poll watched email inboxes and ingest RFI-related messages."

    def add_arguments(self, parser):
        parser.add_argument(
            "--config-id",
            type=int,
            default=None,
            metavar="ID",
            help="Only process the EmailConfig with this primary key.",
        )
        parser.add_argument(
            "--test",
            action="store_true",
            default=False,
            help="Test IMAP connections for all active configs without fetching any emails.",
        )

    def handle(self, *args, **options):
        # ── Connection test mode ────────────────────────────────────────
        if options["test"]:
            self._run_connection_tests()
            return

        # ── Normal poll mode ────────────────────────────────────────────
        configs = EmailConfig.objects.filter(is_active=True)

        if not configs.exists():
            self.stdout.write(self.style.WARNING(
                "No active EmailConfigs found.\n"
                "  → Go to /admin/email_ingestion/emailconfig/ and create one."
            ))
            return

        self.stdout.write(f"Found {configs.count()} active config(s). Starting poll…\n")

        config_id = options.get("config_id")
        pipeline = EmailIngestionPipeline()

        if config_id:
            try:
                config = EmailConfig.objects.get(pk=config_id, is_active=True)
            except EmailConfig.DoesNotExist:
                raise CommandError(f"No active EmailConfig found with id={config_id}")

            self._poll_one(pipeline, config)
        else:
            for config in configs:
                self._poll_one(pipeline, config)

    def _poll_one(self, pipeline, config):
        self.stdout.write(f"  Polling [{config.label}] {config.username} → {config.imap_host}:{config.imap_port} …")
        try:
            count = pipeline.run_one(config)
            if count == 0:
                self.stdout.write(self.style.WARNING(
                    f"  [{config.label}] 0 new emails found.\n"
                    f"    → Make sure the inbox has UNSEEN messages.\n"
                    f"    → Emails already read by another client won't be fetched."
                ))
            else:
                self.stdout.write(self.style.SUCCESS(
                    f"  [{config.label}] Processed {count} email(s)."
                ))
        except ProviderError as exc:
            self.stdout.write(self.style.ERROR(
                f"  [{config.label}] Connection failed: {exc}\n"
                f"    → Run: python manage.py poll_inbox --test  for diagnostics."
            ))
        except Exception as exc:
            self.stdout.write(self.style.ERROR(
                f"  [{config.label}] Unexpected error: {exc}"
            ))
            logger.exception("Unexpected error polling config '%s'", config.label)

    def _run_connection_tests(self):
        """Test IMAP login for every active config without fetching any mail."""
        configs = EmailConfig.objects.filter(is_active=True)

        if not configs.exists():
            self.stdout.write(self.style.WARNING("No active EmailConfigs found."))
            return

        self.stdout.write("Running connection tests…\n")

        for config in configs:
            self.stdout.write(
                f"  [{config.label}]  {config.username}  →  {config.imap_host}:{config.imap_port}"
            )
            try:
                provider = get_provider(config)
                ok = provider.test_connection()
            except Exception as exc:
                ok = False
                self.stdout.write(self.style.ERROR(f"    ✗ Exception: {exc}"))
                self._print_gmail_hints(config, str(exc))
                continue

            if ok:
                self.stdout.write(self.style.SUCCESS("    ✓ Connected successfully"))
            else:
                self.stdout.write(self.style.ERROR("    ✗ Login failed"))
                self._print_gmail_hints(config, "login failed")

    def _print_gmail_hints(self, config, error_msg: str):
        """Print provider-specific hints based on the error."""
        err = error_msg.lower()

        if config.provider == "gmail":
            if "application-specific password" in err or "credentials" in err or "login" in err:
                self.stdout.write(
                    "    Hint: Gmail requires an App Password, not your regular password.\n"
                    "    → myaccount.google.com → Security → App passwords\n"
                    "    → Make sure 2-Step Verification is ON first."
                )
            if "imap" in err or "connection" in err or "network" in err:
                self.stdout.write(
                    "    Hint: IMAP may not be enabled in Gmail.\n"
                    "    → Gmail → Settings (⚙) → See all settings → Forwarding and POP/IMAP\n"
                    "    → Set 'IMAP access' to ENABLED and save."
                )
        elif config.provider == "outlook":
            self.stdout.write(
                "    Hint: For Outlook/M365, make sure IMAP is enabled.\n"
                "    → admin.microsoft.com → Users → [user] → Mail → Manage email apps\n"
                "    → Check 'IMAP' is ticked."
            )
