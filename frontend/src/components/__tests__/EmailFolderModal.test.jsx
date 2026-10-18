import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailFolderModal from "../EmailFolderModal";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EXISTING_FOLDER = {
  id: 5,
  name: "Asana",
  description: "Task notifications from Asana",
  keywords: ["asana.com", "app.asana.com"],
  color: "green",
};

// ── Helper ────────────────────────────────────────────────────────────────────

function renderModal({
  folder  = null,
  onSave  = vi.fn(() => ({ ok: true })),
  onClose = vi.fn(),
} = {}) {
  render(<EmailFolderModal folder={folder} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EmailFolderModal — create mode", () => {
  it("renders 'New Folder' heading", () => {
    renderModal();
    expect(screen.getByText("New Folder")).toBeInTheDocument();
  });

  it("shows a 'Create Folder' submit button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /create folder/i })).toBeInTheDocument();
  });

  it("renders colour picker buttons", () => {
    renderModal();
    // All 7 colour buttons should be present
    const colorSection = screen.getByText("Colour").closest("div");
    const buttons = colorSection.querySelectorAll("button[type='button']");
    expect(buttons.length).toBe(7);
  });

  it("calls onClose when Cancel is clicked", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const { onClose } = renderModal();
    const backdrop = document.querySelector(".fixed.inset-0");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("submits name and keywords to onSave", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ onSave });

    await userEvent.type(screen.getByPlaceholderText(/Asana Notifications/i), "GitHub");

    // Add a keyword via the text input + Add button
    await userEvent.type(screen.getByPlaceholderText(/asana\.com/i), "github.com");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await userEvent.click(screen.getByRole("button", { name: /create folder/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0][0];
    expect(payload.name).toBe("GitHub");
    expect(payload.keywords).toContain("github.com");
  });

  it("adds a keyword when Enter is pressed", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ onSave });

    const kwInput = screen.getByPlaceholderText(/asana\.com/i);
    await userEvent.type(kwInput, "monday.com{Enter}");

    // The input should be cleared after adding
    expect(kwInput).toHaveValue("");
  });

  it("adds a keyword when comma is pressed", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ onSave });

    const kwInput = screen.getByPlaceholderText(/asana\.com/i);
    await userEvent.type(kwInput, "trello.com,");

    // The chip should appear
    expect(screen.getByText("trello.com")).toBeInTheDocument();
  });

  it("does not add duplicate keywords", async () => {
    renderModal();
    const kwInput = screen.getByPlaceholderText(/asana\.com/i);
    await userEvent.type(kwInput, "dup{Enter}");
    await userEvent.type(kwInput, "dup{Enter}");

    // Only one "dup" chip should exist
    const chips = screen.getAllByText("dup");
    expect(chips).toHaveLength(1);
  });

  it("removes a keyword when its X button is clicked", async () => {
    renderModal();
    const kwInput = screen.getByPlaceholderText(/asana\.com/i);
    await userEvent.type(kwInput, "remove-me{Enter}");
    expect(screen.getByText("remove-me")).toBeInTheDocument();

    // Click the remove button on the chip (XCircleIcon button inside the chip)
    const removeBtn = screen.getByText("remove-me").closest("span").querySelector("button");
    await userEvent.click(removeBtn);

    expect(screen.queryByText("remove-me")).toBeNull();
  });

  it("closes after successful save", async () => {
    const onClose = vi.fn();
    const onSave  = vi.fn(() => ({ ok: true }));
    renderModal({ onSave, onClose });

    await userEvent.type(screen.getByPlaceholderText(/Asana Notifications/i), "TestFolder");
    await userEvent.click(screen.getByRole("button", { name: /create folder/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("stays open after failed save", async () => {
    const onClose = vi.fn();
    const onSave  = vi.fn(() => ({ ok: false, errors: { name: ["Already exists"] } }));
    renderModal({ onSave, onClose });

    await userEvent.type(screen.getByPlaceholderText(/Asana Notifications/i), "Dup");
    await userEvent.click(screen.getByRole("button", { name: /create folder/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("EmailFolderModal — edit mode", () => {
  it("renders 'Edit Folder' heading", () => {
    renderModal({ folder: EXISTING_FOLDER });
    expect(screen.getByText("Edit Folder")).toBeInTheDocument();
  });

  it("pre-fills the name field", () => {
    renderModal({ folder: EXISTING_FOLDER });
    expect(screen.getByDisplayValue("Asana")).toBeInTheDocument();
  });

  it("pre-fills the description field", () => {
    renderModal({ folder: EXISTING_FOLDER });
    expect(screen.getByDisplayValue("Task notifications from Asana")).toBeInTheDocument();
  });

  it("renders existing keywords as chips", () => {
    renderModal({ folder: EXISTING_FOLDER });
    expect(screen.getByText("asana.com")).toBeInTheDocument();
    expect(screen.getByText("app.asana.com")).toBeInTheDocument();
  });

  it("shows 'Save Changes' button", () => {
    renderModal({ folder: EXISTING_FOLDER });
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("sends updated data to onSave", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ folder: EXISTING_FOLDER, onSave });

    const nameInput = screen.getByDisplayValue("Asana");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Asana Tasks");

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].name).toBe("Asana Tasks");
  });

  it("can remove a pre-existing keyword", async () => {
    const onSave = vi.fn(() => ({ ok: true }));
    renderModal({ folder: EXISTING_FOLDER, onSave });

    // Remove "asana.com" chip
    const asanaChip = screen.getByText("asana.com").closest("span");
    const removeBtn = asanaChip.querySelector("button");
    await userEvent.click(removeBtn);

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0][0];
    expect(payload.keywords).not.toContain("asana.com");
    expect(payload.keywords).toContain("app.asana.com");
  });
});
