import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailConfigModal from "../EmailConfigModal";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EXISTING_CONFIG = {
  id: 1,
  label: "RFI Inbox",
  provider: "gmail",
  username: "rfi@example.com",
  mailbox: "INBOX",
  is_active: true,
  gmail_primary_only: true,
  auto_create_threshold: 0.85,
  subject_format_hint: "RFI – {project_number} – {rfi_name}",
};

// ── Helper ────────────────────────────────────────────────────────────────────

function renderModal({ config = null, onSave = vi.fn(() => ({ ok: true })), onClose = vi.fn() } = {}) {
  render(<EmailConfigModal config={config} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EmailConfigModal — create mode", () => {
  it("renders 'Add Inbox to Watch' heading", () => {
    renderModal();
    expect(screen.getByText("Add Inbox to Watch")).toBeInTheDocument();
  });

  it("shows an 'Add Inbox' submit button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /add inbox/i })).toBeInTheDocument();
  });

  it("shows Gmail App Password hint when Gmail provider is selected", () => {
    renderModal();
    // Gmail is the default provider — the info box references App Password
    expect(screen.getByText(/Gmail requires a 16-character/i)).toBeInTheDocument();
  });

  it("hides the App Password hint when Outlook is selected", async () => {
    renderModal();
    const select = screen.getByDisplayValue("Gmail");
    await userEvent.selectOptions(select, "outlook");
    expect(screen.queryByText(/App Password/i)).toBeNull();
  });

  it("shows IMAP host/port fields only for 'Other' provider", async () => {
    renderModal();
    expect(screen.queryByPlaceholderText("mail.example.com")).toBeNull();

    const select = screen.getByDisplayValue("Gmail");
    await userEvent.selectOptions(select, "other");
    expect(screen.getByPlaceholderText("mail.example.com")).toBeInTheDocument();
  });

  it("auto-fills Gmail IMAP info text when Gmail is selected", () => {
    renderModal();
    expect(screen.getByText(/imap\.gmail\.com/)).toBeInTheDocument();
  });

  it("auto-fills Outlook IMAP info text when Outlook is selected", async () => {
    renderModal();
    const select = screen.getByDisplayValue("Gmail");
    await userEvent.selectOptions(select, "outlook");
    expect(screen.getByText(/outlook\.office365\.com/)).toBeInTheDocument();
  });

  it("calls onClose when the Cancel button is clicked", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const { onClose } = renderModal();
    // The backdrop is the outermost div
    const backdrop = document.querySelector(".fixed.inset-0");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("submits form data to onSave on valid submit", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ onSave });

    await userEvent.type(screen.getByPlaceholderText(/e\.g\. "Project RFI Inbox"/i), "My Inbox");
    await userEvent.type(screen.getByPlaceholderText("rfi-inbox@company.com"), "inbox@example.com");
    await userEvent.type(screen.getByPlaceholderText(/Enter password/i), "secretpass");

    await userEvent.click(screen.getByRole("button", { name: /add inbox/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [payload] = onSave.mock.calls[0];
    expect(payload.label).toBe("My Inbox");
    expect(payload.username).toBe("inbox@example.com");
    expect(payload.password).toBe("secretpass");
  });

  it("closes modal when onSave returns ok:true", async () => {
    const onClose = vi.fn();
    const onSave  = vi.fn(() => ({ ok: true }));
    renderModal({ onSave, onClose });

    await userEvent.type(screen.getByPlaceholderText(/e\.g\. "Project RFI Inbox"/i), "X");
    await userEvent.type(screen.getByPlaceholderText("rfi-inbox@company.com"), "x@x.com");
    await userEvent.type(screen.getByPlaceholderText(/Enter password/i), "pw");
    await userEvent.click(screen.getByRole("button", { name: /add inbox/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does NOT close modal when onSave returns ok:false", async () => {
    const onClose = vi.fn();
    const onSave  = vi.fn(() => ({ ok: false, errors: { label: ["Already exists."] } }));
    renderModal({ onSave, onClose });

    // Use a valid email so HTML5 validation doesn't block submission
    await userEvent.type(screen.getByPlaceholderText(/e\.g\. "Project RFI Inbox"/i), "Duplicate");
    await userEvent.type(screen.getByPlaceholderText("rfi-inbox@company.com"), "dupe@example.com");
    await userEvent.type(screen.getByPlaceholderText(/Enter password/i), "pw");
    await userEvent.click(screen.getByRole("button", { name: /add inbox/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("EmailConfigModal — edit mode", () => {
  it("renders 'Edit Inbox' heading", () => {
    renderModal({ config: EXISTING_CONFIG });
    expect(screen.getByText("Edit Inbox")).toBeInTheDocument();
  });

  it("pre-fills the label field", () => {
    renderModal({ config: EXISTING_CONFIG });
    expect(screen.getByDisplayValue("RFI Inbox")).toBeInTheDocument();
  });

  it("pre-fills the username field", () => {
    renderModal({ config: EXISTING_CONFIG });
    expect(screen.getByDisplayValue("rfi@example.com")).toBeInTheDocument();
  });

  it("pre-fills the subject_format_hint field", () => {
    renderModal({ config: EXISTING_CONFIG });
    expect(screen.getByDisplayValue("RFI – {project_number} – {rfi_name}")).toBeInTheDocument();
  });

  it("shows '(leave blank to keep current)' hint on the password field", () => {
    renderModal({ config: EXISTING_CONFIG });
    expect(screen.getByText(/leave blank to keep current/i)).toBeInTheDocument();
  });

  it("shows 'Save Changes' submit button", () => {
    renderModal({ config: EXISTING_CONFIG });
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("sends updated payload to onSave", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ config: EXISTING_CONFIG, onSave });

    const labelInput = screen.getByDisplayValue("RFI Inbox");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "Updated Inbox");

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].label).toBe("Updated Inbox");
  });

  it("removes password key from payload when left blank in edit mode", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ config: EXISTING_CONFIG, onSave });

    // Don't type into the password field — leave it blank
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // In edit mode with no password typed, the modal deletes the key
    // so the hook (and backend PATCH) won't overwrite the stored password.
    const payload = onSave.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(payload, "password")).toBe(false);
  });
});

describe("EmailConfigModal — auto-create threshold slider", () => {
  it("displays current threshold percentage", () => {
    renderModal({ config: { ...EXISTING_CONFIG, auto_create_threshold: 0.75 } });
    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });
});
