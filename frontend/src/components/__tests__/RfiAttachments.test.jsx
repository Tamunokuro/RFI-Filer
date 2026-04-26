import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../api", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import api from "../../api";
import { toast } from "react-toastify";
import RfiAttachments from "../RfiAttachments";

const atts = [
  {
    id: 1,
    file_url: "http://test/media/a.pdf",
    original_filename: "spec.pdf",
    content_type: "application/pdf",
    size: 2048,
    uploaded_by: 42,
    uploaded_by_name: "Alice",
  },
  {
    id: 2,
    file_url: "http://test/media/a.png",
    original_filename: "pic.png",
    content_type: "image/png",
    size: 4096,
    uploaded_by: 99,
    uploaded_by_name: "Bob",
  },
  {
    id: 3,
    file_url: "http://test/media/a.mp4",
    original_filename: "clip.mp4",
    content_type: "video/mp4",
    size: 10240,
    uploaded_by: 99,
    uploaded_by_name: "Bob",
  },
  {
    id: 4,
    file_url: "http://test/media/data.xlsx",
    original_filename: "data.xlsx",
    content_type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 8192,
    uploaded_by: 99,
    uploaded_by_name: "Bob",
  },
];

describe("RfiAttachments", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.delete.mockReset();
  });

  it("renders distinct cards per content type", async () => {
    api.get.mockResolvedValue({ data: atts });
    render(<RfiAttachments rfiId={7} currentMemberId={42} isClosed={false} />);

    expect(await screen.findByTestId("attachment-1")).toHaveAttribute(
      "data-kind",
      "pdf"
    );
    expect(screen.getByTestId("attachment-2")).toHaveAttribute(
      "data-kind",
      "image"
    );
    expect(screen.getByTestId("attachment-3")).toHaveAttribute(
      "data-kind",
      "video"
    );
    expect(screen.getByTestId("attachment-4")).toHaveAttribute(
      "data-kind",
      "excel"
    );
  });

  it("shows empty state when no attachments", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<RfiAttachments rfiId={7} currentMemberId={42} isClosed={false} />);
    expect(
      await screen.findByText(/No attachments uploaded yet/i)
    ).toBeInTheDocument();
  });

  it("uploads a new file and prepends it to the list", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({
      data: {
        created: [
          {
            id: 10,
            file_url: "http://test/new.pdf",
            original_filename: "new.pdf",
            content_type: "application/pdf",
            size: 100,
            uploaded_by: 42,
            uploaded_by_name: "Alice",
          },
        ],
        errors: [],
      },
    });

    render(<RfiAttachments rfiId={7} currentMemberId={42} isClosed={false} />);
    await screen.findByText(/No attachments uploaded yet/i);

    const input = screen.getByTestId("attachment-file-input");
    const file = new File(["hi"], "new.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/rfis/7/attachments/",
        expect.any(FormData)
      )
    );
    expect(await screen.findByText("new.pdf")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows delete button only on own uploads when not closed", async () => {
    api.get.mockResolvedValue({ data: atts });
    render(<RfiAttachments rfiId={7} currentMemberId={42} isClosed={false} />);

    await screen.findByTestId("attachment-1");
    const ownCard = screen.getByTestId("attachment-1");
    const otherCard = screen.getByTestId("attachment-2");

    expect(ownCard.querySelector("button[title='Delete']")).not.toBeNull();
    expect(otherCard.querySelector("button[title='Delete']")).toBeNull();
  });

  it("hides upload UI when the RFI is closed", async () => {
    api.get.mockResolvedValue({ data: atts });
    render(<RfiAttachments rfiId={7} currentMemberId={42} isClosed={true} />);

    await screen.findByTestId("attachment-1");
    expect(screen.queryByTestId("attachment-file-input")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Files/i })).toBeNull();
  });

  it("surfaces server-side per-file errors via toast", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({
      data: {
        created: [],
        errors: [{ filename: "bad.exe", error: "type not allowed" }],
      },
    });

    render(<RfiAttachments rfiId={7} currentMemberId={42} isClosed={false} />);
    await screen.findByText(/No attachments uploaded yet/i);

    const input = screen.getByTestId("attachment-file-input");
    const file = new File(["x"], "bad.exe", { type: "application/octet-stream" });
    await userEvent.upload(input, file, { applyAccept: false });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("bad.exe")
      )
    );
  });
});
