"""
API tests for EmailConfig CRUD endpoints.

GET    /api/email/configs/          list (any authenticated user)
POST   /api/email/configs/          create (admin only)
GET    /api/email/configs/{id}/     retrieve (admin only)
PATCH  /api/email/configs/{id}/     update  (admin only)
DELETE /api/email/configs/{id}/     delete  (admin only)
POST   /api/email/configs/{id}/test/ test connection (admin only)
"""
from unittest.mock import MagicMock, patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from email_ingestion.models import EmailConfig

from .utils import make_admin, make_config, make_user


class EmailConfigListTests(APITestCase):
    """GET /api/email/configs/ — any authenticated user can list."""

    def setUp(self):
        self.admin_user, _ = make_admin("cfg_admin")
        self.plain_user, _ = make_user("cfg_plain")
        self.url = reverse("email-config-list")
        make_config("Inbox A", "a@example.com")
        make_config("Inbox B", "b@example.com")

    def test_admin_gets_all_configs(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 2)

    def test_plain_user_can_list(self):
        """Non-admin authenticated users can still list (read-only)."""
        self.client.force_authenticate(self.plain_user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unauthenticated_cannot_list(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_response_includes_expected_fields(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.get(self.url)
        cfg = resp.data[0]
        for field in ("id", "label", "provider", "username", "mailbox",
                      "is_active", "auto_create_threshold", "subject_format_hint",
                      "last_polled_at"):
            self.assertIn(field, cfg)

    def test_password_is_not_exposed_in_list(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.get(self.url)
        self.assertNotIn("password", resp.data[0])


class EmailConfigCreateTests(APITestCase):
    """POST /api/email/configs/ — admin only."""

    def setUp(self):
        self.admin_user, _ = make_admin("cfg_create_admin")
        self.plain_user, _ = make_user("cfg_create_plain")
        self.url = reverse("email-config-list")
        self.payload = {
            "label":                "New Inbox",
            "provider":             "gmail",
            "username":             "new@example.com",
            "password":             "app-password-xyz",
            "mailbox":              "INBOX",
            "is_active":            True,
            "auto_create_threshold": 0.80,
            "subject_format_hint":  "RFI – {project_number} – {name}",
        }

    def test_admin_can_create(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["label"], "New Inbox")
        self.assertTrue(EmailConfig.objects.filter(label="New Inbox").exists())

    def test_superuser_can_create_without_member_is_admin(self):
        """A Django superuser bypasses the Member.is_admin check."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        superuser = User.objects.create_superuser("superuser_test", password="pw")
        # Note: no Member row with is_admin=True — relies purely on is_superuser
        self.client.force_authenticate(superuser)
        payload = {**self.payload, "label": "Superuser Inbox", "username": "su@example.com"}
        resp = self.client.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_django_staff_can_create(self):
        """A Django staff user (is_staff=True) also bypasses the Member.is_admin check."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        staff = User.objects.create_user("staff_test", password="pw", is_staff=True)
        self.client.force_authenticate(staff)
        payload = {**self.payload, "label": "Staff Inbox", "username": "staff@example.com"}
        resp = self.client.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_non_admin_cannot_create(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_create(self):
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_required_fields_returns_400(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, {"label": "No Creds"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_threshold_returns_400(self):
        self.client.force_authenticate(self.admin_user)
        payload = {**self.payload, "auto_create_threshold": 1.5}
        resp = self.client.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_gmail_provider_auto_fills_imap_host(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        cfg = EmailConfig.objects.get(label="New Inbox")
        self.assertEqual(cfg.imap_host, "imap.gmail.com")
        self.assertEqual(cfg.imap_port, 993)

    def test_outlook_provider_auto_fills_imap_host(self):
        self.client.force_authenticate(self.admin_user)
        payload = {**self.payload, "provider": "outlook", "label": "Outlook Inbox"}
        resp = self.client.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        cfg = EmailConfig.objects.get(label="Outlook Inbox")
        self.assertEqual(cfg.imap_host, "outlook.office365.com")

    def test_subject_format_hint_stored(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["subject_format_hint"], "RFI – {project_number} – {name}")


class EmailConfigUpdateTests(APITestCase):
    """PATCH /api/email/configs/{id}/ — admin only."""

    def setUp(self):
        self.admin_user, _ = make_admin("cfg_upd_admin")
        self.plain_user, _ = make_user("cfg_upd_plain")
        self.config = make_config("Original Label")
        self.url = reverse("email-config-detail", args=[self.config.pk])

    def test_admin_can_update_label(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"label": "Updated Label"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.config.refresh_from_db()
        self.assertEqual(self.config.label, "Updated Label")

    def test_non_admin_cannot_update(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.patch(self.url, {"label": "Hacked"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_password_not_cleared_when_omitted_on_patch(self):
        """PATCH without a password field must not blank out the stored password."""
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"label": "New Name"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.config.refresh_from_db()
        # Password was not sent — it must still equal the value set in setUp
        self.assertEqual(self.config.password, "secret")

    def test_toggle_is_active(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"is_active": False}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.config.refresh_from_db()
        self.assertFalse(self.config.is_active)

    def test_update_subject_format_hint(self):
        self.client.force_authenticate(self.admin_user)
        hint = "PCN – {project_number}"
        resp = self.client.patch(self.url, {"subject_format_hint": hint}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.config.refresh_from_db()
        self.assertEqual(self.config.subject_format_hint, hint)

    def test_update_auto_create_threshold_boundary(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"auto_create_threshold": 0.0}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        resp = self.client.patch(self.url, {"auto_create_threshold": 1.0}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_invalid_threshold_on_update(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"auto_create_threshold": 2.0}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class EmailConfigDeleteTests(APITestCase):
    """DELETE /api/email/configs/{id}/ — admin only."""

    def setUp(self):
        self.admin_user, _ = make_admin("cfg_del_admin")
        self.plain_user, _ = make_user("cfg_del_plain")
        self.config = make_config()
        self.url = reverse("email-config-detail", args=[self.config.pk])

    def test_admin_can_delete(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EmailConfig.objects.filter(pk=self.config.pk).exists())

    def test_non_admin_cannot_delete(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_nonexistent_returns_404(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.delete(reverse("email-config-detail", args=[99999]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class EmailConfigTestConnectionTests(APITestCase):
    """POST /api/email/configs/{id}/test/ — tests IMAP connection."""

    def setUp(self):
        self.admin_user, _ = make_admin("cfg_test_admin")
        self.plain_user, _ = make_user("cfg_test_plain")
        self.config = make_config()
        self.url = reverse("email-config-test", args=[self.config.pk])

    def test_non_admin_cannot_test(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    @patch("email_ingestion.views.get_provider")
    def test_successful_connection_returns_ok_true(self, mock_get_provider):
        mock_provider = MagicMock()
        mock_provider.test_connection.return_value = True
        mock_get_provider.return_value = mock_provider

        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["ok"])
        self.assertIn("successfully", resp.data["detail"])

    @patch("email_ingestion.views.get_provider")
    def test_failed_connection_returns_ok_false(self, mock_get_provider):
        mock_provider = MagicMock()
        mock_provider.test_connection.return_value = False
        mock_get_provider.return_value = mock_provider

        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["ok"])

    @patch("email_ingestion.views.get_provider")
    def test_provider_exception_returns_ok_false(self, mock_get_provider):
        from email_ingestion.providers.base import ProviderError
        mock_get_provider.side_effect = ProviderError("IMAP refused connection")

        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["ok"])
        self.assertIn("IMAP refused", resp.data["detail"])


class EmailConfigPollTests(APITestCase):
    """POST /api/email/configs/{id}/poll/ — on-demand ingestion run."""

    def setUp(self):
        self.admin_user, _ = make_admin("cfg_poll_admin")
        self.plain_user, _ = make_user("cfg_poll_plain")
        self.config = make_config("Poll Inbox")   # is_active=True by default
        self.url = reverse("email-config-poll", args=[self.config.pk])

    def test_non_admin_cannot_poll(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_poll(self):
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_poll_nonexistent_config_returns_404(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(reverse("email-config-poll", args=[99999]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_poll_paused_config_returns_400(self):
        """Polling a paused (is_active=False) inbox should be rejected."""
        paused = make_config("Paused Inbox", is_active=False)
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(reverse("email-config-poll", args=[paused.pk]))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("paused", resp.data["detail"].lower())

    @patch("email_ingestion.pipeline.pipeline.EmailIngestionPipeline")
    def test_successful_poll_returns_ok_true(self, MockPipeline):
        mock_instance = MagicMock()
        mock_instance.run_one.return_value = 3
        MockPipeline.return_value = mock_instance

        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["ok"])
        self.assertEqual(resp.data["emails_processed"], 3)
        self.assertIn("detail", resp.data)
        self.assertIn("last_polled_at", resp.data)

    @patch("email_ingestion.pipeline.pipeline.EmailIngestionPipeline")
    def test_poll_with_zero_new_emails(self, MockPipeline):
        mock_instance = MagicMock()
        mock_instance.run_one.return_value = 0
        MockPipeline.return_value = mock_instance

        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["ok"])
        self.assertEqual(resp.data["emails_processed"], 0)

    @patch("email_ingestion.pipeline.pipeline.EmailIngestionPipeline")
    def test_poll_updates_last_polled_at(self, MockPipeline):
        """After a successful poll the config's last_polled_at is non-null."""
        from django.utils import timezone

        def side_effect(config):
            config.last_polled_at = timezone.now()
            config.save(update_fields=["last_polled_at"])
            return 1

        mock_instance = MagicMock()
        mock_instance.run_one.side_effect = side_effect
        MockPipeline.return_value = mock_instance

        self.assertIsNone(self.config.last_polled_at)
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp.data["last_polled_at"])

    @patch("email_ingestion.pipeline.pipeline.EmailIngestionPipeline")
    def test_pipeline_exception_returns_500(self, MockPipeline):
        mock_instance = MagicMock()
        mock_instance.run_one.side_effect = Exception("Unexpected IMAP error")
        MockPipeline.return_value = mock_instance

        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertFalse(resp.data["ok"])
        self.assertIn("Unexpected IMAP error", resp.data["detail"])
