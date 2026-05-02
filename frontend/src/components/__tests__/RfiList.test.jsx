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
  designers_detail: [],
  contract_administrators_detail: [],
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
  designers_detail: [],
  contract_administrators_detail: [],
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

  it("requests all active statuses so closed RFIs are excluded server-side", async () => {
    mockApis();
    renderList();
    await screen.findByTestId("rfi-status-1");

    const rfiCall = api.get.mock.calls.find(([url]) => url === "/api/rfis/");
    expect(rfiCall).toBeDefined();
    // Should include all non-closed statuses as a comma-separated string
    expect(rfiCall[1].params.status).toMatch(/open/);
    expect(rfiCall[1].params.status).toMatch(/submitted/);
    expect(rfiCall[1].params.status).toMatch(/under_review/);
    expect(rfiCall[1].params.status).toMatch(/responded/);
    expect(rfiCall[1].params.status).not.toMatch(/closed/);
  });

  // ── Status badges ─────────────────────────────────────────────────────────

  it("shows Open for an open RFI with a future due date", async () => {
    mockApis([rfiActive]);
    renderList();
    expect(await screen.findByTestId("rfi-status-1")).toHaveTextContent("Open");
  });

  it("shows Overdue for an open RFI with a past due date", async () => {
    mockApis([rfiOverdue]);
    renderList();
    expect(await screen.findByTestId("rfi-status-3")).toHaveTextContent("Overdue");
  });

  it("renders a Closed badge for a closed RFI returned by the API", async () => {
    // The component trusts the server to filter out closed RFIs via the
    // status query param; if one slips through it renders with a "Closed" badge.
    const closedRfi = { ...rfiActive, id: 99, status: "closed", rfi_name: "Unexpected closed" };
    mockApis([rfiActive, closedRfi]);
    renderList();
    await screen.findByTestId("rfi-status-1");
    expect(screen.getByTestId("rfi-status-99")).toHaveTextContent("Closed");
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
