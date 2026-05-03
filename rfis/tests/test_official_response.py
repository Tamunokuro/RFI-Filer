"""
Tests for the official response endpoint:
  - Attachments uploaded alongside the response body
  - Status transitions triggered by the official response
  - Revised official responses and the response-history endpoint
"""
import shutil
from datetime import date, timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi, RfiAttachment, RfiComment

from .utils import TMP_MEDIA, _make_user_member


# ── Attachment tests ──────────────────────────────────────────────────────────

@override_settings(MEDIA_ROOT=TMP_MEDIA)
class RfiOfficialResponseAttachmentTests(APITestCase):
    """Official response endpoint: files sent in the same multipart request."""

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member(
            "pm_or_att", Member.Role.PROJECT_MANAGER
        )
        self.contractor_user, self.contractor_member = _make_user_member(
            "contractor_or_att", Member.Role.CONTRACTOR
        )
        self.project = Project.objects.create(
            project_number="OR-ATT", project_name="Official Response Attachments"
        )
        for m in (self.pm_member, self.contractor_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)
        self.rfi = Rfi.objects.create(
            project=self.project,
            author=self.pm_user,
            trade="M",
            rfi_name="Duct",
            rfi_number="OR-1",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=5),
            status=Rfi.Status.UNDER_REVIEW,
        )
        self.url = reverse("rfis:rfi-official-response", args=[self.rfi.id])

    def _post_response(self, body="Official answer.", files=None):
        """Helper: POST to the official-response endpoint with optional files."""
        data = {"body": body}
        if files:
            data["files"] = files
        return self.client.post(self.url, data, format="multipart")

    def test_text_only_response_still_works(self):
        """Submitting without files must behave exactly as before."""
        self.client.force_authenticate(self.pm_user)
        r = self._post_response()
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], Rfi.Status.RESPONDED)
        self.assertEqual(r.data["official_response"], "Official answer.")
        self.assertEqual(r.data["official_response_attachments"], [])
        self.assertEqual(RfiAttachment.objects.count(), 0)

    def test_response_with_single_file_creates_attachment(self):
        self.client.force_authenticate(self.pm_user)
        pdf = SimpleUploadedFile("decision.pdf", b"pdf content", content_type="application/pdf")
        r = self._post_response(files=pdf)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], Rfi.Status.RESPONDED)

        att = RfiAttachment.objects.get()
        self.assertTrue(att.is_official_response)
        self.assertEqual(att.original_filename, "decision.pdf")
        self.assertEqual(att.uploaded_by, self.pm_member)

        self.assertEqual(len(r.data["official_response_attachments"]), 1)
        self.assertEqual(r.data["official_response_attachments"][0]["original_filename"], "decision.pdf")
        self.assertTrue(r.data["official_response_attachments"][0]["is_official_response"])

    def test_response_with_multiple_files(self):
        self.client.force_authenticate(self.pm_user)
        f1 = SimpleUploadedFile("a.pdf", b"x", content_type="application/pdf")
        f2 = SimpleUploadedFile("b.png", b"y", content_type="image/png")
        data = {"body": "Multi-file answer.", "files": [f1, f2]}
        r = self.client.post(self.url, data, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(RfiAttachment.objects.count(), 2)
        self.assertEqual(len(r.data["official_response_attachments"]), 2)
        for att_data in r.data["official_response_attachments"]:
            self.assertTrue(att_data["is_official_response"])

    def test_disallowed_file_type_rejected_and_rfi_unchanged(self):
        """If any file is invalid the whole request must be rejected atomically."""
        self.client.force_authenticate(self.pm_user)
        bad = SimpleUploadedFile("hack.exe", b"evil", content_type="application/x-msdownload")
        r = self._post_response(files=bad)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("errors", r.data)
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.UNDER_REVIEW)
        self.assertEqual(RfiAttachment.objects.count(), 0)
        self.assertEqual(RfiComment.objects.count(), 0)

    def test_oversized_file_rejected(self):
        """Lower the limit to 1 byte via patch so a 2-byte file triggers it."""
        from unittest.mock import patch
        self.client.force_authenticate(self.pm_user)
        with patch("rfis.views.MAX_ATTACHMENT_SIZE_BYTES", 1):
            small_but_over_limit = SimpleUploadedFile(
                "over.pdf", b"xy", content_type="application/pdf"
            )
            r = self._post_response(files=small_but_over_limit)
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("errors", r.data)
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.UNDER_REVIEW)
        self.assertEqual(RfiAttachment.objects.count(), 0)

    def test_official_response_attachments_not_in_general_listing(self):
        """Attachments flagged is_official_response must still appear in the
        general /attachments/ listing (the frontend filters them client-side)."""
        self.client.force_authenticate(self.pm_user)
        pdf = SimpleUploadedFile("ref.pdf", b"data", content_type="application/pdf")
        self._post_response(files=pdf)

        att_url = reverse("rfis:rfi-attachments", args=[self.rfi.id])
        r = self.client.get(att_url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(len(r.data), 1)
        self.assertTrue(r.data[0]["is_official_response"])

    def test_rfi_serializer_includes_official_response_attachments_on_get(self):
        """After the RFI is closed, fetching it via GET must include the attachments."""
        self.client.force_authenticate(self.pm_user)
        pdf = SimpleUploadedFile("final.pdf", b"ok", content_type="application/pdf")
        self._post_response(files=pdf)

        rfi_url = reverse("rfis:rfi-detail", args=[self.rfi.id])
        r = self.client.get(rfi_url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(len(r.data["official_response_attachments"]), 1)
        self.assertEqual(r.data["official_response_attachments"][0]["original_filename"], "final.pdf")


# ── Status tests ──────────────────────────────────────────────────────────────

class RfiOfficialResponseStatusTests(APITestCase):
    """
    Verify that submitting an official response sets status to 'responded'
    (not 'closed') and that closed_at is NOT set at that point.
    The requester must explicitly close via the transition endpoint.
    """

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member(
            "or_pm", Member.Role.PROJECT_MANAGER
        )
        project = Project.objects.create(
            project_number="OR-001", project_name="OR Test",
            project_manager=self.pm_member,
        )
        ProjectMembership.objects.create(
            project=project, member=self.pm_member, role=self.pm_member.role
        )
        self.rfi = Rfi.objects.create(
            project=project, author=self.pm_user, trade="M",
            rfi_name="Response Status RFI", rfi_number="RFI-OR-01",
            received_date=date.today(), due_date=date.today() + timedelta(days=7),
            status=Rfi.Status.UNDER_REVIEW,
        )
        self.url = reverse("rfis:rfi-official-response", kwargs={"pk": self.rfi.pk})

    def test_official_response_sets_status_to_responded(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self.url, {"body": "Use 150 mm uPVC."})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], Rfi.Status.RESPONDED)

    def test_official_response_does_not_close_rfi(self):
        """closed_at must remain None — only the transition endpoint sets it."""
        self.client.force_authenticate(self.pm_user)
        self.client.post(self.url, {"body": "Approved."})
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.RESPONDED)
        self.assertIsNone(self.rfi.closed_at)

    def test_second_official_response_rejected_for_non_revisor(self):
        """PM can submit the initial response but not a revision (only designers can revise)."""
        self.client.force_authenticate(self.pm_user)
        self.client.post(self.url, {"body": "First answer."})
        r = self.client.post(self.url, {"body": "Another one."})
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_responded_rfi_can_be_closed_via_transition(self):
        """Full lifecycle: submit response → responded → close via transition."""
        self.client.force_authenticate(self.pm_user)
        self.client.post(self.url, {"body": "Approved."})
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.RESPONDED)

        tr_url = reverse("rfis:rfi-transition", kwargs={"pk": self.rfi.pk})
        r = self.client.post(tr_url, {"status": "closed"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], Rfi.Status.CLOSED)
        self.rfi.refresh_from_db()
        self.assertIsNotNone(self.rfi.closed_at)


# ── Revision tests ────────────────────────────────────────────────────────────

@override_settings(MEDIA_ROOT=TMP_MEDIA)
class OfficialResponseRevisionTests(APITestCase):
    """
    Tests for revised official responses and the response-history endpoint.
    """

    def setUp(self):
        self.designer_user, self.designer_member = _make_user_member(
            "orr_designer", Member.Role.PROJECT_DESIGNER
        )
        self.sub_user, self.sub_member = _make_user_member(
            "orr_sub", Member.Role.SUB_CONSULTANT
        )
        self.contractor_user, self.contractor_member = _make_user_member(
            "orr_contractor", Member.Role.CONTRACTOR
        )
        self.pm_user, self.pm_member = _make_user_member(
            "orr_pm", Member.Role.PROJECT_MANAGER
        )

        self.project = Project.objects.create(
            project_number="ORR-001",
            project_name="Response Revision Project",
            project_manager=self.pm_member,
        )
        for m in (self.designer_member, self.sub_member, self.contractor_member, self.pm_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)

        self.rfi = Rfi.objects.create(
            project=self.project,
            author=self.contractor_user,
            rfi_number="RFI-001",
            rfi_name="Drainage RFI",
            trade="M",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            status=Rfi.Status.UNDER_REVIEW,
        )
        self.resp_url = reverse("rfis:rfi-official-response", args=[self.rfi.pk])
        self.hist_url = reverse("rfis:rfi-response-history", args=[self.rfi.pk])

    def _post_response(self, user, body="Use 150 mm pipe."):
        self.client.force_authenticate(user)
        return self.client.post(self.resp_url, {"body": body})

    # ── Initial response creates revision #1 ─────────────────────────────────

    def test_initial_response_creates_revision_record(self):
        from rfis.models import OfficialResponseRevision
        r = self._post_response(self.designer_user)
        self.assertEqual(r.status_code, 200)

        revs = list(self.rfi.response_revisions.all())
        self.assertEqual(len(revs), 1)
        self.assertEqual(revs[0].response_number, 1)
        self.assertEqual(revs[0].body, "Use 150 mm pipe.")
        self.assertEqual(revs[0].responded_by, self.designer_member)

    def test_rfi_status_becomes_responded_after_initial_response(self):
        self._post_response(self.designer_user)
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.RESPONDED)

    # ── Revised response ──────────────────────────────────────────────────────

    def test_designer_can_submit_revised_response(self):
        self._post_response(self.designer_user, "First answer.")
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.RESPONDED)

        self.client.force_authenticate(self.designer_user)
        r = self.client.post(self.resp_url, {"body": "Revised answer."})
        self.assertEqual(r.status_code, 200)

        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.official_response, "Revised answer.")
        self.assertEqual(self.rfi.response_revisions.count(), 2)
        latest = self.rfi.response_revisions.first()  # ordered by -response_number
        self.assertEqual(latest.response_number, 2)
        self.assertEqual(latest.body, "Revised answer.")

    def test_sub_consultant_can_submit_revised_response(self):
        self._post_response(self.designer_user, "First.")
        self.rfi.refresh_from_db()

        self.client.force_authenticate(self.sub_user)
        r = self.client.post(self.resp_url, {"body": "Sub revision."})
        self.assertEqual(r.status_code, 200)

    def test_contractor_cannot_submit_revised_response(self):
        self._post_response(self.designer_user, "First.")
        self.rfi.refresh_from_db()

        self.client.force_authenticate(self.contractor_user)
        r = self.client.post(self.resp_url, {"body": "Contractor sneaks in."})
        self.assertEqual(r.status_code, 403)

    def test_pm_cannot_submit_revised_response(self):
        """PM can submit the initial response but not a revision."""
        self._post_response(self.pm_user, "PM initial.")
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.RESPONDED)

        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self.resp_url, {"body": "PM revision."})
        self.assertEqual(r.status_code, 403)

    def test_cannot_respond_to_closed_rfi(self):
        self.rfi.status = Rfi.Status.CLOSED
        self.rfi.save(update_fields=["status"])
        r = self._post_response(self.designer_user)
        self.assertEqual(r.status_code, 400)

    def test_revision_status_stays_responded(self):
        """Submitting a revised response keeps the RFI in 'responded' state."""
        self._post_response(self.designer_user, "First.")
        self.rfi.refresh_from_db()

        self.client.force_authenticate(self.designer_user)
        self.client.post(self.resp_url, {"body": "Second."})
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.RESPONDED)

    # ── Response history endpoint ─────────────────────────────────────────────

    def test_response_history_endpoint_requires_auth(self):
        r = self.client.get(self.hist_url)
        self.assertEqual(r.status_code, 401)

    def test_response_history_returns_all_revisions(self):
        self._post_response(self.designer_user, "First.")
        self.rfi.refresh_from_db()

        self.client.force_authenticate(self.designer_user)
        self.client.post(self.resp_url, {"body": "Second."})

        self.client.force_authenticate(self.contractor_user)
        r = self.client.get(self.hist_url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)
        self.assertEqual(r.data[0]["response_number"], 2)
        self.assertEqual(r.data[1]["response_number"], 1)

    def test_response_history_includes_responded_by_name(self):
        self._post_response(self.designer_user, "Response text.")

        self.client.force_authenticate(self.designer_user)
        r = self.client.get(self.hist_url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]["responded_by_name"], self.designer_member.name)

    def test_response_history_is_empty_before_any_response(self):
        self.client.force_authenticate(self.contractor_user)
        r = self.client.get(self.hist_url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, [])

    def test_revised_response_comment_posted_to_discussion(self):
        """Each submission (initial + revision) adds an official-response comment."""
        self._post_response(self.designer_user, "First.")
        self.rfi.refresh_from_db()

        self.client.force_authenticate(self.designer_user)
        self.client.post(self.resp_url, {"body": "Second."})

        comments = list(self.rfi.comments.filter(is_official_response=True))
        self.assertEqual(len(comments), 2)
