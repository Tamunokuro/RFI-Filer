"""
Tests for RFI status serialization and list-endpoint status filtering.
"""
from datetime import date, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi

from .utils import _make_user_member


class RfiStatusSerializationTests(APITestCase):
    def test_rfi_list_response_includes_status(self):
        user, member = _make_user_member("lister", Member.Role.PROJECT_MANAGER)
        project = Project.objects.create(
            project_number="P2", project_name="P2", project_manager=member
        )
        ProjectMembership.objects.create(project=project, member=member, role=member.role)
        Rfi.objects.create(
            project=project, author=user, trade="M", rfi_name="n", rfi_number="RN",
            received_date=date.today(), due_date=date.today(),
        )
        self.client.force_authenticate(user)
        r = self.client.get(reverse("rfis:rfi-list"))
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["results"][0]["status"], Rfi.Status.OPEN)


class RfiListStatusFilterTests(APITestCase):
    """Verify the list endpoint accepts comma-separated status filters."""

    def setUp(self):
        self.user, self.member = _make_user_member("lf_pm", Member.Role.PROJECT_MANAGER)
        project = Project.objects.create(
            project_number="LF-001", project_name="List Filter",
            project_manager=self.member,
        )
        ProjectMembership.objects.create(
            project=project, member=self.member, role=self.member.role
        )
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
        self.client.force_authenticate(self.user)
        r = self.client.get(reverse("rfis:rfi-list"))
        self.assertGreaterEqual(r.data["count"], 5)
