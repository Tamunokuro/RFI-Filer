"""
Unit tests for email type detection and folder matching logic in the pipeline.

These tests exercise _detect_email_type and _match_folder without touching
any IMAP connections or the full pipeline orchestration.
"""
from django.test import TestCase

from email_ingestion.models import InboundEmail
from email_ingestion.pipeline.pipeline import _detect_email_type, _match_folder

from .utils import make_folder


# ---------------------------------------------------------------------------
# Fake ParsedEmail stand-in
# ---------------------------------------------------------------------------

class _Parsed:
    """Minimal stand-in for ParsedEmail — only needs the 3 fields the
    detection functions read."""
    def __init__(self, subject="", body_text="", sender_email="user@example.com"):
        self.subject    = subject
        self.body_text  = body_text
        self.sender_email = sender_email


# ===========================================================================
# _detect_email_type
# ===========================================================================

class DetectEmailTypeRFITests(TestCase):
    """Emails that should be classified as RFI."""

    def test_subject_rfi_prefix(self):
        p = _Parsed(subject="RFI – P-001 – Roof drainage clarification")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.RFI)

    def test_subject_rfi_hyphen(self):
        p = _Parsed(subject="RFI-005 Clarify pipe size")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.RFI)

    def test_body_request_for_information(self):
        p = _Parsed(
            subject="Question about duct layout",
            body_text="This is a request for information regarding the duct layout.",
        )
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.RFI)

    def test_case_insensitive(self):
        p = _Parsed(subject="rfi – clarification needed")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.RFI)

    def test_body_clarification_request(self):
        p = _Parsed(body_text="We have submitted a clarification request for spec 22-10.")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.RFI)


class DetectEmailTypePCNTests(TestCase):
    """Emails that should be classified as PCN / contract change."""

    def test_pcn_in_subject(self):
        p = _Parsed(subject="PCN-007: Roof specification change")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.PCN)

    def test_project_change_notice_in_body(self):
        p = _Parsed(
            subject="Important update",
            body_text="Please be advised a project change notice will be issued.",
        )
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.PCN)

    def test_site_instruction_in_subject(self):
        p = _Parsed(subject="SI-012 Issued – Additional reinforcement")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.PCN)

    def test_change_order_keyword(self):
        p = _Parsed(body_text="A change order has been raised for this work.")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.PCN)

    def test_change_directive_keyword(self):
        p = _Parsed(body_text="CD-003 construction change directive attached.")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.PCN)


class DetectEmailTypeAppTests(TestCase):
    """App notification emails from known service domains."""

    def test_asana_sender(self):
        p = _Parsed(subject="New task assigned", sender_email="no-reply@asana.com")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.APP_EMAIL)

    def test_jira_atlassian_sender(self):
        p = _Parsed(subject="Issue resolved", sender_email="jira@atlassian.net")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.APP_EMAIL)

    def test_github_sender(self):
        p = _Parsed(subject="PR merged", sender_email="notifications@github.com")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.APP_EMAIL)

    def test_monday_sender(self):
        p = _Parsed(subject="Item updated", sender_email="updates@monday.com")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.APP_EMAIL)

    def test_app_takes_priority_over_rfi_keyword(self):
        """An Asana email that happens to mention 'rfi' is still APP_EMAIL."""
        p = _Parsed(
            subject="RFI task assigned in Asana",
            sender_email="notify@asana.com",
        )
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.APP_EMAIL)

    def test_app_takes_priority_over_pcn_keyword(self):
        p = _Parsed(
            subject="PCN task updated",
            sender_email="no-reply@monday.com",
        )
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.APP_EMAIL)


class DetectEmailTypeOtherTests(TestCase):
    """Emails that don't match any known category."""

    def test_generic_project_email(self):
        p = _Parsed(
            subject="Meeting notes – Level 3 coordination",
            body_text="Please find attached the meeting notes from yesterday.",
        )
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.OTHER)

    def test_empty_email(self):
        p = _Parsed(subject="", body_text="", sender_email="unknown@example.com")
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.OTHER)

    def test_pcn_beats_rfi_when_both_present(self):
        """If both RFI and PCN keywords appear, PCN wins (PCN check runs first)."""
        p = _Parsed(
            subject="RFI-001 – A project change notice will follow",
            body_text="",
        )
        self.assertEqual(_detect_email_type(p), InboundEmail.EmailType.PCN)


# ===========================================================================
# _match_folder
# ===========================================================================

class MatchFolderTests(TestCase):
    """Tests for keyword-based folder auto-routing."""

    def test_no_folders_returns_none(self):
        p = _Parsed(subject="Asana task assigned", sender_email="no-reply@asana.com")
        self.assertIsNone(_match_folder(p))

    def test_matches_on_sender_domain(self):
        folder = make_folder(name="Asana", keywords=["asana.com"])
        p = _Parsed(subject="New task", sender_email="no-reply@asana.com")
        self.assertEqual(_match_folder(p), folder)

    def test_matches_on_subject_keyword(self):
        folder = make_folder(name="GitHub", keywords=["github"])
        p = _Parsed(subject="PR #42 merged on GitHub", sender_email="notify@github.com")
        self.assertEqual(_match_folder(p), folder)

    def test_no_match_returns_none(self):
        make_folder(name="Jira", keywords=["jira.atlassian.net", "jira"])
        p = _Parsed(subject="Boring project email", sender_email="pm@example.com")
        self.assertIsNone(_match_folder(p))

    def test_first_matching_folder_returned(self):
        """When multiple folders could match, the first one in name-ordering wins.
        EmailFolder.Meta.ordering = ['name'], so alphabetically earlier names win."""
        make_folder(name="Apps",      keywords=["monday"])
        f_also = make_folder(name="Also Apps", keywords=["monday.com"])
        p = _Parsed(subject="monday.com update", sender_email="no-reply@monday.com")
        result = _match_folder(p)
        # "Also Apps" sorts before "Apps" alphabetically, so it is returned first
        self.assertEqual(result, f_also)

    def test_keyword_matching_is_case_insensitive(self):
        make_folder(name="Asana", keywords=["asana.com"])
        p = _Parsed(subject="ASANA.COM task", sender_email="NO-REPLY@ASANA.COM")
        # Both subject and sender are lowercased before comparison
        self.assertIsNotNone(_match_folder(p))

    def test_empty_keywords_list_does_not_match(self):
        make_folder(name="Empty", keywords=[])
        p = _Parsed(subject="anything", sender_email="user@example.com")
        self.assertIsNone(_match_folder(p))

    def test_normalised_match_handles_spacing_variation(self):
        """'GCKey Sign-In' should match a subject containing 'GC Key Sign-In'."""
        folder = make_folder(name="IRCC", keywords=["GCKey Sign-In"])
        p = _Parsed(subject="GC Key Sign-In notification", sender_email="noreply@gckey.ca")
        self.assertEqual(_match_folder(p), folder)

    def test_normalised_match_handles_hyphen_vs_space(self):
        """Keyword with hyphen matches subject using a space instead."""
        folder = make_folder(name="IRCC", keywords=["GCKey Sign-In"])
        p = _Parsed(subject="GCKey Sign In attempt detected", sender_email="noreply@ircc.ca")
        self.assertEqual(_match_folder(p), folder)

    def test_normalised_match_case_insensitive(self):
        folder = make_folder(name="IRCC", keywords=["GCKey Sign-In"])
        p = _Parsed(subject="GCKEY SIGN IN REQUIRED", sender_email="alerts@canada.ca")
        self.assertEqual(_match_folder(p), folder)

    def test_short_keyword_exact_match_still_works(self):
        """Keywords shorter than 5 alnum chars still use exact substring matching."""
        make_folder(name="Short", keywords=["gc"])
        # "gc" appears literally in the sender domain
        p = _Parsed(subject="New sign-in attempt", sender_email="noreply@gc.ca")
        self.assertIsNotNone(_match_folder(p))

    def test_short_keyword_no_false_positive_via_normalised_path(self):
        """Very short keywords don't accidentally match via the normalised path."""
        make_folder(name="Short", keywords=["in"])
        # "in" does not appear as an exact substring here, and it's < 5 alnum
        # chars so the normalised path is skipped — should be no match.
        p = _Parsed(subject="Project update memo", sender_email="pm@contractor.com")
        self.assertIsNone(_match_folder(p))

    def test_matches_keyword_in_body_text(self):
        """Folder matching now checks the first 400 chars of the body too."""
        folder = make_folder(name="IRCC", keywords=["gckey"])
        p = _Parsed(
            subject="Important account update",
            sender_email="noreply@canada.ca",
            body_text="Please sign in using your GCKey account to complete the process.",
        )
        self.assertEqual(_match_folder(p), folder)
