"""
Tests for the RFI discussion thread:
  - posting and listing comments
  - official response submission and role guards
  - unread-tracking (mark-read / unread summary)
"""
from datetime import date, timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Rfi, RfiComment, RfiReadState

from .utils import _make_user_member


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
                status=Rfi.Status.UNDER_REVIEW,
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
