"""
email_ingestion.parsing.dataclasses
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Immutable value objects that flow between pipeline layers.

Using dataclasses keeps the data contract explicit and typed without
tying intermediate state to any Django model.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class RawEmail:
    """
    The raw bytes coming off the wire from the provider.
    Nothing has been interpreted yet — this is provider output.
    """

    uid: str                          # Provider-assigned UID (IMAP UID, Graph message id, …)
    raw_bytes: bytes                  # Full RFC 2822 message bytes
    server_received_at: datetime      # IMAP INTERNALDATE or equivalent


@dataclass(frozen=True)
class ParsedAttachment:
    """A single decoded attachment extracted from a MIME message."""

    filename: str
    content_type: str
    payload: bytes                    # Raw decoded bytes — saved to disk by the pipeline
    size: int = field(init=False)

    def __post_init__(self) -> None:
        # frozen=True means we can't assign directly; use object.__setattr__
        object.__setattr__(self, "size", len(self.payload))


@dataclass(frozen=True)
class ParsedEmail:
    """
    Fully decoded email ready for the matching layer.
    All string fields are clean unicode; attachments are decoded bytes.
    """

    # Identity
    message_id: str                   # RFC 2822 Message-ID header (dedup key)
    received_at: datetime             # Date header, falling back to server_received_at

    # Sender
    sender_name: str
    sender_email: str

    # Content
    subject: str
    body_text: str                    # Plain-text body, quoted replies stripped

    # Attachments
    attachments: tuple[ParsedAttachment, ...] = field(default_factory=tuple)
