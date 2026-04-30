"""
email_ingestion.matching.strategies
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Concrete matching strategies, each targeting a different signal in the email.

ExactProjectNumberMatcher   — regex scan for a known project number
FuzzyProjectNameMatcher     — rapidfuzz similarity against project names
KeywordRfiMatcher           — detects "RFI" language (boosts composite score)

Strategies are stateless and thread-safe. They query the DB on every call
so freshly added projects are always visible without restarting the server.
"""

from __future__ import annotations

import logging
import re

from rapidfuzz import fuzz, process

from rfis.models import Project
from email_ingestion.matching.base import BaseMatcher
from email_ingestion.matching.result import MatchResult
from email_ingestion.parsing.dataclasses import ParsedEmail

logger = logging.getLogger(__name__)

# Keywords that strongly indicate an RFI-related email
_RFI_KEYWORDS = re.compile(
    r"\b(rfi|request\s+for\s+information|clarification\s+request|technical\s+query)\b",
    re.IGNORECASE,
)

# Patterns that look like project numbers, e.g. 2024-001, P-2024-001, #2024-001
_PROJECT_NUMBER_PATTERN = re.compile(
    r"(?:project\s*[:#]?\s*|#\s*)?([A-Z0-9]{1,6}[-/]\d{3,6}(?:[-/][A-Z0-9]+)?)",
    re.IGNORECASE,
)


class ExactProjectNumberMatcher(BaseMatcher):
    """
    Scans the email subject and first 500 chars of body for a token that
    exactly matches a project_number in the database (case-insensitive).

    Returns confidence 1.0 on an exact hit — this is the strongest signal
    and no further matching is needed when it fires.
    """

    def match(self, parsed: ParsedEmail) -> MatchResult:
        search_text = f"{parsed.subject} {parsed.body_text[:500]}"
        candidates = _PROJECT_NUMBER_PATTERN.findall(search_text)

        if not candidates:
            return MatchResult.no_match("No project-number pattern found in subject/body")

        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_candidates = [
            c for c in (c.upper() for c in candidates) if not (c in seen or seen.add(c))
        ]

        projects = {
            p.project_number.upper(): p
            for p in Project.objects.filter(
                project_number__iregex="|".join(re.escape(c) for c in unique_candidates)
            )
        }

        for candidate in unique_candidates:
            if candidate in projects:
                project = projects[candidate]
                reason = (
                    f"Exact project number '{project.project_number}' "
                    f"found in {'subject' if candidate in parsed.subject.upper() else 'body'}"
                )
                logger.debug("ExactProjectNumberMatcher: %s → %s", candidate, project)
                return MatchResult(project=project, confidence=1.0, reason=reason)

        return MatchResult.no_match(
            f"Candidate numbers {unique_candidates} not found in database"
        )


class FuzzyProjectNameMatcher(BaseMatcher):
    """
    Uses rapidfuzz token_set_ratio to find the project whose name best
    matches the email subject.

    Confidence is scaled from the fuzzy score (0–100) into (0–0.82) so
    fuzzy matches can never meet the auto-create threshold on their own —
    they need to combine with keyword detection via the composite matcher.
    """

    # Minimum raw fuzzy score (0–100) to return any result
    MIN_SCORE = 65

    def match(self, parsed: ParsedEmail) -> MatchResult:
        projects = list(Project.objects.values_list("id", "project_name", "project_number"))

        if not projects:
            return MatchResult.no_match("No projects in database")

        project_names = [f"{pnum} {pname}" for _, pname, pnum in projects]

        result = process.extractOne(
            parsed.subject,
            project_names,
            scorer=fuzz.token_set_ratio,
            score_cutoff=self.MIN_SCORE,
        )

        if result is None:
            return MatchResult.no_match(
                f"Fuzzy match below threshold ({self.MIN_SCORE}) for subject: '{parsed.subject[:80]}'"
            )

        matched_str, score, idx = result
        proj_id = projects[idx][0]

        try:
            project = Project.objects.get(pk=proj_id)
        except Project.DoesNotExist:
            return MatchResult.no_match("Matched project no longer exists")

        # Scale 65–100 raw score → 0.55–0.82 confidence
        confidence = round(0.55 + (score - self.MIN_SCORE) / (100 - self.MIN_SCORE) * 0.27, 3)

        reason = (
            f"Fuzzy name match '{project.project_name}' "
            f"(score {score:.0f}/100) against subject"
        )
        logger.debug("FuzzyProjectNameMatcher: score=%s → %s (conf=%.2f)", score, project, confidence)
        return MatchResult(project=project, confidence=confidence, reason=reason)


class KeywordRfiMatcher(BaseMatcher):
    """
    Detects RFI-related keywords in the subject/body.

    Does NOT return a project on its own (confidence stays at 0) but
    the CompositeProjectMatcher uses this as a confidence boost signal
    when combined with a fuzzy or exact match.
    """

    def match(self, parsed: ParsedEmail) -> MatchResult:
        text = f"{parsed.subject} {parsed.body_text[:300]}"
        if _RFI_KEYWORDS.search(text):
            logger.debug("KeywordRfiMatcher: RFI keywords detected")
            # No project — this strategy only acts as a signal
            return MatchResult(
                project=None,
                confidence=0.0,
                reason="RFI keywords detected in subject/body",
            )
        return MatchResult.no_match("No RFI keywords detected")
