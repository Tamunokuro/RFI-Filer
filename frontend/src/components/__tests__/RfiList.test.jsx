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

const rfiA = {
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

const rfiClosed = {
  id: 2,
  slug: "p-001-rfi-002-panel",
  project_number: "P-001",
  rfi_number: "RFI-002",
  rfi_name: "Panel spec",
  project_name: "Hospital",
  trade: "E",
  received_date: "2026-04-11",
  due_date: "2099-01-02",
  assigned_to_detail: [],
  status: "closed",
};

function renderList() {
  localStorage.setItem("access", "tok");
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RfiList />} />
        <Route
          path="/rfi/:pk/:slug"
          element={<div data-testid="detail-route" />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("RfiList", () => {
  beforeEach(() => {
    api.get.mockReset();
    localStorage.clear();
  });

  it("renders Closed status for closed RFIs and Active otherwise", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/api/rfis/") {
        return Promise.resolve({
          data: { results: [rfiA, rfiClosed], next: null, previous: null, count: 2 },
        });
      }
      if (url === "/api/rfis/unread-summary/") {
        return Promise.resolve({ data: {} });
      }
      return Promise.resolve({ data: {} });
    });

    renderList();
    expect(await screen.findByTestId("rfi-status-1")).toHaveTextContent("Active");
    expect(screen.getByTestId("rfi-status-2")).toHaveTextContent("Closed");
  });

  it("shows an unread badge when unread-summary reports unread messages", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/api/rfis/") {
        return Promise.resolve({
          data: { results: [rfiA], next: null, previous: null, count: 1 },
        });
      }
      if (url === "/api/rfis/unread-summary/") {
        return Promise.resolve({ data: { "1": 3 } });
      }
      return Promise.resolve({ data: {} });
    });

    renderList();
    const badge = await screen.findByTestId("rfi-unread-1");
    expect(badge).toHaveTextContent("3");
  });

  it("navigates to the detail route when a row is clicked", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/api/rfis/") {
        return Promise.resolve({
          data: { results: [rfiA], next: null, previous: null, count: 1 },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderList();
    await screen.findByTestId("rfi-status-1");
    await userEvent.click(screen.getByText("Duct clash"));
    await waitFor(() => {
      expect(screen.getByTestId("detail-route")).toBeInTheDocument();
    });
  });
});
