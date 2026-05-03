"""
Tests for project creation / editing permissions and the per-project
member-management endpoints (add / remove / toggle admin).
Also covers member invite (admin-only) and MemberDetail edit guards.
"""
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership

from .utils import _make_user_member

User = get_user_model()


class ProjectManagementTests(APITestCase):
    """
    Permission and behaviour tests for project create / edit and the
    per-project member-management endpoints.
    """

    def setUp(self):
        self.admin_user, self.admin_member = _make_user_member(
            "pm_admin", Member.Role.PROJECT_MANAGER
        )
        self.admin_member.is_admin = True
        self.admin_member.save(update_fields=["is_admin"])

        self.pm_user, self.pm_member = _make_user_member(
            "pm_pm", Member.Role.PROJECT_MANAGER
        )
        self.contractor_user, self.contractor_member = _make_user_member(
            "pm_contractor", Member.Role.CONTRACTOR
        )
        self.designer_user, self.designer_member = _make_user_member(
            "pm_designer", Member.Role.PROJECT_DESIGNER
        )

    # ── Project creation ──────────────────────────────────────────────────────

    def test_admin_can_create_project(self):
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(reverse("rfis:project-list"), {
            "project_number": "P-001",
            "project_name": "Hospital",
            "project_manager": self.pm_member.id,
        })
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["project_number"], "P-001")

    def test_pm_can_create_project(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(reverse("rfis:project-list"), {
            "project_number": "P-002",
            "project_name": "Bridge",
            "project_manager": self.pm_member.id,
        })
        self.assertEqual(r.status_code, 201)

    def test_contractor_cannot_create_project(self):
        self.client.force_authenticate(self.contractor_user)
        r = self.client.post(reverse("rfis:project-list"), {
            "project_number": "P-003",
            "project_name": "Sneaky",
        })
        self.assertEqual(r.status_code, 403)

    def test_designer_cannot_create_project(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.post(reverse("rfis:project-list"), {
            "project_number": "P-004",
            "project_name": "Sneaky",
        })
        self.assertEqual(r.status_code, 403)

    def test_pm_auto_added_as_project_admin_on_creation(self):
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(reverse("rfis:project-list"), {
            "project_number": "P-AUTO",
            "project_name": "Auto Add",
            "project_manager": self.pm_member.id,
        })
        self.assertEqual(r.status_code, 201)
        proj_id = r.data["id"]
        membership = ProjectMembership.objects.get(
            project_id=proj_id, member=self.pm_member
        )
        self.assertTrue(membership.is_project_admin)

    # ── Project edit / delete permissions ─────────────────────────────────────

    def test_only_pm_or_admin_can_patch_project(self):
        proj = Project.objects.create(
            project_number="P-PATCH", project_name="Patchable",
            project_manager=self.pm_member,
        )
        self.client.force_authenticate(self.contractor_user)
        r = self.client.patch(
            reverse("rfis:project-detail", args=[proj.pk]),
            {"project_name": "Hijacked"},
        )
        self.assertEqual(r.status_code, 403)

        self.client.force_authenticate(self.pm_user)
        r = self.client.patch(
            reverse("rfis:project-detail", args=[proj.pk]),
            {"project_name": "Renamed"},
        )
        self.assertEqual(r.status_code, 200)
        proj.refresh_from_db()
        self.assertEqual(proj.project_name, "Renamed")

    def test_only_admin_can_delete_project(self):
        proj = Project.objects.create(
            project_number="P-DEL", project_name="Deletable",
            project_manager=self.pm_member,
        )
        self.client.force_authenticate(self.pm_user)
        r = self.client.delete(reverse("rfis:project-detail", args=[proj.pk]))
        self.assertEqual(r.status_code, 403)

        self.client.force_authenticate(self.admin_user)
        r = self.client.delete(reverse("rfis:project-detail", args=[proj.pk]))
        self.assertEqual(r.status_code, 204)
        self.assertFalse(Project.objects.filter(pk=proj.pk).exists())

    # ── Project member management ────────────────────────────────────────────

    def _make_project(self):
        return Project.objects.create(
            project_number="P-TEAM", project_name="Team Test",
            project_manager=self.pm_member,
        )

    def test_pm_can_add_member_to_project(self):
        proj = self._make_project()
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:project-members", args=[proj.pk])
        r = self.client.post(url, {
            "member_id": self.designer_member.id,
            "role": self.designer_member.role,
        })
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(
            ProjectMembership.objects.filter(
                project=proj, member=self.designer_member
            ).exists()
        )

    def test_contractor_cannot_add_member_to_project(self):
        proj = self._make_project()
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:project-members", args=[proj.pk])
        r = self.client.post(url, {"member_id": self.designer_member.id})
        self.assertEqual(r.status_code, 403)

    def test_cannot_add_same_member_twice(self):
        proj = self._make_project()
        ProjectMembership.objects.create(
            project=proj, member=self.designer_member,
            role=self.designer_member.role,
        )
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:project-members", args=[proj.pk])
        r = self.client.post(url, {"member_id": self.designer_member.id})
        self.assertEqual(r.status_code, 400)

    def test_pm_can_remove_member_from_project(self):
        proj = self._make_project()
        ProjectMembership.objects.create(
            project=proj, member=self.designer_member,
            role=self.designer_member.role,
        )
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:project-member-detail", args=[proj.pk, self.designer_member.id])
        r = self.client.delete(url)
        self.assertEqual(r.status_code, 204)
        self.assertFalse(
            ProjectMembership.objects.filter(
                project=proj, member=self.designer_member
            ).exists()
        )

    def test_cannot_remove_project_manager_directly(self):
        proj = self._make_project()
        ProjectMembership.objects.create(
            project=proj, member=self.pm_member,
            role=self.pm_member.role, is_project_admin=True,
        )
        self.client.force_authenticate(self.admin_user)
        url = reverse("rfis:project-member-detail", args=[proj.pk, self.pm_member.id])
        r = self.client.delete(url)
        self.assertEqual(r.status_code, 400)

    def test_pm_can_promote_member_to_project_admin(self):
        proj = self._make_project()
        ProjectMembership.objects.create(
            project=proj, member=self.designer_member,
            role=self.designer_member.role,
        )
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:project-member-detail", args=[proj.pk, self.designer_member.id])
        r = self.client.patch(url, {"is_project_admin": True})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["is_project_admin"])

    # ── Member invite ─────────────────────────────────────────────────────────

    def test_admin_can_invite_member(self):
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(reverse("rfis:member-invite"), {
            "name": "Newbie Designer",
            "email": "newbie@example.com",
            "role": Member.Role.PROJECT_DESIGNER,
            "company": "ACME",
        })
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(Member.objects.filter(email="newbie@example.com").exists())
        new_user = User.objects.get(email="newbie@example.com")
        self.assertFalse(new_user.has_usable_password())

    def test_non_admin_cannot_invite_member(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(reverse("rfis:member-invite"), {
            "name": "Sneaky",
            "email": "sneaky@example.com",
            "role": Member.Role.PROJECT_DESIGNER,
        })
        self.assertEqual(r.status_code, 403)

    def test_invite_rejects_duplicate_email(self):
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(reverse("rfis:member-invite"), {
            "name": "Dup",
            "email": self.pm_member.email,
            "role": Member.Role.PROJECT_DESIGNER,
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn("email", r.data)

    def test_invite_validates_role(self):
        self.client.force_authenticate(self.admin_user)
        r = self.client.post(reverse("rfis:member-invite"), {
            "name": "Bad Role",
            "email": "badrole@example.com",
            "role": "Wizard",
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn("role", r.data)

    # ── Member edit permissions ──────────────────────────────────────────────

    def test_member_cannot_edit_other_member(self):
        self.client.force_authenticate(self.contractor_user)
        url = reverse("rfis:member_detail", args=[self.designer_member.id])
        r = self.client.patch(url, {"name": "Hacked"})
        self.assertEqual(r.status_code, 403)

    def test_admin_can_edit_any_member(self):
        self.client.force_authenticate(self.admin_user)
        url = reverse("rfis:member_detail", args=[self.designer_member.id])
        r = self.client.patch(url, {"name": "Renamed by admin"})
        self.assertEqual(r.status_code, 200)
        self.designer_member.refresh_from_db()
        self.assertEqual(self.designer_member.name, "Renamed by admin")

    def test_member_can_edit_themselves(self):
        self.client.force_authenticate(self.designer_user)
        url = reverse("rfis:member_detail", args=[self.designer_member.id])
        r = self.client.patch(url, {"name": "Self renamed"})
        self.assertEqual(r.status_code, 200)

    def test_non_admin_cannot_self_promote_to_admin(self):
        self.client.force_authenticate(self.designer_user)
        url = reverse("rfis:member_detail", args=[self.designer_member.id])
        r = self.client.patch(url, {"is_admin": True})
        self.assertEqual(r.status_code, 200)
        self.designer_member.refresh_from_db()
        self.assertFalse(self.designer_member.is_admin)

    def test_only_admin_can_delete_member(self):
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:member_detail", args=[self.designer_member.id])
        r = self.client.delete(url)
        self.assertEqual(r.status_code, 403)
