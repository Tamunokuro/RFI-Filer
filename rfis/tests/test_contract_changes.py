"""
Tests for the ContractChange feature:
  - Creating pending records when an official response flags a formal instruction
  - Blocking RFI closure while pending changes exist
  - Updating records to issued / cancelled
  - Permission checks and list filters
"""
from datetime import date, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi

from .utils import _make_user_member


class ContractChangeTests(APITestCase):
    """
    Tests for the ContractChange feature: creating pending records when an
    official response flags a formal instruction, blocking RFI closure while
    pending changes exist, and updating records to issued / cancelled.
    """

    def setUp(self):
        from rfis.models import ContractChange  # local import keeps top imports tidy
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
            {
                "body": "Need a PCN.", "contract_change_type": "PCN",
                "contract_change_description": "Upgrade beam.",
            },
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
        self.client.force_authenticate(self.pm_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        r = self.client.patch(change_url, {
            "status": "issued",
            "reference_number": "PCN-007",
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "issued")
        self.assertEqual(r.data["reference_number"], "PCN-007")

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
        other_project = Project.objects.create(
            project_number="OTHER-1", project_name="Other",
        )
        ProjectMembership.objects.create(
            project=other_project, member=self.designer_member,
            role=self.designer_member.role,
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
        change = self.rfi.contract_changes.first()
        self.client.force_authenticate(self.pm_user)
        change_url = reverse("rfis:contract-change-detail", args=[change.pk])
        self.client.patch(change_url, {"status": "issued", "reference_number": "PCN-001"})

        self.ContractChange.objects.create(
            project=self.project, rfi=self.rfi,
            anticipated_type="SI", description="Another pending one.",
            created_by=self.designer_member,
        )

        self.client.force_authenticate(self.designer_user)
        r = self.client.get(self.list_url, {"status": "pending"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["status"], "pending")
