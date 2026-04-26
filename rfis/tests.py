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
        self.rfi.assigned_to.set([self.contractor_member])

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

    def test_pm_can_submit_official_response_and_close_rfi(self):
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        r = self.client.post(url, {"body": "Proceed with Option A."}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], Rfi.Status.CLOSED)
        self.assertEqual(r.data["official_response"], "Proceed with Option A.")
        self.assertEqual(r.data["responded_by_name"], self.pm_member.name)

        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.CLOSED)
        self.assertIsNotNone(self.rfi.closed_at)
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
            )
            self.client.force_authenticate(user)
            url = reverse("rfis:rfi-official-response", args=[rfi.id])
            r = self.client.post(url, {"body": "Answer"}, format="json")
            self.assertEqual(r.status_code, status.HTTP_200_OK, msg=user.username)

    def test_contractor_cannot_submit_official_response(self):
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        r = self.client.post(url, {"body": "nope"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        self.rfi.refresh_from_db()
        self.assertEqual(self.rfi.status, Rfi.Status.OPEN)

    def test_cannot_submit_response_on_already_closed_rfi(self):
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        self.client.post(url, {"body": "First answer"}, format="json")
        r = self.client.post(url, {"body": "Second answer"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_official_response_rejected(self):
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:rfi-official-response", args=[self.rfi.id])
        r = self.client.post(url, {"body": ""}, format="json")
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
        self.rfi_alice.assigned_to.set([self.alice_member])

        self.rfi_bob = Rfi.objects.create(
            project=self.project,
            author=self.alice_user,
            trade="E",
            rfi_name="Bob RFI",
            rfi_number="RF-B1",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=5),
        )
        self.rfi_bob.assigned_to.set([self.bob_member])

        self.rfi_both = Rfi.objects.create(
            project=self.project,
            author=self.alice_user,
            trade="C",
            rfi_name="Shared RFI",
            rfi_number="RF-S1",
            received_date=date.today(),
            due_date=date.today() + timedelta(days=5),
        )
        self.rfi_both.assigned_to.set([self.alice_member, self.bob_member])

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
