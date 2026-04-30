"""
email_ingestion.matching.base
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Abstract contract for project-matching strategies.

Each strategy receives a ParsedEmail and returns a MatchResult.
The CompositeProjectMatcher runs all registered strategies and
selects the one with the highest confidence score.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from email_ingestion.matching.result import MatchResult
    from email_ingestion.parsing.dataclasses import ParsedEmail


class BaseMatcher(ABC):

    @abstractmethod
    def match(self, parsed: "ParsedEmail") -> "MatchResult":
        """
        Attempt to identify which Project this email belongs to.
        Must always return a MatchResult — never raise.
        Return MatchResult.no_match() when no project can be identified.
        """
        ...

    @property
    def strategy_name(self) -> str:
        return self.__class__.__name__
