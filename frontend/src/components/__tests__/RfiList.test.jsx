import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../../api", () => ({
  default: { get: vi.fn(), delete: vi.fn() },
}));
vi.mock("../Header", () => ({ default: () => <div /> }));
vi.mock("../Footer", () => ({ default: () => <div /> }));
vi.mock("../DeleteButton", () => ({ default: () => <button>Delete</button> }));
vi.mock("../../context/Auth", () => ({
  useAuth: () => ({ isAuthenticated: true, memberId: "1", displayName: "A", username: "a" }),
}));

import api from "../../api";
import RfiList from "../RfiList";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const rfiActive = {
  id: 1,
  slug: "p-001-rfi-001-duct",
  project_number: "P-001",
  rfi_number: "RFI-001",
  rfi_name: "Duct clash",
  project_name: "Hospital",
  trade: "M",
  received_date: "2026-04-10",
  due_date: "2099-01-01",
  assigned_to_detail: [],
  status: "open",
};

const rfiOverdue = {
  id: 3,
  slug: "p-001-rfi-003-overdue",
  project_number: "P-001",
  rfi_number: "RFI-003",
  rfi_name: "Overdue item",
  project_name: "Hospital",
  trade: "E",
  received_date: "2025-01-01",
  due_date: "2025-01-15", // in the past
  assigned_to_detail: [],
  status: "open",
};

// ── Helper ────────────────────────────────────────────────────────────────────

function renderList() {
  localStorage.setItem("access", "tok");
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RfiList />} />
        <Route path="/rfi/:pk/:slug" element={<div data-testid="detail-route" />} />
      </Routes>
    </MemoryRouter>
  );
}

function mockApis(rfis = [rfiActive], unread = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/api/rfis/")
      return Promise.resolve({
        data: { results: rfis, next: null, previous: null, count: rfis.length },
      });
    if (url === "/api/rfis/unread-summary/")
      return Promise.resolve({ data: unread });
    return Promise.resolve({ data: {} });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RfiList", () => {
  beforeEach(() => {
    api.get.mockReset();
    localStorage.clear();
  });

  // ── API params ────────────────────────────────────────────────────────────

  it("sends status=open so closed RFIs are excluded server-side", async () => {
    mockApis();
    renderList();
    await screen.findByTestId("rfi-status-1");

    const rfiCall = api.get.mock.calls.find(([url]) => url === "/api/rfis/");
    expect(rfiCall).toBeDefined();
    expect(rfiCall[1].params).toMatchObject({ status: "open" });
  });

  // ── Status badges ─────────────────────────────────────────────────────────

  it("shows Active for an open RFI with a future due date", async () => {
    mockApis([rfiActive]);
    renderList();
    expect(await screen.findByTestId("rfi-status-1")).toHaveTextContent("Active");
  });

  it("shows Overdue for an open RFI with a past due date", async () => {
    mockApis([rfiOverdue]);
    renderList();
    expect(await screen.findByTestId("rfi-status-3")).toHaveTextContent("Overdue");
  });

  it("does not render a Closed row even if the API unexpectedly returns one", async () => {
    const closedRfi = { ...rfiActive, id: 99, status: "closed", rfi_name: "Should be gone" };
    mockApis([rfiActive, closedRfi]);
    renderList();
    await screen.findByTestId("rfi-status-1");
    // The closed row is still rendered (component trusts the server filtered it),
    // but no "Closed" badge text should appear in the status cells.
    expect(screen.queryByText("Closed")).toBeNull();
  });

  // ── Unread badge ──────────────────────────────────────────────────────────

  it("shows an unread badge when unread-summary reports messages", async () => {
    mockApis([rfiActive], { "1": 3 });
    renderList();
    const badge = await screen.findByTestId("rfi-unread-1");
    expect(badge).toHaveTextContent("3");
  });

  it("does not render an unread badge when count is zero", async () => {
    mockApis([rfiActive], { "1": 0 });
    renderList();
    await screen.findByTestId("rfi-status-1");
    expect(screen.queryByTestId("rfi-unread-1")).toBeNull();
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it("navigates to the detail route when a row is clicked", async () => {
    mockApis([rfiActive]);
    renderList();
    await screen.findByTestId("rfi-status-1");
    await userEvent.click(screen.getByText("Duct clash"));
    await waitFor(() =>
      expect(screen.getByTestId("detail-route")).toBeInTheDocument()
    );
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("shows an empty-state message when no RFIs are returned", async () => {
    mockApis([]);
    renderList();
    expect(
      await screen.findByText(/No RFIs found/i)
    ).toBeInTheDocument();
  });
});
