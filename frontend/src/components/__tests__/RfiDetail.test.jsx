import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ── Module mocks (must be declared before importing the module under test) ────

vi.mock("../../api", () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));
vi.mock("../../toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("../../context/Auth", () => ({
  useAuth: () => ({ memberId: "1", isAuthenticated: true }),
}));

// Stub heavy child components so this suite stays focused on RfiDetail itself.
vi.mock("../Header",               () => ({ default: () => <div data-testid="header" /> }));
vi.mock("../Footer",               () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("../RfiDiscussion",        () => ({ default: () => <div data-testid="discussion" /> }));
vi.mock("../OfficialResponsePanel",() => ({ default: () => <div data-testid="official-response" /> }));
vi.mock("../RfiAttachments",       () => ({ default: () => <div data-testid="attachments" /> }));

import api  from "../../api";
import toast from "../../toast";
import RfiDetail from "../RfiDetail";

// ── Shared fixture ────────────────────────────────────────────────────────────

const RFI = {
  id: 1,
  slug: "p-001-rfi-001-roof-drainage",
  project: 1,
  project_number: "P-001",
  project_name: "Hospital Wing A",
  project_manager_name: "Jane Smith",
  rfi_number: "RFI-001",
  rfi_name: "Roof drainage clarification",
  trade: "M",
  status: "open",
  received_date: "2026-04-01",
  due_date: "2026-04-30",
  question: "What pipe size is required?",
  proposed_solution: "Use 150 mm uPVC.",
  official_response: "",
  responded_by: null,
  responded_at: null,
  closed_at: null,
  designers_detail: [{ id: 2, name: "Bob Designer" }],
  contract_administrators_detail: [{ id: 3, name: "Alice CA" }],
};

// Helper: render RfiDetail with the correct route params.
function renderDetail(rfiId = "1") {
  return render(
    <MemoryRouter initialEntries={[`/rfi/${rfiId}/some-slug`]}>
      <Routes>
        <Route path="/rfi/:pk/:slug" element={<RfiDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();

  // Default: RFI fetch succeeds.
  api.get.mockResolvedValue({ data: RFI });

  // jsdom stubs for the blob-download flow.
  window.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  window.URL.revokeObjectURL = vi.fn();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("RfiDetail — rendering", () => {
  it("shows a loading state before data arrives", () => {
    // Never resolve so the component stays in loading state.
    api.get.mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders the RFI name after data loads", async () => {
    renderDetail();
    expect(await screen.findByText("Roof drainage clarification")).toBeInTheDocument();
  });

  it("renders the project number and name", async () => {
    renderDetail();
    await screen.findByText("Roof drainage clarification");
    expect(screen.getByText(/P-001/)).toBeInTheDocument();
    expect(screen.getByText(/Hospital Wing A/)).toBeInTheDocument();
  });

  it("shows the Open status badge for an open RFI", async () => {
    renderDetail();
    expect(await screen.findByTestId("rfi-status-badge")).toHaveTextContent("Open");
  });

  it("shows the Closed status badge for a closed RFI", async () => {
    api.get.mockResolvedValue({ data: { ...RFI, status: "closed" } });
    renderDetail();
    expect(await screen.findByTestId("rfi-status-badge")).toHaveTextContent("Closed");
  });

  it("shows an error message when the API call fails", async () => {
    api.get.mockRejectedValue(new Error("Network error"));
    renderDetail();
    expect(await screen.findByText(/failed to load rfi/i)).toBeInTheDocument();
  });

  it("renders child panels after data loads", async () => {
    renderDetail();
    await screen.findByText("Roof drainage clarification");
    expect(screen.getByTestId("discussion")).toBeInTheDocument();
    expect(screen.getByTestId("attachments")).toBeInTheDocument();
    expect(screen.getByTestId("official-response")).toBeInTheDocument();
  });
});

// ── Edit button ───────────────────────────────────────────────────────────────

describe("RfiDetail — Edit button", () => {
  it("shows the Edit button for an open RFI", async () => {
    renderDetail();
    await screen.findByText("Roof drainage clarification");
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("hides the Edit button for a closed RFI", async () => {
    api.get.mockResolvedValue({ data: { ...RFI, status: "closed" } });
    renderDetail();
    await screen.findByText("Roof drainage clarification");
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
  });
});

// ── PDF export ────────────────────────────────────────────────────────────────

describe("RfiDetail — PDF export", () => {
  it("renders the Export PDF button", async () => {
    renderDetail();
    expect(await screen.findByRole("button", { name: /export pdf/i })).toBeInTheDocument();
  });

  it("shows the PDF button for closed RFIs too", async () => {
    api.get.mockResolvedValue({ data: { ...RFI, status: "closed" } });
    renderDetail();
    expect(await screen.findByRole("button", { name: /export pdf/i })).toBeInTheDocument();
  });

  it("calls the PDF endpoint with the correct RFI id and responseType blob", async () => {
    // Second get call is for the PDF blob.
    api.get
      .mockResolvedValueOnce({ data: RFI })          // initial RFI fetch
      .mockResolvedValueOnce({ data: new Blob() });   // PDF blob

    renderDetail();
    await screen.findByText("Roof drainage clarification");

    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/api/rfis/1/pdf/",
        { responseType: "blob" }
      );
    });
  });

  it("shows 'Generating…' while the PDF request is in flight", async () => {
    api.get
      .mockResolvedValueOnce({ data: RFI })
      .mockReturnValueOnce(new Promise(() => {})); // hang the PDF request

    renderDetail();
    await screen.findByText("Roof drainage clarification");
    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    expect(await screen.findByText(/generating/i)).toBeInTheDocument();
  });

  it("button is disabled while generating", async () => {
    api.get
      .mockResolvedValueOnce({ data: RFI })
      .mockReturnValueOnce(new Promise(() => {}));

    renderDetail();
    await screen.findByText("Roof drainage clarification");
    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    const btn = await screen.findByRole("button", { name: /generating/i });
    expect(btn).toBeDisabled();
  });

  it("shows a toast error when the PDF request fails", async () => {
    api.get
      .mockResolvedValueOnce({ data: RFI })
      .mockRejectedValueOnce(new Error("Server error"));

    renderDetail();
    await screen.findByText("Roof drainage clarification");
    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to generate PDF. Please try again."
      );
    });
  });

  it("re-enables the button after a failed PDF request", async () => {
    api.get
      .mockResolvedValueOnce({ data: RFI })
      .mockRejectedValueOnce(new Error("fail"));

    renderDetail();
    await screen.findByText("Roof drainage clarification");
    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    // Button should return to its normal label.
    expect(await screen.findByRole("button", { name: /export pdf/i })).not.toBeDisabled();
  });

  it("creates an object URL on success (download flow)", async () => {
    api.get
      .mockResolvedValueOnce({ data: RFI })
      .mockResolvedValueOnce({ data: new Blob(["fake"], { type: "application/pdf" }) });

    renderDetail();
    await screen.findByText("Roof drainage clarification");
    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    // createObjectURL being called proves the blob was prepared for download.
    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
  });

  it("revokes the object URL after the download is triggered", async () => {
    api.get
      .mockResolvedValueOnce({ data: RFI })
      .mockResolvedValueOnce({ data: new Blob(["fake"], { type: "application/pdf" }) });

    renderDetail();
    await screen.findByText("Roof drainage clarification");
    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    await waitFor(() =>
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url")
    );
  });
});
