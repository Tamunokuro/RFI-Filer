import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../api", () => ({
  default: { post: vi.fn() },
}));
vi.mock("../../toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockUseAuth = vi.fn();
vi.mock("../../context/Auth", async () => {
  const actual = await vi.importActual("../../context/Auth");
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

import api from "../../api";
import toast from "../../toast";
import OfficialResponsePanel from "../OfficialResponsePanel";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const openRfi = {
  id: 11,
  status: "open",
  official_response: "",
  responded_by_name: "",
  responded_at: null,
  official_response_attachments: [],
};

const closedRfi = {
  id: 11,
  status: "closed",
  official_response: "Proceed with Option A.",
  responded_by_name: "Alex PM",
  responded_at: "2026-04-23T12:00:00Z",
  official_response_attachments: [],
};

const closedRfiWithAttachments = {
  ...closedRfi,
  official_response_attachments: [
    {
      id: 1,
      original_filename: "decision.pdf",
      file_url: "http://test/media/decision.pdf",
      content_type: "application/pdf",
      size: 2048,
      is_official_response: true,
    },
    {
      id: 2,
      original_filename: "photo.png",
      file_url: "http://test/media/photo.png",
      content_type: "image/png",
      size: 4096,
      is_official_response: true,
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Type response text and click through the two-step confirm flow. */
async function submitResponse(text = "Approved.") {
  await userEvent.type(
    screen.getByPlaceholderText(/Write the official response/i),
    text
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Submit & Close RFI/i })
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Confirm & Close RFI/i })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OfficialResponsePanel", () => {
  beforeEach(() => {
    api.post.mockReset();
    mockUseAuth.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  // ── Closed state display ──────────────────────────────────────────────────

  it("renders the submitted response text when the RFI is already closed", () => {
    mockUseAuth.mockReturnValue({ role: "Contractor" });
    render(<OfficialResponsePanel rfi={closedRfi} />);
    expect(screen.getByTestId("official-response-closed")).toBeInTheDocument();
    expect(screen.getByText("Proceed with Option A.")).toBeInTheDocument();
    expect(screen.getByText(/Alex PM/)).toBeInTheDocument();
  });

  it("shows attachment rows when closed RFI has official-response attachments", () => {
    mockUseAuth.mockReturnValue({ role: "Contractor" });
    render(<OfficialResponsePanel rfi={closedRfiWithAttachments} />);

    expect(screen.getByText("decision.pdf")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    // Each row has an Open and a Download link
    const panel = screen.getByTestId("official-response-closed");
    const openLinks = within(panel).getAllByTitle("Open");
    expect(openLinks).toHaveLength(2);
  });

  it("does not render an attachment section when closed RFI has no attachments", () => {
    mockUseAuth.mockReturnValue({ role: "Contractor" });
    render(<OfficialResponsePanel rfi={closedRfi} />);
    expect(screen.queryByText(/Attachments/i)).toBeNull();
  });

  // ── Visibility by role ────────────────────────────────────────────────────

  it("is hidden from roles that cannot submit an official response", () => {
    mockUseAuth.mockReturnValue({ role: "Contractor" });
    const { container } = render(<OfficialResponsePanel rfi={openRfi} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the submit panel for allowed roles", () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    render(<OfficialResponsePanel rfi={openRfi} />);
    expect(screen.getByTestId("official-response-panel")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Write the official response/i)).toBeInTheDocument();
  });

  // ── File picker UI ────────────────────────────────────────────────────────

  it("renders the Attach files button and hidden file input", () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    render(<OfficialResponsePanel rfi={openRfi} />);
    expect(screen.getByRole("button", { name: /Attach files/i })).toBeInTheDocument();
    expect(screen.getByTestId("official-response-file-input")).toBeInTheDocument();
  });

  it("shows staged file names after files are selected", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    render(<OfficialResponsePanel rfi={openRfi} />);

    const input = screen.getByTestId("official-response-file-input");
    const file = new File(["content"], "spec.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);

    expect(await screen.findByText("spec.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("staged-files")).toBeInTheDocument();
  });

  it("removes a staged file when its remove button is clicked", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    render(<OfficialResponsePanel rfi={openRfi} />);

    const input = screen.getByTestId("official-response-file-input");
    const file = new File(["x"], "remove-me.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);

    expect(await screen.findByText("remove-me.pdf")).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Remove"));
    expect(screen.queryByText("remove-me.pdf")).toBeNull();
  });

  it("does not add a duplicate file when the same file is selected twice", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    render(<OfficialResponsePanel rfi={openRfi} />);

    const input = screen.getByTestId("official-response-file-input");
    const file = new File(["x"], "unique.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);
    await userEvent.upload(input, file);

    const items = screen.getAllByText("unique.pdf");
    expect(items).toHaveLength(1);
  });

  // ── Submission — text only ─────────────────────────────────────────────────

  it("submits FormData with body only when no files are staged", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    api.post.mockResolvedValueOnce({ data: closedRfi });
    const onClosed = vi.fn();

    render(<OfficialResponsePanel rfi={openRfi} onClosed={onClosed} />);
    await submitResponse("Approved.");

    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());

    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe("/api/rfis/11/official-response/");
    expect(payload).toBeInstanceOf(FormData);
    expect(payload.get("body")).toBe("Approved.");
    expect(toast.success).toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledWith(closedRfi);
  });

  it("trims whitespace from the body before sending", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    api.post.mockResolvedValueOnce({ data: closedRfi });

    render(<OfficialResponsePanel rfi={openRfi} />);
    await submitResponse("  Trimmed response.  ");

    const [, payload] = api.post.mock.calls[0];
    expect(payload.get("body")).toBe("Trimmed response.");
  });

  // ── Submission — with files ────────────────────────────────────────────────

  it("appends staged files to FormData on submit", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    api.post.mockResolvedValueOnce({ data: closedRfi });

    render(<OfficialResponsePanel rfi={openRfi} />);

    const input = screen.getByTestId("official-response-file-input");
    const f1 = new File(["a"], "a.pdf", { type: "application/pdf" });
    const f2 = new File(["b"], "b.png", { type: "image/png" });
    await userEvent.upload(input, [f1, f2]);

    await submitResponse("With files.");

    const [, payload] = api.post.mock.calls[0];
    expect(payload).toBeInstanceOf(FormData);
    expect(payload.get("body")).toBe("With files.");
    const sentFiles = payload.getAll("files");
    expect(sentFiles).toHaveLength(2);
    expect(sentFiles[0].name).toBe("a.pdf");
    expect(sentFiles[1].name).toBe("b.png");
  });

  // ── Confirm step ──────────────────────────────────────────────────────────

  it("does not advance to confirm step when body is empty", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    render(<OfficialResponsePanel rfi={openRfi} />);
    // Button is disabled when body is empty
    expect(screen.getByRole("button", { name: /Submit & Close RFI/i })).toBeDisabled();
  });

  it("can cancel from the confirm step without submitting", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    render(<OfficialResponsePanel rfi={openRfi} />);

    await userEvent.type(
      screen.getByPlaceholderText(/Write the official response/i),
      "Will cancel."
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Submit & Close RFI/i })
    );
    // Cancel from confirm step
    await userEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(api.post).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Submit & Close RFI/i })
    ).toBeInTheDocument();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("surfaces a server detail error via toast", async () => {
    mockUseAuth.mockReturnValue({ role: "Contract Administrator" });
    api.post.mockRejectedValueOnce({
      response: { data: { detail: "already closed" } },
    });

    render(<OfficialResponsePanel rfi={openRfi} />);
    await submitResponse("Done.");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("already closed")
    );
  });

  it("surfaces per-file rejection errors via individual toasts", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    api.post.mockRejectedValueOnce({
      response: {
        data: {
          detail: "One or more files were rejected.",
          errors: [
            { filename: "hack.exe", error: "File type not permitted." },
          ],
        },
      },
    });

    render(<OfficialResponsePanel rfi={openRfi} />);

    const input = screen.getByTestId("official-response-file-input");
    await userEvent.upload(
      input,
      new File(["x"], "hack.exe", { type: "application/octet-stream" }),
      { applyAccept: false }
    );
    await submitResponse("Bad file.");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("hack.exe")
      )
    );
  });
});
