"""
Tests for RFI status transitions and content revision tracking:
  - POST /api/rfis/<pk>/transition/
  - PATCH /api/rfis/<pk>/ (role-based edit guards + RfiRevision creation)
"""
from datetime import date, timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi

from .utils import _make_user_member


def _make_rfi_for_transition(pm_user, pm_member):
    """Create the minimal objects needed to test status transitions."""
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
        from rfis.models import RfiRevision
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
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])
        r = self._patch(self.contractor_user, {"rfi_name": "Original Name"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.rfi.revisions.count(), 0)

    def test_no_revision_created_when_editing_open_rfi(self):
        r = self._patch(self.contractor_user, {"rfi_name": "Draft Change"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.rfi.revisions.count(), 0)

    def test_multiple_revisions_increment_number(self):
        self.rfi.status = Rfi.Status.UNDER_REVIEW
        self.rfi.save(update_fields=["status"])

        self._patch(self.contractor_user, {"rfi_name": "Rev 1"})
        self.rfi.refresh_from_db()
        self._patch(self.contractor_user, {"rfi_name": "Rev 2"})

        nums = list(
            self.rfi.revisions.values_list("revision_number", flat=True)
            .order_by("revision_number")
        )
        self.assertEqual(nums, [1, 2])

    def test_revision_list_endpoint_requires_auth(self):
        url = reverse("rfis:rfi-revisions", args=[self.rfi.pk])
        r = self.client.get(url)
        self.assertEqual(r.status_code, 401)

    def test_revision_list_returns_revisions(self):
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
