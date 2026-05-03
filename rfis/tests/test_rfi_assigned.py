"""
Tests for the ?assigned_to=<member_id> filter on the RFI list endpoint.
"""
from datetime import date, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi

from .utils import _make_user_member


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
