"""
Tests for RFI file attachments:
  - upload (allowed / disallowed types, multi-file)
  - listing
  - per-uploader delete permission
"""
import shutil
from datetime import date, timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi, RfiAttachment

from .utils import TMP_MEDIA, _make_user_member


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
        f1 = SimpleUploadedFile("a.pdf", b"x", content_type="application/pdf")
        f2 = SimpleUploadedFile("b.png", b"y", content_type="image/png")
        r = self.client.post(url, {"file": [f1, f2]}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(r.data["created"]), 2)
