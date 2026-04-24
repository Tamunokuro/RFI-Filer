import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import api from "../../api";
import { toast } from "react-toastify";
import RfiDiscussion from "../RfiDiscussion";

const sampleComments = [
  {
    id: 1,
    body: "First comment",
    is_official_response: false,
    created_at: "2026-04-23T10:00:00Z",
    author_name: "Designer",
    author_role: "Project Designer",
  },
  {
    id: 2,
    body: "Please proceed with Option A.",
    is_official_response: true,
    created_at: "2026-04-23T11:00:00Z",
    author_name: "PM",
    author_role: "Project Manager",
  },
];

describe("RfiDiscussion", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.post.mockResolvedValue({ data: {} });
  });

  it("loads and renders comments, and flags the official response", async () => {
    api.get.mockResolvedValueOnce({ data: sampleComments });
    render(<RfiDiscussion rfiId={7} isClosed={false} />);

    expect(await screen.findByText("First comment")).toBeInTheDocument();
    expect(screen.getByText("Please proceed with Option A.")).toBeInTheDocument();
    expect(screen.getByText("Official Response")).toBeInTheDocument();
  });

  it("posts a new message on Send", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url) => {
      if (url.endsWith("/mark-read/")) {
        return Promise.resolve({ data: { last_read_at: "now" } });
      }
      return Promise.resolve({
        data: {
          id: 99,
          body: "Hi there",
          is_official_response: false,
          created_at: new Date().toISOString(),
          author_name: "Me",
          author_role: "Contractor",
        },
      });
    });

    render(<RfiDiscussion rfiId={7} isClosed={false} />);
    await screen.findByText(/No messages yet/i);

    const textarea = screen.getByPlaceholderText("Write a message…");
    await userEvent.type(textarea, "Hi there");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/rfis/7/comments/", {
        body: "Hi there",
      });
    });
    expect(await screen.findByText("Hi there")).toBeInTheDocument();
  });

  it("disables the composer when the RFI is closed", async () => {
    api.get.mockResolvedValue({ data: sampleComments });
    render(<RfiDiscussion rfiId={7} isClosed={true} />);

    await screen.findByText("First comment");
    expect(
      screen.getByText(/This RFI is closed. New messages cannot be added./i)
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Write a message…")).toBeNull();
  });

  it("shows a friendly error when sending fails", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url) => {
      if (url.endsWith("/mark-read/")) {
        return Promise.resolve({ data: {} });
      }
      return Promise.reject({ response: { data: { detail: "boom" } } });
    });

    render(<RfiDiscussion rfiId={7} isClosed={false} />);
    await screen.findByText(/No messages yet/i);

    await userEvent.type(screen.getByPlaceholderText("Write a message…"), "x");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
  });

  it("calls mark-read on mount", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<RfiDiscussion rfiId={42} isClosed={false} />);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/rfis/42/mark-read/");
    });
  });
});
