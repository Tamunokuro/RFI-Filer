"""
API tests for InboundEmail list, filters, approve, reject, and retry.
"""
from datetime import datetime, timezone

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from email_ingestion.models import InboundEmail

from .utils import (
    make_admin, make_config, make_folder,
    make_inbound, make_project, make_user,
)


class InboundEmailListFilterTests(APITestCase):
    """GET /api/email/inbound/ — filtering by status, email_type, folder."""

    def setUp(self):
        self.user, _ = make_admin("list_admin")
        self.config = make_config()
        self.project = make_project()
        self.url = reverse("email-inbound-list")

        self.rfi_pending = make_inbound(
            self.config, self.project,
            status=InboundEmail.Status.PENDING,
            email_type=InboundEmail.EmailType.RFI,
        )
        self.pcn_pending = make_inbound(
            self.config, self.project,
            message_id="<pcn@test>",
            subject="PCN-002 change notice",
            status=InboundEmail.Status.PENDING,
            email_type=InboundEmail.EmailType.PCN,
        )
        self.app_filed = make_inbound(
            self.config,
            message_id="<app@test>",
            subject="Asana task assigned",
            status=InboundEmail.Status.FILED,
            email_type=InboundEmail.EmailType.APP_EMAIL,
        )

    def test_unauthenticated_cannot_list(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_lists_all_emails_without_filter(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 3)

    def test_filter_by_status_pending(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"status": "pending"})
        self.assertEqual(resp.data["count"], 2)
        statuses = {e["status"] for e in resp.data["results"]}
        self.assertEqual(statuses, {"pending"})

    def test_filter_by_status_filed(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"status": "filed"})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["status"], "filed")

    def test_filter_by_email_type_rfi(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"email_type": "rfi"})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["email_type"], "rfi")

    def test_filter_by_email_type_pcn(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"email_type": "pcn"})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["email_type"], "pcn")

    def test_filter_by_folder(self):
        folder = make_folder("Asana", ["asana.com"])
        filed = make_inbound(
            self.config,
            message_id="<filed-with-folder@test>",
            folder=folder,
            status=InboundEmail.Status.FILED,
            email_type=InboundEmail.EmailType.APP_EMAIL,
        )
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"folder": folder.pk})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["id"], filed.pk)

    def test_search_by_subject(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"search": "Asana"})
        self.assertEqual(resp.data["count"], 1)

    def test_search_by_sender_email(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"search": "contractor@example"})
        # Two of our three emails have sender_email = contractor@example.com
        self.assertGreater(resp.data["count"], 0)

    def test_response_includes_email_type_fields(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        item = resp.data["results"][0]
        self.assertIn("email_type", item)
        self.assertIn("email_type_display", item)

    def test_response_includes_folder_name(self):
        folder = make_folder("Jira")
        make_inbound(
            self.config,
            message_id="<with-folder@test>",
            folder=folder,
        )
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url, {"folder": folder.pk})
        self.assertEqual(resp.data["results"][0]["folder_name"], "Jira")


class InboundEmailDetailTests(APITestCase):
    """GET /api/email/inbound/{id}/"""

    def setUp(self):
        self.user, _ = make_admin("detail_admin")
        self.config = make_config()
        self.email = make_inbound(self.config)
        self.url = reverse("email-inbound-detail", args=[self.email.pk])

    def test_authenticated_can_retrieve_detail(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], self.email.pk)

    def test_detail_includes_body_text(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        self.assertIn("body_text", resp.data)

    def test_detail_includes_email_type(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)
        self.assertIn("email_type", resp.data)
        self.assertIn("email_type_display", resp.data)

    def test_404_for_missing_email(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(reverse("email-inbound-detail", args=[99999]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ApproveEmailTests(APITestCase):
    """POST /api/email/inbound/{id}/approve/"""

    def setUp(self):
        self.user, _ = make_admin("approve_admin")
        self.config = make_config()
        self.project = make_project("APPR-001", "Approve Project")
        self.email = make_inbound(self.config, self.project)
        self.url = reverse("email-inbound-approve", args=[self.email.pk])

    def test_approve_pending_email_creates_rfi(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {"project_id": self.project.pk}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("rfi_id", resp.data)

    def test_approve_marks_email_as_approved(self):
        self.client.force_authenticate(self.user)
        self.client.post(self.url, {"project_id": self.project.pk}, format="json")
        self.email.refresh_from_db()
        self.assertEqual(self.email.status, InboundEmail.Status.APPROVED)

    def test_cannot_approve_already_approved_email(self):
        self.email.status = InboundEmail.Status.APPROVED
        self.email.save()
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {"project_id": self.project.pk}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_approve_rejected_email(self):
        self.email.status = InboundEmail.Status.REJECTED
        self.email.save()
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {"project_id": self.project.pk}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_project_id_returns_400(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {"project_id": 99999}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_cannot_approve(self):
        resp = self.client.post(self.url, {"project_id": self.project.pk}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class RejectEmailTests(APITestCase):
    """POST /api/email/inbound/{id}/reject/"""

    def setUp(self):
        self.user, _ = make_admin("reject_admin")
        self.config = make_config()
        self.email = make_inbound(self.config)
        self.url = reverse("email-inbound-reject", args=[self.email.pk])

    def test_reject_pending_email(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {"reason": "Not a valid RFI"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.email.refresh_from_db()
        self.assertEqual(self.email.status, InboundEmail.Status.REJECTED)
        self.assertEqual(self.email.rejection_reason, "Not a valid RFI")

    def test_reject_without_reason(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.email.refresh_from_db()
        self.assertEqual(self.email.status, InboundEmail.Status.REJECTED)

    def test_cannot_reject_auto_created_email(self):
        self.email.status = InboundEmail.Status.AUTO_CREATED
        self.email.save()
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_cannot_reject(self):
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class RetryEmailTests(APITestCase):
    """POST /api/email/inbound/{id}/retry/"""

    def setUp(self):
        self.user, _ = make_admin("retry_admin")
        self.config = make_config()
        self.project = make_project("RETRY-001")
        self.email = make_inbound(self.config, self.project,
                                  status=InboundEmail.Status.ERROR,
                                  error_message="Parser failed")
        self.url = reverse("email-inbound-retry", args=[self.email.pk])

    def test_retry_error_email_resets_status_to_pending(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.email.refresh_from_db()
        self.assertEqual(self.email.status, InboundEmail.Status.PENDING)

    def test_retry_response_includes_confidence(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {}, format="json")
        self.assertIn("confidence", resp.data)
        self.assertIn("match_reason", resp.data)

    def test_cannot_retry_approved_email(self):
        self.email.status = InboundEmail.Status.APPROVED
        self.email.save()
        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_cannot_retry(self):
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
