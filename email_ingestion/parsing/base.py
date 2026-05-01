"""
email_ingestion.parsing.base
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Abstract contract for email parsers.

A parser takes a RawEmail (bytes off the wire) and returns a ParsedEmail
(clean, decoded, structured data). Swapping parsing libraries or adding
provider-specific pre-processing means adding a new subclass here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from email_ingestion.parsing.dataclasses import ParsedEmail, RawEmail


class BaseEmailParser(ABC):

    @abstractmethod
    def parse(self, raw: RawEmail) -> ParsedEmail:
        """
        Decode a RawEmail into a ParsedEmail.

        Must never raise — if a field cannot be extracted it should
        fall back to a safe empty value and log a warning.
        """
        ...


class ParserError(Exception):
    """Raised when a message is so malformed it cannot be parsed at all."""
    pass
