import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../../components/Header",           () => ({ default: () => <div /> }));
vi.mock("../../components/Footer",           () => ({ default: () => <div /> }));
vi.mock("../../components/EmailReviewModal", () => ({
  default: ({ onClose }) => (
    <div data-testid="review-modal">
      <button onClick={() => onClose(false)}>Close</button>
      <button onClick={() => onClose(true)}>Close with change</button>
    </div>
  ),
}));

import api from "../../api";
import EmailInbox from "../EmailInbox";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONFIG_A = {
  id: 1, label: "RFI Inbox", provider: "gmail", provider_display: "Gmail",
  username: "rfi@example.com", mailbox: "INBOX", is_active: true,
  auto_create_threshold: 0.85, subject_format_hint: "RFI – {project_number}",
  last_polled_at: null, gmail_primary_only: true,
};

const FOLDER_A = {
  id: 10, name: "Asana", description: "", keywords: ["asana.com"],
  color: "indigo", email_count: 2,
};

const EMAIL_RFI = {
  id: 101, sender_name: "John", sender_email: "john@contractor.com",
  subject: "RFI – P-001 – Roof drainage",
  received_at: "2025-05-10T09:00:00Z",
  project_name: "Hospital",  project_number: "P-001",
  confidence: 0.92,
  status: "pending", status_display: "Pending Review",
  email_type: "rfi", email_type_display: "RFI",
  attachment_count: 0, rfi_number: null, folder_name: null,
};

const EMAIL_PCN = {
  id: 102, sender_name: "Consultant", sender_email: "c@consultant.com",
  subject: "PCN-007 Change Notice",
  received_at: "2025-05-11T10:00:00Z",
  project_name: "Hospital",  project_number: "P-001",
  confidence: 0.75,
  status: "pending", status_display: "Pending Review",
  email_type: "pcn", email_type_display: "PCN",
  attachment_count: 1, rfi_number: null, folder_name: null,
};

const EMAIL_APP = {
  id: 103, sender_name: "Asana", sender_email: "no-reply@asana.com",
  subject: "New task assigned to you",
  received_at: "2025-05-12T08:00:00Z",
  project_name: null, project_number: null,
  confidence: 0.0,
  status: "filed", status_display: "Auto-filed",
  email_type: "app_email", email_type_display: "App",
  attachment_count: 0, rfi_number: null, folder_name: "Asana",
};

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockApis({
  emails  = [EMAIL_RFI],
  configs = [CONFIG_A],
  folders = [FOLDER_A],
} = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/api/email/inbound/")
      return Promise.resolve({
        data: { results: emails, count: emails.length, next: null, previous: null },
      });
    if (url === "/api/email/configs/")
      return Promise.resolve({ data: configs });
    if (url === "/api/email/folders/")
      return Promise.resolve({ data: folders });
    return Promise.resolve({ data: [] });
  });
}

function renderInbox() {
  return render(
    <MemoryRouter>
      <EmailInbox />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EmailInbox — page structure", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.patch.mockReset();
    api.delete.mockReset();
  });

  it("renders the page title", async () => {
    mockApis();
    renderInbox();
    expect(await screen.findByText("Email Inbox")).toBeInTheDocument();
  });

  it("renders all queue tabs", async () => {
    mockApis();
    renderInbox();
    await screen.findByText("Email Inbox");
    expect(screen.getByRole("button", { name: /pending review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto-created/i  })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approved/i      })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rejected/i      })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filed/i         })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /errors/i        })).toBeInTheDocument();
  });

  it("renders the 'Manage Inboxes' button", async () => {
    mockApis();
    renderInbox();
    await screen.findByText("Email Inbox");
    expect(screen.getByRole("button", { name: /manage inboxes/i })).toBeInTheDocument();
  });
});

describe("EmailInbox — email list", () => {
  beforeEach(() => { api.get.mockReset(); });

  it("shows email subjects in the table", async () => {
    mockApis({ emails: [EMAIL_RFI, EMAIL_PCN] });
    renderInbox();
    expect(await screen.findByText("RFI – P-001 – Roof drainage")).toBeInTheDocument();
    expect(screen.getByText("PCN-007 Change Notice")).toBeInTheDocument();
  });

  it("shows email type badge for each row", async () => {
    mockApis({ emails: [EMAIL_RFI, EMAIL_PCN, EMAIL_APP] });
    renderInbox();
    await screen.findByText("RFI – P-001 – Roof drainage");
    // There is a table header "RFI" and also the badge; getAllByText handles multiples
    expect(screen.getAllByText("RFI").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("PCN").length).toBeGreaterThanOrEqual(1);
    // "App" appears both as a filter chip (button) and the row badge (span)
    const appBadge = screen.getAllByText("App").find((el) => el.tagName === "SPAN");
    expect(appBadge).toBeTruthy();
  });

  it("shows folder name chip for filed emails", async () => {
    mockApis({ emails: [EMAIL_APP] });
    renderInbox();
    await screen.findByText("New task assigned to you");
    // sender_name is "Asana" and folder_name is "Asana" — both appear;
    // assert the purple folder chip <span> is present
    const folderChips = screen.getAllByText("Asana");
    const purpleChip = folderChips.find(el =>
      el.closest("span")?.className?.includes("purple")
    );
    expect(purpleChip).toBeDefined();
  });

  it("shows attachment count when > 0", async () => {
    mockApis({ emails: [EMAIL_PCN] });
    renderInbox();
    await screen.findByText("PCN-007 Change Notice");
    expect(screen.getByText("1")).toBeInTheDocument(); // attachment count
  });

  it("shows empty state when no emails exist", async () => {
    mockApis({ emails: [] });
    renderInbox();
    expect(await screen.findByText(/no pending review found/i)).toBeInTheDocument();
  });

  it("shows email count when results exist", async () => {
    mockApis({ emails: [EMAIL_RFI, EMAIL_PCN] });
    renderInbox();
    expect(await screen.findByText("2 emails")).toBeInTheDocument();
  });
});

describe("EmailInbox — review modal", () => {
  beforeEach(() => { api.get.mockReset(); });

  it("opens review modal when an email row is clicked", async () => {
    mockApis({ emails: [EMAIL_RFI] });
    renderInbox();
    await screen.findByText("RFI – P-001 – Roof drainage");
    await userEvent.click(screen.getByText("RFI – P-001 – Roof drainage").closest("tr"));
    expect(await screen.findByTestId("review-modal")).toBeInTheDocument();
  });

  it("closes the modal when onClose is called", async () => {
    mockApis({ emails: [EMAIL_RFI] });
    renderInbox();
    await screen.findByText("RFI – P-001 – Roof drainage");
    await userEvent.click(screen.getByText("RFI – P-001 – Roof drainage").closest("tr"));
    await screen.findByTestId("review-modal");
    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(screen.queryByTestId("review-modal")).toBeNull();
  });

  it("refetches after modal closes with a change", async () => {
    mockApis({ emails: [EMAIL_RFI] });
    renderInbox();
    await screen.findByText("RFI – P-001 – Roof drainage");

    const initialCallCount = api.get.mock.calls.filter(([u]) => u === "/api/email/inbound/").length;
    await userEvent.click(screen.getByText("RFI – P-001 – Roof drainage").closest("tr"));
    await screen.findByTestId("review-modal");
    await userEvent.click(screen.getByRole("button", { name: /close with change/i }));

    await waitFor(() => {
      const newCallCount = api.get.mock.calls.filter(([u]) => u === "/api/email/inbound/").length;
      expect(newCallCount).toBeGreaterThan(initialCallCount);
    });
  });
});

describe("EmailInbox — Manage Inboxes panel", () => {
  beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.patch.mockReset(); api.delete.mockReset(); });

  it("settings panel is hidden by default", async () => {
    mockApis();
    renderInbox();
    await screen.findByText("Email Inbox");
    expect(screen.queryByText("Watched Inboxes")).toBeNull();
  });

  it("shows the settings panel when 'Manage Inboxes' is clicked", async () => {
    mockApis();
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    expect(await screen.findByText("Watched Inboxes")).toBeInTheDocument();
  });

  it("lists existing configs in the panel", async () => {
    mockApis({ configs: [CONFIG_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    expect(await screen.findByText("RFI Inbox")).toBeInTheDocument();
    expect(screen.getByText("rfi@example.com")).toBeInTheDocument();
  });

  it("shows subject format hint on config card", async () => {
    mockApis({ configs: [CONFIG_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    expect(await screen.findByText(/RFI – {project_number}/)).toBeInTheDocument();
  });

  it("shows empty state when no configs exist", async () => {
    mockApis({ configs: [] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    expect(await screen.findByText(/No inboxes configured yet/i)).toBeInTheDocument();
  });

  it("shows 'Add Inbox' button in the panel", async () => {
    mockApis({ configs: [] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("Watched Inboxes");
    expect(screen.getByRole("button", { name: /add inbox/i })).toBeInTheDocument();
  });

  it("opens config modal when 'Add Inbox' is clicked", async () => {
    mockApis({ configs: [] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("Watched Inboxes");
    await userEvent.click(screen.getByRole("button", { name: /add inbox/i }));
    expect(await screen.findByText("Add Inbox to Watch")).toBeInTheDocument();
  });

  it("closes config modal when Cancel is clicked", async () => {
    mockApis({ configs: [] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("Watched Inboxes");
    await userEvent.click(screen.getByRole("button", { name: /add inbox/i }));
    await screen.findByText("Add Inbox to Watch");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText("Add Inbox to Watch")).toBeNull());
  });

  it("opens edit modal when pencil button on a config card is clicked", async () => {
    mockApis({ configs: [CONFIG_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("RFI Inbox");
    await userEvent.click(screen.getByTitle("Edit"));
    expect(await screen.findByText("Edit Inbox")).toBeInTheDocument();
  });

  it("shows delete confirmation dialog when trash button is clicked", async () => {
    mockApis({ configs: [CONFIG_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("RFI Inbox");
    await userEvent.click(screen.getByTitle("Remove"));
    expect(await screen.findByText("Confirm Delete")).toBeInTheDocument();
  });

  it("cancels delete when 'Cancel' is clicked in the confirmation dialog", async () => {
    mockApis({ configs: [CONFIG_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("RFI Inbox");
    await userEvent.click(screen.getByTitle("Remove"));
    await screen.findByText("Confirm Delete");
    // Click the Cancel button inside the confirmation dialog
    const dialog = screen.getByText("Confirm Delete").closest("div");
    await userEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText("Confirm Delete")).toBeNull();
  });

  it("calls DELETE API and removes config when deletion is confirmed", async () => {
    mockApis({ configs: [CONFIG_A] });
    api.delete.mockResolvedValue({});
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("RFI Inbox");
    await userEvent.click(screen.getByTitle("Remove"));
    await screen.findByText("Confirm Delete");
    const dialog = screen.getByText("Confirm Delete").closest("div");
    await userEvent.click(within(dialog).getByRole("button", { name: /delete/i }));
    expect(api.delete).toHaveBeenCalledWith(`/api/email/configs/${CONFIG_A.id}/`);
  });
});

describe("EmailInbox — Folder management panel", () => {
  beforeEach(() => { api.get.mockReset(); });

  it("shows the Email Folders section in the settings panel", async () => {
    mockApis({ folders: [FOLDER_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    expect(await screen.findByText("Email Folders")).toBeInTheDocument();
  });

  it("lists folder names in the settings panel", async () => {
    mockApis({ folders: [FOLDER_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    // Folder name appears in both the filter chip row and the settings panel
    const matches = await screen.findAllByText("Asana");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows folder keyword chips", async () => {
    mockApis({ folders: [FOLDER_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    expect(await screen.findByText("asana.com")).toBeInTheDocument();
  });

  it("shows folder email count", async () => {
    mockApis({ folders: [FOLDER_A] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findAllByText("Asana");
    expect(screen.getByText("2 emails")).toBeInTheDocument();
  });

  it("shows empty folders state when no folders exist", async () => {
    mockApis({ folders: [] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    expect(await screen.findByText(/No folders yet/i)).toBeInTheDocument();
  });

  it("opens folder modal when 'New Folder' is clicked", async () => {
    mockApis({ folders: [] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("Email Folders");
    await userEvent.click(screen.getByRole("button", { name: /new folder/i }));
    // The modal heading "New Folder" is inside an h2 element (vs the button text)
    expect(await screen.findByRole("heading", { name: /new folder/i })).toBeInTheDocument();
  });
});

describe("EmailInbox — tab switching", () => {
  beforeEach(() => { api.get.mockReset(); });

  it("switching tabs refetches with the new status", async () => {
    mockApis({ emails: [] });
    renderInbox();
    await screen.findByText("Email Inbox");

    await userEvent.click(screen.getByRole("button", { name: /auto-created/i }));

    await waitFor(() => {
      const calls = api.get.mock.calls.filter(([u]) => u === "/api/email/inbound/");
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]?.params?.status).toBe("auto_created");
    });
  });

  it("clicking a tab hides the settings panel", async () => {
    mockApis({ configs: [] });
    renderInbox();
    await screen.findByText("Email Inbox");
    await userEvent.click(screen.getByRole("button", { name: /manage inboxes/i }));
    await screen.findByText("Watched Inboxes");

    await userEvent.click(screen.getByRole("button", { name: /approved/i }));
    expect(screen.queryByText("Watched Inboxes")).toBeNull();
  });
});

describe("EmailInbox — search", () => {
  beforeEach(() => { api.get.mockReset(); });

  it("submitting the search form triggers a new fetch with the search term", async () => {
    mockApis({ emails: [EMAIL_RFI] });
    renderInbox();
    await screen.findByText("RFI – P-001 – Roof drainage");

    const input = screen.getByPlaceholderText(/Search by subject/i);
    await userEvent.type(input, "drain");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      const calls = api.get.mock.calls.filter(([u]) => u === "/api/email/inbound/");
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]?.params?.search).toBe("drain");
    });
  });

  it("shows Clear button after a search is submitted", async () => {
    mockApis({ emails: [EMAIL_RFI] });
    renderInbox();
    await screen.findByText("RFI – P-001 – Roof drainage");
    const input = screen.getByPlaceholderText(/Search by subject/i);
    await userEvent.type(input, "drain");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(await screen.findByRole("button", { name: /clear/i })).toBeInTheDocument();
  });
});
