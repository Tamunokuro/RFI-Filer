import io
import shutil
import tempfile
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Member, Project, ProjectMembership, Rfi, RfiComment, RfiReadState, RfiAttachment,
)


TMP_MEDIA = tempfile.mkdtemp(prefix="rfi-test-media-")


User = get_user_model()


def _make_user_member(username, role, email_suffix="example.com"):
    user = User.objects.create_user(username=username, password="pw-" + username)
    member = Member.objects.create(
        user=user,
        name=username.title(),
        email=f"{username}@{email_suffix}",
        role=role,
    )
    return user, member


class RfiDiscussionTests(APITestCase):
    def setUp(self):
        self.author_user, self.author_member = _make_user_member(
            "designer", Member.Role.PROJECT_DESIGNER
        )
        self.pm_user, self.pm_member = _make_user_member(
            "manager", Member.Role.PROJECT_MANAGER
        )
        self.contractor_user, self.contractor_member = _make_user_member(
            "contractor", Member.Role.CONTRACTOR
        )
        self.ca_user, self.ca_member = _make_user_member(
            "ca", Member.Role.CONTRACT_ADMIN
        )

        self.project = Project.objects.create(
            project_number="P-001",
            project_name="Hospital",
            project_manager=self.pm_member,
        )
        for m in (self.author_member, self.pm_member, self.contractor_member, self.ca_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)

        self.rfi = Rfi.objects.create(
            project=self.project,
            author=self.author_user,
            trade="M",
            rfi_name="Duct clash",
            rfi_number="RFI-001",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=7),
        )
        self.rfi.designers.set([self.contractor_member])

    # ---------- comments ----------

    def test_authenticated_member_can_post_comment(self):
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:rfi-comments", args=[self.rfi.id])
        r = self.client.post(url, {"body": "Hello team"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r.data["body"], "Hello team")
        self.assertEqual(r.data["author_role"], Member.Role.CONTRACTOR)
        self.assertFalse(r.data["is_official_response"])
        self.assertEqual(RfiComment.objects.count(), 1)

    def test_unauthenticated_cannot_post_comment(self):
        url = reverse("rfis:rfi-comments", args=[self.rfi.id])
        r = self.client.post(url, {"body": "Hi"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_body_rejected(self):
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:rfi-comments", args=[self.rfi.id])
        r = self.client.post(url, {"body": "   "}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_listing_comments_returns_chronological_order(self):
        RfiComment.objects.create(rfi=self.rfi, author=self.author_member, body="first")
        RfiComment.objects.create(rfi=self.rfi, author=self.pm_member, body="second")
        self.client.force_authenticate(self.author_user)
        url = reverse("rfis:rfi-comments", args=[self.rfi.id])
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual([c["body"] for c in r.data], ["first", "second"])

    def test_cannot_post_comment_on_closed_rfi(self):
        self.rfi.status = Rfi.Status.CLOSED
        self.rfi.closed_at = timezone.now()
        self.rfi.save()
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:rfi-comments", args=[self.rfi.id])
        r = self.client.post(url, {"body": "late"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    # ---------- official response ----------

    def test_pm_can_submit_official_response(self):
        # RFI must be under_review before a response is accepted
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])

        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        r = self.client.post(url, {"body": "Proceed with Option A."}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        # Official response now sets status to RESPONDED (not CLOSED).
        # The requester closes via the transition endpoint afterwards.
        self.assertEqual(r.data["status"], Rfi.Status.RESPONDED)
        self.assertEqual(r.data["official_response"], "Proceed with Option A.")
        self.assertEqual(r.data["responded_by_name"], self.pm_member.name)

        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.RESPONDED)
        self.assertIsNone(self.rfi.closed_at)   # closed_at only set via transition
        self.assertIsNotNone(self.rfi.responded_at)
        self.assertEqual(self.rfi.responded_by, self.pm_member)
        self.assertTrue(
            RfiComment.objects.filter(rfi=self.rfi, is_official_response=True).exists()
        )

    def test_designer_and_ca_can_submit_official_response(self):
        for user in (self.author_user, self.ca_user):
            rfi = Rfi.objects.create(
                project=self.project,
                author=self.author_user,
                trade="E",
                rfi_name=f"R-{user.username}",
                rfi_number=f"RN-{user.username}",
                received_date=date.today(),
                due_date=date.today() + timedelta(days=1),
                status=Rfi.Status.UNDER_REVIEW,  # response only allowed when under_review
            )
            self.client.force_authenticate(user)
            url = reverse("rfis:rfi-official-response", args=[rfi.id])
            r = self.client.post(url, {"body": "Answer"}, format="multipart")
            self.assertEqual(r.status_code, status.HTTP_200_OK, msg=user.username)

    def test_contractor_cannot_submit_official_response(self):
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        r = self.client.post(url, {"body": "nope"}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.OPEN)

    def test_non_revisor_cannot_submit_second_response(self):
        """After the initial response (PM), a second attempt from PM is rejected
        because only designer roles (Project Designer / Sub Consultant) may revise."""
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])

        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        self.client.post(url, {"body": "First answer"}, format="multipart")
        # Status is now RESPONDED; PM cannot revise → 403
        r = self.client.post(url, {"body": "Second answer"}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_empty_official_response_rejected(self):
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        r = self.client.post(url, {"body": ""}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    # ---------- unread tracking ----------

    def test_unread_summary_counts_only_others_new_comments(self):
        # contractor posts two, pm posts one
        RfiComment.objects.create(rfi=self.rfi, author=self.contractor_member, body="c1")
        RfiComment.objects.create(rfi=self.rfi, author=self.contractor_member, body="c2")
        RfiComment.objects.create(rfi=self.rfi, author=self.pm_member, body="p1")

        # Author (designer) should see 3 unread
        self.client.force_authenticate(self.author_user)
        url = reverse("rfis:rfi-unread-summary")
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data.get(str(self.rfi.id)), 3)

        # Contractor (who posted two) should see only pm's one comment
        self.client.force_authenticate(self.contractor_user)
        r = self.client.get(url)
        self.assertEqual(r.data.get(str(self.rfi.id)), 1)

    def test_mark_read_clears_unread(self):
        RfiComment.objects.create(rfi=self.rfi, author=self.contractor_member, body="msg")
        self.client.force_authenticate(self.author_user)

        mark_url = reverse("rfis:rfi-mark-read", args=[self.rfi.id])
        r = self.client.post(mark_url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(
            RfiReadState.objects.filter(rfi=self.rfi, member=self.author_member).exists()
        )

        summary_url = reverse("rfis:rfi-unread-summary")
        r = self.client.get(summary_url)
        self.assertNotIn(str(self.rfi.id), r.data)

    def test_new_comment_after_read_shows_as_unread(self):
        self.client.force_authenticate(self.author_user)
        mark_url = reverse("rfis:rfi-mark-read", args=[self.rfi.id])
        self.client.post(mark_url)
        # Advance time-stamped read, then a new comment arrives
        RfiComment.objects.create(rfi=self.rfi, author=self.contractor_member, body="late msg")

        summary_url = reverse("rfis:rfi-unread-summary")
        r = self.client.get(summary_url)
        self.assertEqual(r.data.get(str(self.rfi.id)), 1)


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
            # Official responses are only accepted when under_review
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
        # Status moves to RESPONDED (requester must close via transition)
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

        # Serialized response includes the attachment
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
        # RFI must remain under_review and no DB records created
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


@override_settings(MEDIA_ROOT=TMP_MEDIA)
class RfiAttachmentTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.designer_user, self.designer_member = _make_user_member(
            "designer2", Member.Role.PROJECT_DESIGNER
        )
        self.contractor_user, self.contractor_member = _make_user_member(
            "contractor2", Member.Role.CONTRACTOR
        )
        self.project = Project.objects.create(
            project_number="P-ATT", project_name="Attachments"
        )
        for m in (self.designer_member, self.contractor_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)
        self.rfi = Rfi.objects.create(
            project=self.project,
            author=self.designer_user,
            trade="M",
            rfi_name="n",
            rfi_number="A-1",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=1),
        )

    def _upload(self, user, filename, content_type, content=b"hello"):
        self.client.force_authenticate(user)
        url = reverse("rfis:rfi-attachments", args=[self.rfi.id])
        f = SimpleUploadedFile(filename, content, content_type=content_type)
        return self.client.post(url, {"file": f}, format="multipart")

    def test_pdf_upload_succeeds(self):
        r = self._upload(self.designer_user, "spec.pdf", "application/pdf")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(r.data["created"]), 1)
        att = RfiAttachment.objects.get()
        self.assertEqual(att.original_filename, "spec.pdf")
        self.assertEqual(att.uploaded_by, self.designer_member)

    def test_image_video_excel_all_accepted(self):
        cases = [
            ("pic.png", "image/png"),
            ("clip.mp4", "video/mp4"),
            ("data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ]
        for name, ct in cases:
            r = self._upload(self.contractor_user, name, ct)
            self.assertEqual(r.status_code, status.HTTP_201_CREATED, msg=name)
        self.assertEqual(RfiAttachment.objects.count(), 3)

    def test_disallowed_content_type_rejected(self):
        r = self._upload(
            self.designer_user, "hack.exe", "application/x-msdownload"
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(RfiAttachment.objects.count(), 0)

    def test_listing_attachments(self):
        self._upload(self.designer_user, "a.pdf", "application/pdf")
        self._upload(self.designer_user, "b.png", "image/png")
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:rfi-attachments", args=[self.rfi.id])
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(len(r.data), 2)
        self.assertIn("file_url", r.data[0])

    def test_uploader_can_delete_attachment(self):
        self._upload(self.contractor_user, "a.pdf", "application/pdf")
        att = RfiAttachment.objects.get()
        self.client.force_authenticate(self.contractor_user)
        url = reverse(
            "rfis:rfi-attachment-detail", args=[self.rfi.id, att.id]
        )
        r = self.client.delete(url)
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(RfiAttachment.objects.filter(id=att.id).exists())

    def test_non_uploader_cannot_delete(self):
        self._upload(self.contractor_user, "a.pdf", "application/pdf")
        att = RfiAttachment.objects.get()
        self.client.force_authenticate(self.designer_user)
        url = reverse(
            "rfis:rfi-attachment-detail", args=[self.rfi.id, att.id]
        )
        r = self.client.delete(url)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(RfiAttachment.objects.filter(id=att.id).exists())

    def test_unauthenticated_cannot_upload(self):
        url = reverse("rfis:rfi-attachments", args=[self.rfi.id])
        f = SimpleUploadedFile("a.pdf", b"x", content_type="application/pdf")
        r = self.client.post(url, {"file": f}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_multiple_files_in_one_request(self):
        self.client.force_authenticate(self.designer_user)
        url = reverse("rfis:rfi-attachments", args=[self.rfi.id])
        files = {
            "file": [
                SimpleUploadedFile("a.pdf", b"x", content_type="application/pdf"),
                SimpleUploadedFile("b.png", b"y", content_type="image/png"),
            ]
        }
        # DRF MultiPartParser: send as multiple files with same name
        f1 = SimpleUploadedFile("a.pdf", b"x", content_type="application/pdf")
        f2 = SimpleUploadedFile("b.png", b"y", content_type="image/png")
        r = self.client.post(url, {"file": [f1, f2]}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(r.data["created"]), 2)


class RfiStatusSerializationTests(APITestCase):
    def test_rfi_list_response_includes_status(self):
        user, member = _make_user_member("lister", Member.Role.PROJECT_MANAGER)
        project = Project.objects.create(project_number="P2", project_name="P2", project_manager=member)
        ProjectMembership.objects.create(project=project, member=member, role=member.role)
        Rfi.objects.create(
            project=project, author=user, trade="M", rfi_name="n", rfi_number="RN",
            received_date=date.today(), due_date=date.today(),
        )
        self.client.force_authenticate(user)
        r = self.client.get(reverse("rfis:rfi-list"))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["results"][0]["status"], Rfi.Status.OPEN)


class RfiAssignedToFilterTests(APITestCase):
    """Ensure ?assigned_to=<member_id> returns only that member's RFIs."""

    def setUp(self):
        self.alice_user, self.alice_member = _make_user_member(
            "alice_filter", Member.Role.PROJECT_DESIGNER
        )
        self.bob_user, self.bob_member = _make_user_member(
            "bob_filter", Member.Role.CONTRACTOR
        )
        self.project = Project.objects.create(
            project_number="PF-01", project_name="Filter Project"
        )
        for m in (self.alice_member, self.bob_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)

        self.rfi_alice = Rfi.objects.create(
            project=self.project,
            author=self.alice_user,
            trade="M",
            rfi_name="Alice RFI",
            rfi_number="RF-A1",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=5),
        )
        self.rfi_alice.designers.set([self.alice_member])

        self.rfi_bob = Rfi.objects.create(
            project=self.project,
            author=self.alice_user,
            trade="E",
            rfi_name="Bob RFI",
            rfi_number="RF-B1",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=5),
        )
        self.rfi_bob.designers.set([self.bob_member])

        self.rfi_both = Rfi.objects.create(
            project=self.project,
            author=self.alice_user,
            trade="C",
            rfi_name="Shared RFI",
            rfi_number="RF-S1",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=5),
        )
        self.rfi_both.designers.set([self.alice_member, self.bob_member])

    def _get_ids(self, member_id):
        self.client.force_authenticate(self.alice_user)
        r = self.client.get(
            reverse("rfis:rfi-list"), {"assigned_to": member_id}
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        return {item["id"] for item in r.data["results"]}

    def test_filter_returns_only_alices_rfis(self):
        ids = self._get_ids(self.alice_member.id)
        self.assertIn(self.rfi_alice.id, ids)
        self.assertIn(self.rfi_both.id, ids)
        self.assertNotIn(self.rfi_bob.id, ids)

    def test_filter_returns_only_bobs_rfis(self):
        ids = self._get_ids(self.bob_member.id)
        self.assertIn(self.rfi_bob.id, ids)
        self.assertIn(self.rfi_both.id, ids)
        self.assertNotIn(self.rfi_alice.id, ids)

    def test_no_filter_returns_all_rfis(self):
        self.client.force_authenticate(self.alice_user)
        r = self.client.get(reverse("rfis:rfi-list"))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in r.data["results"]}
        self.assertIn(self.rfi_alice.id, ids)
        self.assertIn(self.rfi_bob.id, ids)
        self.assertIn(self.rfi_both.id, ids)


class MeProfileUpdateTests(APITestCase):
    """Tests for GET and PATCH /api/me/ — profile viewing and editing."""

    def setUp(self):
        self.user, self.member = _make_user_member(
            "profiler", Member.Role.PROJECT_DESIGNER
        )
        self.other_user, self.other_member = _make_user_member(
            "other_profiler", Member.Role.CONTRACTOR
        )
        self.url = reverse("rfis:me")

    # ------------------------------------------------------------------ GET --

    def test_get_me_returns_own_profile(self):
        self.client.force_authenticate(self.user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["username"], "profiler")
        self.assertEqual(r.data["member"]["name"], "Profiler")
        self.assertEqual(r.data["member"]["email"], "profiler@example.com")
        self.assertEqual(r.data["member"]["role"], Member.Role.PROJECT_DESIGNER)

    def test_get_me_unauthenticated_returns_401(self):
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    # --------------------------------------------------------------- PATCH ---

    def test_patch_updates_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "Updated Name"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["member"]["name"], "Updated Name")
        self.member.refresh_from_db()
        self.assertEqual(self.member.name, "Updated Name")

    def test_patch_updates_email_and_syncs_user_email(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"email": "updated@example.com"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["member"]["email"], "updated@example.com")
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "updated@example.com")
        # User.email must be kept in sync
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "updated@example.com")

    def test_patch_updates_both_name_and_email(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url,
            {"name": "Full Update", "email": "both@example.com"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["member"]["name"], "Full Update")
        self.assertEqual(r.data["member"]["email"], "both@example.com")

    def test_patch_allows_resubmitting_own_email(self):
        """Saving with the current email must not trigger a uniqueness error."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url, {"email": "profiler@example.com"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_patch_rejects_duplicate_email(self):
        """Attempting to take another member's email must be rejected."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url,
            {"email": "other_profiler@example.com"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", r.data)
        # Member email must be unchanged
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "profiler@example.com")

    def test_patch_rejects_blank_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "   "}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", r.data)

    def test_patch_rejects_empty_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": ""}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", r.data)

    def test_patch_unauthenticated_returns_401(self):
        r = self.client.patch(self.url, {"name": "Hacker"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patch_ignores_read_only_fields(self):
        """Sending role or is_admin must be silently ignored — not applied."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url,
            {"role": Member.Role.PROJECT_MANAGER, "is_admin": True},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.member.refresh_from_db()
        self.assertEqual(self.member.role, Member.Role.PROJECT_DESIGNER)
        self.assertFalse(self.member.is_admin)

    def test_patch_strips_whitespace_from_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "  Trimmed  "}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.member.refresh_from_db()
        self.assertEqual(self.member.name, "Trimmed")

    def test_patch_response_includes_full_member_payload(self):
        """Response shape must include all member fields the frontend depends on."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "Shape Check"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        member_data = r.data["member"]
        for field in ("id", "name", "email", "role", "company", "discipline", "phone", "is_admin"):
            self.assertIn(field, member_data, msg=f"Missing field: {field}")


# =============================================================================
# PDF Export Tests
# =============================================================================

class RfiPdfFixtureMixin:
    """Shared DB fixture for PDF-related test cases."""

    def _setup_pdf_fixture(self):
        self.pm_user, self.pm_member = _make_user_member("pdf_pm", Member.Role.PROJECT_MANAGER)
        self.designer_user, self.designer_member = _make_user_member("pdf_designer", Member.Role.PROJECT_DESIGNER)
        self.ca_user, self.ca_member = _make_user_member("pdf_ca", Member.Role.CONTRACT_ADMIN)

        self.project = Project.objects.create(
            project_number="PDF-001",
            project_name="Test Tower",
            project_manager=self.pm_member,
        )
        for m in (self.pm_member, self.designer_member, self.ca_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)

        self.rfi = Rfi.objects.create(
            project=self.project,
            author=self.designer_user,
            trade="M",
            rfi_name="Roof drainage pipe size",
            rfi_number="RFI-001",
            received_date=date(2026, 4, 1),
            due_date=date(2026, 4, 30),
            question="What pipe diameter is required for the roof drainage?",
            proposed_solution="Use 150 mm uPVC as per detail sheet A3.",
        )
        self.rfi.designers.set([self.designer_member])
        self.rfi.contract_administrators.set([self.ca_member])


@override_settings(MEDIA_ROOT=TMP_MEDIA)
class RfiPdfViewTests(RfiPdfFixtureMixin, APITestCase):
    """Tests for GET /api/rfis/<pk>/pdf/"""

    def setUp(self):
        self._setup_pdf_fixture()
        self.url = reverse("rfis:rfi-pdf", kwargs={"pk": self.rfi.pk})

    # ── authentication ────────────────────────────────────────────────────────

    def test_unauthenticated_request_is_rejected(self):
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_receives_200(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    # ── response shape ────────────────────────────────────────────────────────

    def test_content_type_is_pdf(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        self.assertEqual(r["Content-Type"], "application/pdf")

    def test_content_disposition_is_attachment(self):
        """PDF is served as an attachment so the browser triggers a Save dialog."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        self.assertIn("attachment", r["Content-Disposition"])

    def test_content_disposition_includes_rfi_number(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        self.assertIn("RFI-001", r["Content-Disposition"])

    def test_response_body_is_valid_pdf(self):
        """PDF files always start with the magic bytes %PDF."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        content = b"".join(r.streaming_content) if hasattr(r, "streaming_content") else r.content
        self.assertTrue(content.startswith(b"%PDF"), "Response body is not a valid PDF")

    def test_response_body_is_non_trivial(self):
        """A real PDF with content should exceed 5 KB."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        content = b"".join(r.streaming_content) if hasattr(r, "streaming_content") else r.content
        self.assertGreater(len(content), 2_000)

    def test_non_existent_rfi_returns_404(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(reverse("rfis:rfi-pdf", kwargs={"pk": 99999}))
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_any_authenticated_user_can_download(self):
        """PDF export is not role-gated — contractors and clients can also download."""
        contractor_user, _ = _make_user_member("pdf_contractor", Member.Role.CONTRACTOR)
        self.client.force_authenticate(contractor_user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    # ── content with official response ────────────────────────────────────────

    def test_pdf_generated_for_closed_rfi_with_official_response(self):
        self.rfi.official_response = "Proceed with 150 mm uPVC as proposed."
        self.rfi.responded_by = self.designer_member
        self.rfi.responded_at = timezone.now()
        self.rfi.status = Rfi.Status.CLOSED
        self.rfi.closed_at = timezone.now()
        self.rfi.save()

        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        content = b"".join(r.streaming_content) if hasattr(r, "streaming_content") else r.content
        self.assertTrue(content.startswith(b"%PDF"))

    @override_settings(FRONTEND_URL="https://app.example.com")
    def test_pdf_contains_deep_link_to_app(self):
        """The PDF byte stream must include the FRONTEND_URL deep-link."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        content = b"".join(r.streaming_content) if hasattr(r, "streaming_content") else r.content
        expected_fragment = f"https://app.example.com/rfi/{self.rfi.id}/{self.rfi.slug}".encode()
        self.assertIn(expected_fragment, content,
                      "Deep-link URL should be embedded in the PDF byte stream")


@override_settings(MEDIA_ROOT=TMP_MEDIA)
class RfiPdfGeneratorTests(RfiPdfFixtureMixin, APITestCase):
    """Unit tests for build_rfi_pdf() — exercises the generator directly."""

    def setUp(self):
        self._setup_pdf_fixture()

    def test_returns_bytesio_positioned_at_zero(self):
        from rfis.pdf import build_rfi_pdf
        buf = build_rfi_pdf(self.rfi)
        self.assertEqual(buf.tell(), 0)

    def test_output_is_valid_pdf(self):
        from rfis.pdf import build_rfi_pdf
        buf = build_rfi_pdf(self.rfi)
        self.assertTrue(buf.read(4) == b"%PDF")

    def test_output_exceeds_minimum_size(self):
        from rfis.pdf import build_rfi_pdf
        buf = build_rfi_pdf(self.rfi)
        self.assertGreater(len(buf.read()), 2_000)

    def test_minimal_rfi_no_optional_fields(self):
        """RFI with only required fields (no question/solution/response) must not raise."""
        from rfis.pdf import build_rfi_pdf
        bare = Rfi.objects.create(
            project=self.project,
            author=self.designer_user,
            trade="E",
            rfi_name="Minimal RFI",
            rfi_number="RFI-MIN",
            received_date=date(2026, 5, 1),
            due_date=date(2026, 5, 15),
            question="",
            proposed_solution="",
            official_response="",
        )
        buf = build_rfi_pdf(bare)
        self.assertTrue(buf.read(4) == b"%PDF")

    def test_rfi_with_attachments(self):
        """Attachments list must not cause a rendering error."""
        from rfis.pdf import build_rfi_pdf
        RfiAttachment.objects.create(
            rfi=self.rfi,
            uploaded_by=self.designer_member,
            file=SimpleUploadedFile("spec.pdf", b"%PDF-1.4", content_type="application/pdf"),
            original_filename="spec.pdf",
            content_type="application/pdf",
            size=8,
        )
        buf = build_rfi_pdf(self.rfi)
        self.assertTrue(buf.read(4) == b"%PDF")

    def test_attachment_urls_are_embedded_as_hyperlinks(self):
        """When attachment_urls is supplied the URLs must appear in the PDF byte stream."""
        from rfis.pdf import build_rfi_pdf
        att = RfiAttachment.objects.create(
            rfi=self.rfi,
            uploaded_by=self.designer_member,
            file=SimpleUploadedFile("drawing.pdf", b"%PDF-1.4", content_type="application/pdf"),
            original_filename="drawing.pdf",
            content_type="application/pdf",
            size=8,
        )
        att_url = "https://app.example.com/media/rfi_attachments/1/drawing.pdf"
        buf = build_rfi_pdf(self.rfi, attachment_urls={att.id: att_url})
        content = buf.read()
        self.assertIn(att_url.encode(), content,
                      "Attachment URL must be present in the PDF byte stream")

    def test_attachments_without_urls_still_render(self):
        """Omitting attachment_urls produces plain text filenames without errors."""
        from rfis.pdf import build_rfi_pdf
        RfiAttachment.objects.create(
            rfi=self.rfi,
            uploaded_by=self.designer_member,
            file=SimpleUploadedFile("plain.png", b"\x89PNG", content_type="image/png"),
            original_filename="plain.png",
            content_type="image/png",
            size=4,
        )
        buf = build_rfi_pdf(self.rfi, attachment_urls=None)
        self.assertTrue(buf.read(4) == b"%PDF")

    def test_rfi_with_official_response(self):
        from rfis.pdf import build_rfi_pdf
        self.rfi.official_response = "Approved. Use 150 mm."
        self.rfi.responded_by = self.designer_member
        self.rfi.responded_at = timezone.now()
        self.rfi.save()
        buf = build_rfi_pdf(self.rfi)
        self.assertTrue(buf.read(4) == b"%PDF")

    def test_all_trade_codes_render_without_error(self):
        """Every trade code must map to a label and not crash the generator."""
        from rfis.pdf import build_rfi_pdf, TRADE_LABELS
        for code in TRADE_LABELS:
            self.rfi.trade = code
            self.rfi.save()
            buf = build_rfi_pdf(self.rfi)
            self.assertTrue(buf.read(4) == b"%PDF", f"PDF invalid for trade code '{code}'")

    def test_date_formatter_handles_none(self):
        from rfis.pdf import _fmt_date
        self.assertEqual(_fmt_date(None), "—")

    def test_date_formatter_formats_date(self):
        from rfis.pdf import _fmt_date
        self.assertEqual(_fmt_date(date(2026, 5, 15)), "May 15, 2026")

    def test_date_formatter_formats_datetime(self):
        from rfis.pdf import _fmt_date
        from datetime import datetime
        self.assertEqual(_fmt_date(datetime(2026, 5, 15, 10, 30)), "May 15, 2026")

    def test_app_url_embeds_link_in_pdf(self):
        """When app_url is supplied the URL string must appear in the PDF byte stream."""
        from rfis.pdf import build_rfi_pdf
        deep_link = "https://app.example.com/rfi/1/p-001-rfi-001-roof-drainage"
        buf = build_rfi_pdf(self.rfi, app_url=deep_link)
        content = buf.read()
        self.assertIn(deep_link.encode(), content,
                      "Deep-link URL must be present in the PDF byte stream")

    def test_pdf_without_app_url_still_renders(self):
        """Omitting app_url (the default) must not raise and must produce a valid PDF."""
        from rfis.pdf import build_rfi_pdf
        buf = build_rfi_pdf(self.rfi, app_url=None)
        self.assertTrue(buf.read(4) == b"%PDF")


# ── Status Workflow Tests ─────────────────────────────────────────────────────

def _make_rfi_for_transition(pm_user, pm_member):
    """Helper: create the minimal objects needed to test status transitions."""
    project = Project.objects.create(
        project_number="TW-001", project_name="Transition Test",
        project_manager=pm_member,
    )
    ProjectMembership.objects.create(project=project, member=pm_member, role=pm_member.role)
    return Rfi.objects.create(
        project=project, author=pm_user, trade="M",
        rfi_name="Transition RFI", rfi_number="RFI-TW-01",
        received_date=date.today(), due_date=date.today() + timedelta(days=7),
    )


class RfiTransitionTests(APITestCase):
    """
    Tests for POST /api/rfis/<pk>/transition/

    Covers: valid forward transitions, invalid transitions, terminal state,
    bad status values, unauthenticated access, and closed_at stamping.
    """

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member("tr_pm", Member.Role.PROJECT_MANAGER)
        self.rfi = _make_rfi_for_transition(self.pm_user, self.pm_member)

    def _url(self, pk=None):
        return reverse("rfis:rfi-transition", kwargs={"pk": pk or self.rfi.pk})

    # ── Authentication ────────────────────────────────────────────────────────

    def test_unauthenticated_request_is_rejected(self):
        r = self.client.post(self._url(), {"status": "submitted"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    # ── Happy-path forward transitions ────────────────────────────────────────

    def test_open_to_submitted(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "submitted"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], "submitted")
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.SUBMITTED)

    def test_submitted_to_under_review(self):
        self.rfi.status = Rfi.Status.SUBMITTED
        self.rfi.save()
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "under_review"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], "under_review")

    def test_under_review_to_responded(self):
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save()
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "responded"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], "responded")

    def test_responded_to_closed(self):
        self.rfi.status = Rfi.Status.RESPONDED
        self.rfi.save()
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "closed"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], "closed")

    def test_closed_at_is_stamped_when_transitioning_to_closed(self):
        self.rfi.status = Rfi.Status.RESPONDED
        self.rfi.save()
        self.client.force_authenticate(self.pm_user)
        self.client.post(self._url(), {"status": "closed"}, format="json")
        self.rfi.refresh_from_db()
        self.assertIsNotNone(self.rfi.closed_at)

    def test_closed_at_is_not_stamped_for_non_closed_transitions(self):
        self.client.force_authenticate(self.pm_user)
        self.client.post(self._url(), {"status": "submitted"}, format="json")
        self.rfi.refresh_from_db()
        self.assertIsNone(self.rfi.closed_at)

    def test_skip_transition_open_directly_to_closed(self):
        """Fast-close: open → closed is explicitly listed as allowed."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "closed"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], "closed")

    # ── Invalid transitions ───────────────────────────────────────────────────

    def test_cannot_go_backwards(self):
        """Transitions are forward-only; going back must be rejected."""
        self.rfi.status = Rfi.Status.SUBMITTED
        self.rfi.save()
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "open"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_skip_forward_illegally(self):
        """open → under_review skips submitted and must be rejected."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "under_review"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_closed_rfi_cannot_be_transitioned(self):
        self.rfi.status = Rfi.Status.CLOSED
        self.rfi.save()
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "open"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("closed", r.data["detail"].lower())

    def test_invalid_status_value_returns_400(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "banana"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_status_returns_400(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_existent_rfi_returns_404(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(pk=99999), {"status": "submitted"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    # ── Response shape ────────────────────────────────────────────────────────

    def test_response_includes_full_rfi_data(self):
        """Successful transition returns the full RFI serializer payload."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(self._url(), {"status": "submitted"}, format="json")
        self.assertIn("rfi_name", r.data)
        self.assertIn("project_number", r.data)


class RfiOfficialResponseStatusTests(APITestCase):
    """
    Verify that submitting an official response now sets status to 'responded'
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
            # A response is only accepted when the RFI is under review
            status=Rfi.Status.UNDER_REVIEW,
        )
        self.url = reverse("rfis:rfi-official-response", kwargs={"pk": self.rfi.pk})

    def test_official_response_sets_status_to_responded(self):
        self.client.force_authenticate(self.pm_user)
        # official-response endpoint uses MultiPartParser; send as multipart
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
        # RFI is now RESPONDED; PM (not a designer) gets 403 on second attempt
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


class RfiListStatusFilterTests(APITestCase):
    """Verify the list endpoint accepts comma-separated status filters."""

    def setUp(self):
        self.user, self.member = _make_user_member("lf_pm", Member.Role.PROJECT_MANAGER)
        project = Project.objects.create(
            project_number="LF-001", project_name="List Filter",
            project_manager=self.member,
        )
        ProjectMembership.objects.create(project=project, member=self.member, role=self.member.role)
        for st, num in [
            (Rfi.Status.OPEN, "RFI-01"),
            (Rfi.Status.SUBMITTED, "RFI-02"),
            (Rfi.Status.UNDER_REVIEW, "RFI-03"),
            (Rfi.Status.RESPONDED, "RFI-04"),
            (Rfi.Status.CLOSED, "RFI-05"),
        ]:
            rfi = Rfi.objects.create(
                project=project, author=self.user, trade="M",
                rfi_name=f"RFI {num}", rfi_number=num,
                received_date=date.today(), due_date=date.today() + timedelta(days=7),
            )
            rfi.status = st
            rfi.save()

    def _list(self, status_param):
        self.client.force_authenticate(self.user)
        return self.client.get(reverse("rfis:rfi-list"), {"status": status_param})

    def test_single_status_filter(self):
        r = self._list("open")
        statuses = [item["status"] for item in r.data["results"]]
        self.assertTrue(all(s == "open" for s in statuses))

    def test_comma_separated_status_filter(self):
        r = self._list("open,submitted,under_review,responded")
        statuses = {item["status"] for item in r.data["results"]}
        self.assertNotIn("closed", statuses)
        self.assertGreaterEqual(len(r.data["results"]), 4)

    def test_no_status_filter_returns_all(self):
        # Don't pass a status param at all — every RFI should be returned
        self.client.force_authenticate(self.user)
        r = self.client.get(reverse("rfis:rfi-list"))
        self.assertGreaterEqual(r.data["count"], 5)


# ─────────────────────────────────────────────────────────────────────────────
# RFI Revision Tests
# ─────────────────────────────────────────────────────────────────────────────

class RfiRevisionTests(APITestCase):
    """
    Tests for role-based edit restrictions and revision-record creation.
    Rules:
      - Closed RFIs: immutable for everyone.
      - Designer roles: can only edit when status is 'open'.
      - Requester roles (Contractor, CA, PM, Client): can edit when 'open' or
        'under_review'; editing while 'under_review' creates an RfiRevision.
    """

    def setUp(self):
        from .models import RfiRevision, OfficialResponseRevision

        self.designer_user, self.designer_member = _make_user_member(
            "rev_designer", Member.Role.PROJECT_DESIGNER
        )
        self.contractor_user, self.contractor_member = _make_user_member(
            "rev_contractor", Member.Role.CONTRACTOR
        )
        self.pm_user, self.pm_member = _make_user_member(
            "rev_pm", Member.Role.PROJECT_MANAGER
        )

        self.project = Project.objects.create(
            project_number="REV-001",
            project_name="Revision Project",
            project_manager=self.pm_member,
        )
        for m in (self.designer_member, self.contractor_member, self.pm_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)

        self.rfi = Rfi.objects.create(
            project=self.project,
            author=self.contractor_user,
            rfi_number="RFI-001",
            rfi_name="Original Name",
            trade="M",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            question="Original question?",
            proposed_solution="Original solution.",
            status=Rfi.Status.OPEN,
        )
        self.url = reverse("rfis:rfi-detail", args=[self.rfi.pk])

    def _patch(self, user, data):
        self.client.force_authenticate(user)
        return self.client.patch(self.url, data, format="json")

    # ── Closed-state guard ────────────────────────────────────────────────────

    def test_cannot_edit_closed_rfi(self):
        self.rfi.status = Rfi.Status.CLOSED
        self.rfi.save(update_fields=["status"])
        r = self._patch(self.contractor_user, {"rfi_name": "New Name"})
        self.assertEqual(r.status_code, 400)

    # ── Designer restrictions ─────────────────────────────────────────────────

    def test_designer_can_edit_open_rfi(self):
        r = self._patch(self.designer_user, {"rfi_name": "Designer Edit"})
        self.assertEqual(r.status_code, 200)
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.rfi_name, "Designer Edit")

    def test_designer_cannot_edit_submitted_rfi(self):
        self.rfi.status = Rfi.Status.SUBMITTED
        self.rfi.save(update_fields=["status"])
        r = self._patch(self.designer_user, {"rfi_name": "Sneaky Edit"})
        self.assertEqual(r.status_code, 403)

    def test_designer_cannot_edit_under_review_rfi(self):
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])
        r = self._patch(self.designer_user, {"rfi_name": "Sneaky Edit"})
        self.assertEqual(r.status_code, 403)

    # ── Requester restrictions ────────────────────────────────────────────────

    def test_contractor_can_edit_open_rfi(self):
        r = self._patch(self.contractor_user, {"rfi_name": "Contractor Open Edit"})
        self.assertEqual(r.status_code, 200)

    def test_contractor_cannot_edit_submitted_rfi(self):
        self.rfi.status = Rfi.Status.SUBMITTED
        self.rfi.save(update_fields=["status"])
        r = self._patch(self.contractor_user, {"rfi_name": "Too Late"})
        self.assertEqual(r.status_code, 403)

    def test_contractor_can_edit_under_review_rfi(self):
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])
        r = self._patch(self.contractor_user, {"rfi_name": "Revised Name"})
        self.assertEqual(r.status_code, 200)

    def test_contractor_cannot_edit_responded_rfi(self):
        self.rfi.status = Rfi.Status.RESPONDED
        self.rfi.save(update_fields=["status"])
        r = self._patch(self.contractor_user, {"rfi_name": "After Response"})
        self.assertEqual(r.status_code, 403)

    # ── Revision record creation ──────────────────────────────────────────────

    def test_revision_created_when_editing_under_review(self):
        from .models import RfiRevision
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])

        r = self._patch(self.contractor_user, {"rfi_name": "Revised Name"})
        self.assertEqual(r.status_code, 200)

        revisions = list(self.rfi.revisions.all())
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0].revision_number, 1)
        self.assertIn("rfi_name", revisions[0].changes)
        self.assertEqual(revisions[0].changes["rfi_name"]["before"], "Original Name")
        self.assertEqual(revisions[0].changes["rfi_name"]["after"], "Revised Name")
        self.assertEqual(revisions[0].revised_by, self.contractor_member)

    def test_no_revision_created_when_nothing_changes(self):
        from .models import RfiRevision
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])

        # Patch with the same values — no diff
        r = self._patch(self.contractor_user, {"rfi_name": "Original Name"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.rfi.revisions.count(), 0)

    def test_no_revision_created_when_editing_open_rfi(self):
        from .models import RfiRevision
        # Status is OPEN — edits are draft changes, not tracked revisions
        r = self._patch(self.contractor_user, {"rfi_name": "Draft Change"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.rfi.revisions.count(), 0)

    def test_multiple_revisions_increment_number(self):
        from .models import RfiRevision
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])

        self._patch(self.contractor_user, {"rfi_name": "Rev 1"})
        self.rfi.refresh_from_db()
        self._patch(self.contractor_user, {"rfi_name": "Rev 2"})

        nums = list(self.rfi.revisions.values_list("revision_number", flat=True).order_by("revision_number"))
        self.assertEqual(nums, [1, 2])

    def test_revision_list_endpoint_requires_auth(self):
        url = reverse("rfis:rfi-revisions", args=[self.rfi.pk])
        r = self.client.get(url)
        self.assertEqual(r.status_code, 401)

    def test_revision_list_returns_revisions(self):
        from .models import RfiRevision
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])
        self._patch(self.contractor_user, {"question": "Clarified question?"})

        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:rfi-revisions", args=[self.rfi.pk])
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertIn("changes", r.data[0])
        self.assertEqual(r.data[0]["revision_number"], 1)


# ─────────────────────────────────────────────────────────────────────────────
# Official Response Revision Tests
# ─────────────────────────────────────────────────────────────────────────────

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
        from .models import OfficialResponseRevision
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

        # Now revise
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
        # Newest first
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


class ContractChangeTests(APITestCase):
    """
    Tests for the ContractChange feature: creating pending records when an
    official response flags a formal instruction, blocking RFI closure while
    pending changes exist, and updating records to issued / cancelled.
    """

    def setUp(self):
        from .models import ContractChange  # local import keeps top imports tidy
        self.ContractChange = ContractChange

        self.designer_user, self.designer_member = _make_user_member(
            "cc_designer", Member.Role.PROJECT_DESIGNER
        )
        self.pm_user, self.pm_member = _make_user_member(
            "cc_pm", Member.Role.PROJECT_MANAGER
        )
        self.contractor_user, self.contractor_member = _make_user_member(
            "cc_contractor", Member.Role.CONTRACTOR
        )

        self.project = Project.objects.create(
            project_number="CC-001",
            project_name="Contract Change Project",
            project_manager=self.pm_member,
        )
        for m in (self.designer_member, self.pm_member, self.contractor_member):
            ProjectMembership.objects.create(project=self.project, member=m, role=m.role)

        self.rfi = Rfi.objects.create(
            project=self.project,
            author=self.contractor_user,
            rfi_number="RFI-001",
            rfi_name="Beam clarification",
            trade="S",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            status=Rfi.Status.UNDER_REVIEW,
        )
        self.resp_url = reverse("rfis:rfi-official-response", args=[self.rfi.pk])
        self.transition_url = reverse("rfis:rfi-transition", args=[self.rfi.pk])
        self.list_url = reverse("rfis:contract-change-list")

    # ── Creating a contract change via the official response endpoint ─────────

    def test_response_with_contract_change_type_creates_pending_record(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.post(
            self.resp_url,
            {
                "body": "Use upgraded beam — formal change to follow.",
                "contract_change_type": "PCN",
                "contract_change_description": "Upgrade W14x22 to W14x30.",
            },
        )
        self.assertEqual(r.status_code, 200)

        changes = list(self.rfi.contract_changes.all())
        self.assertEqual(len(changes), 1)
        c = changes[0]
        self.assertEqual(c.anticipated_type, "PCN")
        self.assertEqual(c.status, self.ContractChange.Status.PENDING)
        self.assertEqual(c.description, "Upgrade W14x22 to W14x30.")
        self.assertEqual(c.created_by, self.designer_member)
        self.assertEqual(c.project_id, self.project.id)

    def test_response_without_contract_change_creates_no_record(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.post(self.resp_url, {"body": "No formal change needed."})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.rfi.contract_changes.count(), 0)

    def test_invalid_contract_change_type_returns_400(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.post(
            self.resp_url,
            {"body": "Body.", "contract_change_type": "BOGUS"},
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("contract_change_type", r.data)

    def test_description_defaults_to_response_body_when_blank(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.post(
            self.resp_url,
            {"body": "Body becomes the description.", "contract_change_type": "SI"},
        )
        self.assertEqual(r.status_code, 200)
        change = self.rfi.contract_changes.first()
        self.assertEqual(change.description, "Body becomes the description.")

    # ── Closing an RFI with pending contract changes is blocked ──────────────

    def _flag_and_respond(self):
        self.client.force_authenticate(self.designer_user)
        self.client.post(
            self.resp_url,
            {"body": "Need a PCN.", "contract_change_type": "PCN",
             "contract_change_description": "Upgrade beam."},
        )

    def test_cannot_close_rfi_while_change_pending(self):
        self._flag_and_respond()
        self.client.force_authenticate(self.contractor_user)
        r = self.client.post(self.transition_url, {"status": "closed"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("pending contract change", r.data["detail"])
        self.assertEqual(r.data["pending_contract_changes"], 1)

    def test_can_close_rfi_after_change_marked_issued(self):
        self._flag_and_respond()
        change = self.rfi.contract_changes.first()
        # Mark the change as issued via the API.
        self.client.force_authenticate(self.pm_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        r = self.client.patch(change_url, {
            "status": "issued",
            "reference_number": "PCN-007",
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "issued")
        self.assertEqual(r.data["reference_number"], "PCN-007")

        # Now closing the RFI should succeed.
        self.client.force_authenticate(self.contractor_user)
        r = self.client.post(self.transition_url, {"status": "closed"})
        self.assertEqual(r.status_code, 200)
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.CLOSED)

    def test_cancelled_changes_do_not_block_closure(self):
        self._flag_and_respond()
        change = self.rfi.contract_changes.first()
        self.client.force_authenticate(self.pm_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        r = self.client.patch(change_url, {"status": "cancelled"})
        self.assertEqual(r.status_code, 200)

        self.client.force_authenticate(self.contractor_user)
        r = self.client.post(self.transition_url, {"status": "closed"})
        self.assertEqual(r.status_code, 200)

    def test_marking_issued_requires_reference_number(self):
        self._flag_and_respond()
        change = self.rfi.contract_changes.first()
        self.client.force_authenticate(self.pm_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        r = self.client.patch(change_url, {"status": "issued"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("reference_number", r.data)

    def test_marking_issued_stamps_issued_by_and_at(self):
        self._flag_and_respond()
        change = self.rfi.contract_changes.first()
        self.client.force_authenticate(self.pm_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        r = self.client.patch(change_url, {
            "status": "issued",
            "reference_number": "PCN-001",
        })
        self.assertEqual(r.status_code, 200)
        change.refresh_from_db()
        self.assertEqual(change.issued_by, self.pm_member)
        self.assertIsNotNone(change.issued_at)

    # ── Permissions ───────────────────────────────────────────────────────────

    def test_contractor_cannot_create_contract_change_directly(self):
        self.client.force_authenticate(self.contractor_user)
        r = self.client.post(self.list_url, {
            "project": self.project.id,
            "anticipated_type": "PCN",
            "description": "Backdoor attempt.",
        })
        self.assertEqual(r.status_code, 403)

    def test_designer_can_create_contract_change_directly(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.post(self.list_url, {
            "project": self.project.id,
            "rfi": self.rfi.id,
            "anticipated_type": "SI",
            "description": "Direct flag.",
        })
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["status"], "pending")
        self.assertEqual(r.data["anticipated_type"], "SI")

    def test_contractor_cannot_update_contract_change(self):
        self._flag_and_respond()
        change = self.rfi.contract_changes.first()
        self.client.force_authenticate(self.contractor_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        r = self.client.patch(change_url, {"status": "cancelled"})
        self.assertEqual(r.status_code, 403)

    # ── Listing and filters ──────────────────────────────────────────────────

    def test_list_contract_changes_filterable_by_project(self):
        self._flag_and_respond()
        # Second project unrelated to this RFI.
        other_project = Project.objects.create(
            project_number="OTHER-1", project_name="Other",
        )
        ProjectMembership.objects.create(
            project=other_project, member=self.designer_member, role=self.designer_member.role
        )
        self.ContractChange.objects.create(
            project=other_project,
            anticipated_type="CO",
            description="Unrelated change.",
            created_by=self.designer_member,
        )

        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.list_url, {"project": self.project.id})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["project"], self.project.id)

    def test_list_contract_changes_filterable_by_status(self):
        self._flag_and_respond()
        # Issue the first one
        change = self.rfi.contract_changes.first()
        self.client.force_authenticate(self.pm_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        self.client.patch(change_url, {"status": "issued", "reference_number": "PCN-001"})

        # Add a second pending change
        self.ContractChange.objects.create(
            project=self.project, rfi=self.rfi,
            anticipated_type="SI", description="Another pending one.",
            created_by=self.designer_member,
        )

        # Filter pending only
        self.client.force_authenticate(self.designer_user)
        r = self.client.get(self.list_url, {"status": "pending"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["status"], "pending")
