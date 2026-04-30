"""
email_ingestion.matching.result
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
MatchResult value object returned by every matcher strategy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rfis.models import Project


@dataclass(frozen=True)
class MatchResult:
    """
    The outcome of a project-matching attempt.

    confidence  — float in [0.0, 1.0]
                  1.0  → certain (exact project number hit)
                  ≥0.85 → auto-create threshold (configurable per EmailConfig)
                  <0.85 → queue for manual review
                  0.0  → no match found

    reason      — short human-readable explanation shown in the review UI
                  e.g. "Exact project number '2024-001' found in subject"

    project     — the matched Project instance, or None if confidence == 0
    """

    project: "Project | None"
    confidence: float
    reason: str

    @property
    def has_match(self) -> bool:
        return self.project is not None

    @classmethod
    def no_match(cls, reason: str = "No project match found") -> "MatchResult":
        return cls(project=None, confidence=0.0, reason=reason)
