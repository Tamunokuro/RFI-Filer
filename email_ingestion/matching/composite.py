"""
email_ingestion.matching.composite
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CompositeProjectMatcher — runs all registered strategies and combines
their scores into a single best MatchResult.

Combination rules
-----------------
1. If ExactProjectNumberMatcher fires (confidence 1.0) → return immediately.
2. Otherwise collect all non-zero project results, group by project, and
   keep the highest base confidence.
3. If KeywordRfiMatcher detected RFI language, boost the top candidate by
   RFI_KEYWORD_BOOST (default 0.12) — this can push a strong fuzzy match
   over the auto-create threshold.
4. Return the highest-scoring result, or MatchResult.no_match() if nothing
   was found.

Adding a new strategy:
  - Create it in strategies.py (implement BaseMatcher)
  - Add an instance to _DEFAULT_STRATEGIES below
"""

from __future__ import annotations

import logging
from typing import Sequence

from email_ingestion.matching.base import BaseMatcher
from email_ingestion.matching.result import MatchResult
from email_ingestion.matching.strategies import (
    ExactProjectNumberMatcher,
    FuzzyProjectNameMatcher,
    KeywordRfiMatcher,
)
from email_ingestion.parsing.dataclasses import ParsedEmail

logger = logging.getLogger(__name__)

RFI_KEYWORD_BOOST = 0.12  # Applied when RFI keywords are present

_DEFAULT_STRATEGIES: list[BaseMatcher] = [
    ExactProjectNumberMatcher(),
    FuzzyProjectNameMatcher(),
    KeywordRfiMatcher(),
]


class CompositeProjectMatcher:
    """
    Runs a list of BaseMatcher strategies and returns the best combined result.

    Designed to be instantiated once and reused (all strategies are stateless).
    """

    def __init__(self, strategies: Sequence[BaseMatcher] | None = None) -> None:
        self._strategies: list[BaseMatcher] = list(strategies or _DEFAULT_STRATEGIES)

    def match(self, parsed: ParsedEmail) -> MatchResult:
        results: list[MatchResult] = []
        rfi_keywords_found = False

        for strategy in self._strategies:
            try:
                result = strategy.match(parsed)
            except Exception:
                logger.exception(
                    "Strategy %s raised an unexpected error — skipping",
                    strategy.strategy_name,
                )
                continue

            logger.debug(
                "%s → project=%s conf=%.2f reason=%s",
                strategy.strategy_name,
                result.project,
                result.confidence,
                result.reason,
            )

            # Exact match: return immediately — no need to check other strategies
            if result.confidence == 1.0 and result.project:
                return result

            # Track keyword signal separately
            if isinstance(strategy, KeywordRfiMatcher) and result.reason.startswith("RFI"):
                rfi_keywords_found = True
                continue  # KeywordRfiMatcher never carries a project

            if result.has_match:
                results.append(result)

        if not results:
            return MatchResult.no_match(
                "No strategy produced a project match"
                + (" (RFI keywords present)" if rfi_keywords_found else "")
            )

        # Pick the highest-confidence result among all strategies
        best = max(results, key=lambda r: r.confidence)

        # Apply RFI keyword boost
        if rfi_keywords_found:
            boosted_confidence = min(1.0, round(best.confidence + RFI_KEYWORD_BOOST, 3))
            reason = f"{best.reason} + RFI keyword boost (+{RFI_KEYWORD_BOOST})"
            best = MatchResult(
                project=best.project,
                confidence=boosted_confidence,
                reason=reason,
            )
            logger.debug(
                "Keyword boost applied → conf=%.2f for project %s",
                best.confidence,
                best.project,
            )

        return best
