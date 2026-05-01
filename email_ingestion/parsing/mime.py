"""
email_ingestion.parsing.mime
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Standard MIME email parser.

Handles:
  - Multipart messages (text/plain preferred over text/html)
  - Encoded headers (RFC 2047 — e.g. =?UTF-8?B?...?=)
  - Quoted-printable and base64 body encoding
  - Attachment extraction (any part with a filename)
  - Quoted-reply stripping (lines starting with ">")
  - Missing / malformed Date headers (falls back to server_received_at)
"""

from __future__ import annotations

import email as email_lib
import logging
import re
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime

from email_ingestion.parsing.base import BaseEmailParser
from email_ingestion.parsing.dataclasses import ParsedAttachment, ParsedEmail, RawEmail

logger = logging.getLogger(__name__)

# Lines that mark the beginning of a quoted reply block
_QUOTE_PATTERNS = re.compile(
    r"^(>|On .+wrote:|From:.+|_{10,}|-{10,}|_{3,}\s*$)",
    re.MULTILINE | re.IGNORECASE,
)

# Filenames that are email client artefacts rather than real attachments
_SKIP_FILENAMES = {"winmail.dat", "smime.p7m", "smime.p7s"}


class MimeEmailParser(BaseEmailParser):
    """
    Parses RFC 2822 / MIME messages into ParsedEmail value objects.

    Stateless — safe to reuse across threads.
    """

    def parse(self, raw: RawEmail) -> ParsedEmail:
        msg: Message = email_lib.message_from_bytes(raw.raw_bytes)

        message_id = self._header(msg, "Message-ID") or raw.uid
        received_at = self._parse_date(msg, raw)
        sender_name, sender_email = self._parse_sender(msg)
        subject = self._header(msg, "Subject")
        body_text = self._extract_body(msg)
        attachments = self._extract_attachments(msg)

        return ParsedEmail(
            message_id=message_id.strip("<>").strip(),
            received_at=received_at,
            sender_name=sender_name,
            sender_email=sender_email.lower(),
            subject=subject,
            body_text=self._strip_quoted_replies(body_text),
            attachments=tuple(attachments),
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _header(msg: Message, name: str) -> str:
        """Decode an RFC 2047-encoded header into plain unicode."""
        raw_value = msg.get(name, "")
        if not raw_value:
            return ""
        try:
            return str(make_header(decode_header(raw_value)))
        except Exception:
            return raw_value  # Return as-is if decoding fails

    @staticmethod
    def _parse_date(msg: Message, raw: RawEmail):
        """Parse the Date header; fall back to server_received_at."""
        date_str = msg.get("Date", "")
        if date_str:
            try:
                return parsedate_to_datetime(date_str)
            except Exception:
                logger.debug("Could not parse Date header '%s'", date_str)
        return raw.server_received_at

    @classmethod
    def _parse_sender(cls, msg: Message) -> tuple[str, str]:
        """Return (display_name, email_address) from the From header."""
        raw_from = cls._header(msg, "From")
        name, addr = parseaddr(raw_from)
        return name or "", addr or ""

    @classmethod
    def _extract_body(cls, msg: Message) -> str:
        """
        Walk the MIME tree and return the best plain-text body.
        Prefers text/plain over text/html; skips attachments.
        """
        plain_parts: list[str] = []
        html_parts: list[str] = []

        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = part.get("Content-Disposition", "")

            # Skip attachments
            if "attachment" in disposition:
                continue

            if content_type == "text/plain":
                plain_parts.append(cls._decode_part(part))
            elif content_type == "text/html" and not plain_parts:
                # Only fall back to HTML if we never found plain text
                html_parts.append(cls._html_to_text(cls._decode_part(part)))

        return "\n\n".join(plain_parts or html_parts).strip()

    @staticmethod
    def _decode_part(part: Message) -> str:
        """Decode a message part's payload to a unicode string."""
        payload = part.get_payload(decode=True)
        if not payload:
            return ""
        charset = part.get_content_charset() or "utf-8"
        try:
            return payload.decode(charset, errors="replace")
        except (LookupError, UnicodeDecodeError):
            return payload.decode("utf-8", errors="replace")

    @staticmethod
    def _html_to_text(html: str) -> str:
        """Very lightweight HTML → text: strip tags, collapse whitespace."""
        text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"&nbsp;", " ", text)
        text = re.sub(r"&amp;", "&", text)
        text = re.sub(r"&lt;", "<", text)
        text = re.sub(r"&gt;", ">", text)
        return text.strip()

    @staticmethod
    def _strip_quoted_replies(text: str) -> str:
        """
        Remove quoted reply sections from the body so only the new
        content is stored and sent to the matcher.
        """
        lines = text.splitlines()
        clean: list[str] = []
        for line in lines:
            if _QUOTE_PATTERNS.match(line):
                break  # Everything after this point is a quoted reply
            clean.append(line)
        return "\n".join(clean).strip()

    @classmethod
    def _extract_attachments(cls, msg: Message) -> list[ParsedAttachment]:
        """Return all real file attachments found in the MIME tree."""
        attachments: list[ParsedAttachment] = []

        for part in msg.walk():
            disposition = part.get("Content-Disposition", "")
            filename = part.get_filename()

            if not filename or "attachment" not in disposition:
                continue

            # Decode RFC 2047-encoded filenames
            try:
                filename = str(make_header(decode_header(filename)))
            except Exception:
                pass

            if filename.lower() in _SKIP_FILENAMES:
                continue

            payload = part.get_payload(decode=True)
            if not payload:
                continue

            attachments.append(
                ParsedAttachment(
                    filename=filename,
                    content_type=part.get_content_type() or "application/octet-stream",
                    payload=payload,
                )
            )

        return attachments
