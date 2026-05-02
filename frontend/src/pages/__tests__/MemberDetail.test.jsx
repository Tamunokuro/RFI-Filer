import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../api", () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

vi.mock("../../toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Stub heavy sub-components so tests stay unit-level
vi.mock("../../components/Header", () => ({ default: () => <div /> }));
vi.mock("../../components/Footer", () => ({ default: () => <div /> }));
vi.mock("../../components/MemberCard", () => ({
  default: ({ member }) => (
    <div data-testid="member-card">
      <span data-testid="card-name">{member.name}</span>
      <span data-testid="card-email">{member.email}</span>
    </div>
  ),
}));

// Auth context — override per test via `mockAuthConfig`
let mockAuthConfig = {
  isAuthenticated: true,
  memberId: "5",
  username: "jane",
  displayName: "Jane Smith",
  role: "Project Designer",
  login: vi.fn(),
};

vi.mock("../../context/Auth", () => ({
  useAuth: () => mockAuthConfig,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import api from "../../api";
import toast from "../../toast";
import MemberDetail from "../MemberDetail";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MEMBER_ID = "5";
const OTHER_MEMBER_ID = "9";

const baseMember = {
  id: 5,
  name: "Jane Smith",
  email: "jane@example.com",
  role: "Project Designer",
  company: "Acme Co",
  discipline: "Mechanical",
  phone: "431-000-0001",
  is_admin: false,
};

const emptyRfis = { count: 0, next: null, previous: null, results: [] };

const sampleRfis = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 10,
      slug: "p-001-rfi-001",
      rfi_name: "Duct clash",
      rfi_number: "RFI-001",
      project_number: "P-001",
      project_name: "Hospital",
      due_date: "2099-12-31",
      status: "open",
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Renders MemberDetail at /members/:id via MemoryRouter so useParams works.
 */
function renderPage(memberId = MEMBER_ID) {
  return render(
    <MemoryRouter initialEntries={[`/members/${memberId}`]}>
      <Routes>
        <Route path="/members/:id" element={<MemberDetail />} />
        <Route path="/rfi/:pk/:slug" element={<div data-testid="rfi-detail" />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemberDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default auth: viewing own profile
    mockAuthConfig = {
      isAuthenticated: true,
      memberId: MEMBER_ID,
      username: "jane",
      displayName: "Jane Smith",
      role: "Project Designer",
      login: vi.fn(),
    };

    // Default API responses
    api.get.mockImplementation((url) => {
      if (url.includes("/api/members/")) return Promise.resolve({ data: baseMember });
      if (url.includes("/api/rfis/")) return Promise.resolve({ data: emptyRfis });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders the member card once data has loaded", async () => {
    renderPage();
    expect(await screen.findByTestId("member-card")).toBeInTheDocument();
    expect(screen.getByTestId("card-name")).toHaveTextContent("Jane Smith");
    expect(screen.getByTestId("card-email")).toHaveTextContent("jane@example.com");
  });

  it("shows a loading state before data arrives", () => {
    // Never resolves during this test
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders assigned RFIs when the API returns them", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/api/members/")) return Promise.resolve({ data: baseMember });
      if (url.includes("/api/rfis/")) return Promise.resolve({ data: sampleRfis });
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });

    renderPage();
    expect(await screen.findByText("Duct clash")).toBeInTheDocument();
    expect(screen.getByText(/P-001/)).toBeInTheDocument();
  });

  it("shows empty state when there are no RFIs", async () => {
    renderPage();
    expect(
      await screen.findByText(/No.*RFIs assigned/i)
    ).toBeInTheDocument();
  });

  // ── Edit button visibility ─────────────────────────────────────────────────

  it("shows Edit Profile button on own profile", async () => {
    renderPage(MEMBER_ID); // memberId in auth === id param
    expect(
      await screen.findByRole("button", { name: /Edit Profile/i })
    ).toBeInTheDocument();
  });

  it("does NOT show Edit Profile button when viewing another member's profile", async () => {
    mockAuthConfig = { ...mockAuthConfig, memberId: OTHER_MEMBER_ID };
    renderPage(MEMBER_ID); // different id
    await screen.findByTestId("member-card"); // wait for load
    expect(
      screen.queryByRole("button", { name: /Edit Profile/i })
    ).toBeNull();
  });

  it("does NOT show Edit Profile button when not authenticated", async () => {
    mockAuthConfig = { ...mockAuthConfig, isAuthenticated: false, memberId: "" };
    renderPage(MEMBER_ID);
    await screen.findByTestId("member-card");
    expect(
      screen.queryByRole("button", { name: /Edit Profile/i })
    ).toBeNull();
  });

  // ── Opening the edit form ─────────────────────────────────────────────────

  it("opens the inline edit form with pre-filled values when Edit is clicked", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));

    const nameInput = screen.getByPlaceholderText(/Jane Smith/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);

    expect(nameInput).toHaveValue("Jane Smith");
    expect(emailInput).toHaveValue("jane@example.com");
    // Edit button replaced by the form's Cancel button
    expect(screen.queryByRole("button", { name: /^Edit Profile$/i })).toBeNull();
  });

  it("closes the form without saving when Cancel is clicked", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));
    // Target the visible-text Cancel button (not the ✕ icon whose title="Cancel")
    await userEvent.click(screen.getByText("Cancel", { selector: "button" }));

    expect(api.patch).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: /Edit Profile/i })
    ).toBeInTheDocument();
  });

  it("closes the form when the ✕ icon button is clicked", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));
    // The XMarkIcon button has title="Cancel"
    await userEvent.click(screen.getByTitle("Cancel"));

    expect(api.patch).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: /Edit Profile/i })
    ).toBeInTheDocument();
  });

  // ── Successful save ────────────────────────────────────────────────────────

  it("saves updated name, refreshes the card, shows toast, and closes the form", async () => {
    const updatedMember = { ...baseMember, name: "Jane Updated" };
    api.patch.mockResolvedValue({
      data: {
        username: "jane",
        email: "jane@example.com",
        member: updatedMember,
      },
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));

    const nameInput = screen.getByPlaceholderText(/Jane Smith/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Jane Updated");

    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/me/", {
        name: "Jane Updated",
        email: "jane@example.com",
      })
    );

    expect(await screen.findByTestId("card-name")).toHaveTextContent("Jane Updated");
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/profile updated/i)
    );
    // Form should be gone, Edit button should return
    expect(
      await screen.findByRole("button", { name: /Edit Profile/i })
    ).toBeInTheDocument();
  });

  it("saves updated email and syncs the card display", async () => {
    const updatedMember = { ...baseMember, email: "new@example.com" };
    api.patch.mockResolvedValue({
      data: { username: "jane", email: "new@example.com", member: updatedMember },
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "new@example.com");

    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(await screen.findByTestId("card-email")).toHaveTextContent(
      "new@example.com"
    );
  });

  it("calls login() to sync the auth context display name after save", async () => {
    const updatedMember = { ...baseMember, name: "Context Sync" };
    api.patch.mockResolvedValue({
      data: { username: "jane", email: "jane@example.com", member: updatedMember },
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));

    const nameInput = screen.getByPlaceholderText(/Jane Smith/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Context Sync");

    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() =>
      expect(mockAuthConfig.login).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "Context Sync" })
      )
    );
  });

  // ── Field-level validation errors ─────────────────────────────────────────

  it("displays an inline error when the server rejects a duplicate email", async () => {
    api.patch.mockRejectedValue({
      response: {
        status: 400,
        data: { email: ["A member with this email already exists."] },
      },
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "taken@example.com");

    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(
      await screen.findByText(/A member with this email already exists/i)
    ).toBeInTheDocument();
    // Form must stay open for the user to correct the error
    expect(screen.getByRole("button", { name: /Save Changes/i })).toBeInTheDocument();
  });

  it("displays an inline error when the server rejects a blank name", async () => {
    api.patch.mockRejectedValue({
      response: {
        status: 400,
        data: { name: ["Name cannot be blank."] },
      },
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));

    const nameInput = screen.getByPlaceholderText(/Jane Smith/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "   ");

    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(
      await screen.findByText(/Name cannot be blank/i)
    ).toBeInTheDocument();
  });

  it("shows a generic error message on unexpected server failure", async () => {
    api.patch.mockRejectedValue({ response: null }); // network error

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(
      await screen.findByText(/Failed to save/i)
    ).toBeInTheDocument();
  });

  // ── Loading / disabled state during save ──────────────────────────────────

  it("shows 'Saving…' and disables the button while the request is in-flight", async () => {
    let resolvePatch;
    api.patch.mockReturnValue(new Promise((res) => { resolvePatch = res; }));

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Profile/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    const savingBtn = await screen.findByRole("button", { name: /Saving…/i });
    expect(savingBtn).toBeDisabled();

    // Resolve so the component can clean up
    resolvePatch({
      data: { username: "jane", email: "jane@example.com", member: baseMember },
    });
  });

  // ── RFI filter tabs ───────────────────────────────────────────────────────

  it("filters to open RFIs when the Open tab is clicked", async () => {
    const openRfi = { ...sampleRfis.results[0], id: 11, rfi_name: "Open RFI", status: "open" };
    const closedRfi = { ...sampleRfis.results[0], id: 12, rfi_name: "Closed RFI", status: "closed" };
    api.get.mockImplementation((url) => {
      if (url.includes("/api/members/")) return Promise.resolve({ data: baseMember });
      return Promise.resolve({
        data: { count: 2, next: null, previous: null, results: [openRfi, closedRfi] },
      });
    });

    renderPage();
    await screen.findByText("Open RFI");

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));

    expect(screen.getByText("Open RFI")).toBeInTheDocument();
    expect(screen.queryByText("Closed RFI")).toBeNull();
  });

  it("navigates to the RFI detail when a row is clicked", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/api/members/")) return Promise.resolve({ data: baseMember });
      return Promise.resolve({ data: sampleRfis });
    });

    renderPage();
    await userEvent.click(await screen.findByText("Duct clash"));
    expect(await screen.findByTestId("rfi-detail")).toBeInTheDocument();
  });
});
