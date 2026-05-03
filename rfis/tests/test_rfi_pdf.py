"""
Tests for the RFI PDF export feature:
  - View tests: GET /api/rfis/<pk>/pdf/
  - Unit tests: build_rfi_pdf() generator
"""
import shutil
from datetime import date, datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi, RfiAttachment

from .utils import TMP_MEDIA, _make_user_member


class RfiPdfFixtureMixin:
    """Shared DB fixture for PDF-related test cases."""

    def _setup_pdf_fixture(self):
        self.pm_user, self.pm_member = _make_user_member("pdf_pm", Member.Role.PROJECT_MANAGER)
        self.designer_user, self.designer_member = _make_user_member(
            "pdf_designer", Member.Role.PROJECT_DESIGNER
        )
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
        content = (
            b"".join(r.streaming_content)
            if hasattr(r, "streaming_content")
            else r.content
        )
        self.assertTrue(content.startswith(b"%PDF"), "Response body is not a valid PDF")

    def test_response_body_is_non_trivial(self):
        """A real PDF with content should exceed 2 KB."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        content = (
            b"".join(r.streaming_content)
            if hasattr(r, "streaming_content")
            else r.content
        )
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
        content = (
            b"".join(r.streaming_content)
            if hasattr(r, "streaming_content")
            else r.content
        )
        self.assertTrue(content.startswith(b"%PDF"))

    @override_settings(FRONTEND_URL="https://app.example.com")
    def test_pdf_contains_deep_link_to_app(self):
        """The PDF byte stream must include the FRONTEND_URL deep-link."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(self.url)
        content = (
            b"".join(r.streaming_content)
            if hasattr(r, "streaming_content")
            else r.content
        )
        expected_fragment = (
            f"https://app.example.com/rfi/{self.rfi.id}/{self.rfi.slug}".encode()
        )
        self.assertIn(
            expected_fragment, content,
            "Deep-link URL should be embedded in the PDF byte stream",
        )


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
        """RFI with only required fields must not raise."""
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
            file=SimpleUploadedFile(
                "drawing.pdf", b"%PDF-1.4", content_type="application/pdf"
            ),
            original_filename="drawing.pdf",
            content_type="application/pdf",
            size=8,
        )
        att_url = "https://app.example.com/media/rfi_attachments/1/drawing.pdf"
        buf = build_rfi_pdf(self.rfi, attachment_urls={att.id: att_url})
        content = buf.read()
        self.assertIn(
            att_url.encode(), content,
            "Attachment URL must be present in the PDF byte stream",
        )

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
        self.assertEqual(_fmt_date(datetime(2026, 5, 15, 10, 30)), "May 15, 2026")

    def test_app_url_embeds_link_in_pdf(self):
        """When app_url is supplied the URL string must appear in the PDF byte stream."""
        from rfis.pdf import build_rfi_pdf
        deep_link = "https://app.example.com/rfi/1/p-001-rfi-001-roof-drainage"
        buf = build_rfi_pdf(self.rfi, app_url=deep_link)
        content = buf.read()
        self.assertIn(
            deep_link.encode(), content,
            "Deep-link URL must be present in the PDF byte stream",
        )

    def test_pdf_without_app_url_still_renders(self):
        """Omitting app_url (the default) must not raise and must produce a valid PDF."""
        from rfis.pdf import build_rfi_pdf
        buf = build_rfi_pdf(self.rfi, app_url=None)
        self.assertTrue(buf.read(4) == b"%PDF")
