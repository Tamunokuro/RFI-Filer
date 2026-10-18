"""
Tests for EmailIngestionPipeline orchestration (run_one / run_all).

Focus: provider-error handling differences between the on-demand path
(run_one — errors must surface to the user) and the cron path
(run_all — errors are logged and swallowed so other configs still run),
plus duplicate handling in the processed count.
"""
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from django.test import TestCase

from email_ingestion.models import InboundEmail
from email_ingestion.parsing.dataclasses import RawEmail
from email_ingestion.pipeline.pipeline import EmailIngestionPipeline
from email_ingestion.providers.base import ProviderError

from .utils import make_config


def _raw_email(uid: str, message_id: str, subject: str = "Test email") -> RawEmail:
    raw_bytes = (
        f"From: sender@example.com\r\n"
        f"To: inbox@example.com\r\n"
        f"Subject: {subject}\r\n"
        f"Message-ID: <{message_id}>\r\n"
        f"\r\n"
        f"Plain body text.\r\n"
    ).encode()
    return RawEmail(
        uid=uid,
        raw_bytes=raw_bytes,
        server_received_at=datetime.now(tz=timezone.utc),
    )


class RunOneProviderErrorTests(TestCase):
    """run_one must surface connection failures instead of reporting success."""

    @patch("email_ingestion.pipeline.pipeline.get_provider")
    def test_run_one_reraises_provider_error(self, mock_get_provider):
        mock_get_provider.return_value.fetch_unseen.side_effect = ProviderError(
            "IMAP login failed"
        )
        config = make_config()

        with self.assertRaises(ProviderError):
            EmailIngestionPipeline().run_one(config)

    @patch("email_ingestion.pipeline.pipeline.get_provider")
    def test_run_one_stamps_last_polled_at_even_on_failure(self, mock_get_provider):
        mock_get_provider.return_value.fetch_unseen.side_effect = ProviderError(
            "IMAP login failed"
        )
        config = make_config()
        self.assertIsNone(config.last_polled_at)

        try:
            EmailIngestionPipeline().run_one(config)
        except ProviderError:
            pass

        config.refresh_from_db()
        self.assertIsNotNone(config.last_polled_at)


class RunAllProviderErrorTests(TestCase):
    """run_all (cron) must keep going when one config's connection fails."""

    @patch("email_ingestion.pipeline.pipeline.get_provider")
    def test_run_all_swallows_provider_error(self, mock_get_provider):
        mock_get_provider.return_value.fetch_unseen.side_effect = ProviderError(
            "IMAP login failed"
        )
        config = make_config()

        summary = EmailIngestionPipeline().run_all()

        self.assertEqual(summary, {config.label: 0})
        config.refresh_from_db()
        self.assertIsNotNone(config.last_polled_at)


class ProcessedCountTests(TestCase):
    """The returned count reflects newly saved emails, not skipped duplicates."""

    @patch("email_ingestion.pipeline.pipeline.get_provider")
    def test_duplicates_not_counted_as_processed(self, mock_get_provider):
        provider = MagicMock()
        provider.fetch_unseen.return_value = [
            _raw_email("1", "unique-1@example.com"),
            _raw_email("2", "unique-1@example.com"),  # same Message-ID → duplicate
        ]
        mock_get_provider.return_value = provider
        config = make_config()

        count = EmailIngestionPipeline().run_one(config)

        self.assertEqual(count, 1)
        self.assertEqual(InboundEmail.objects.count(), 1)

    @patch("email_ingestion.pipeline.pipeline.get_provider")
    def test_distinct_emails_all_counted(self, mock_get_provider):
        provider = MagicMock()
        provider.fetch_unseen.return_value = [
            _raw_email("1", "unique-1@example.com"),
            _raw_email("2", "unique-2@example.com"),
        ]
        mock_get_provider.return_value = provider
        config = make_config()

        count = EmailIngestionPipeline().run_one(config)

        self.assertEqual(count, 2)
        self.assertEqual(InboundEmail.objects.count(), 2)
