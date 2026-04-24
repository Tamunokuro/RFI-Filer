import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../api", () => ({
  default: { post: vi.fn() },
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
import { toast } from "react-toastify";
import OfficialResponsePanel from "../OfficialResponsePanel";

const openRfi = {
  id: 11,
  status: "open",
  official_response: "",
  responded_by_name: "",
  responded_at: null,
};

const closedRfi = {
  id: 11,
  status: "closed",
  official_response: "Proceed with Option A.",
  responded_by_name: "Alex PM",
  responded_at: "2026-04-23T12:00:00Z",
};

describe("OfficialResponsePanel", () => {
  beforeEach(() => {
    api.post.mockReset();
    mockUseAuth.mockReset();
  });

  it("renders the submitted response when the RFI is already closed", () => {
    mockUseAuth.mockReturnValue({ role: "Contractor" });
    render(<OfficialResponsePanel rfi={closedRfi} />);
    expect(screen.getByTestId("official-response-closed")).toBeInTheDocument();
    expect(screen.getByText("Proceed with Option A.")).toBeInTheDocument();
    expect(screen.getByText(/Alex PM/)).toBeInTheDocument();
  });

  it("is hidden from roles that cannot submit an official response", () => {
    mockUseAuth.mockReturnValue({ role: "Contractor" });
    const { container } = render(<OfficialResponsePanel rfi={openRfi} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("allows an allowed role to submit, showing a confirm step", async () => {
    mockUseAuth.mockReturnValue({ role: "Project Manager" });
    api.post.mockResolvedValueOnce({
      data: { ...closedRfi },
    });
    const onClosed = vi.fn();

    render(<OfficialResponsePanel rfi={openRfi} onClosed={onClosed} />);

    await userEvent.type(
      screen.getByPlaceholderText(/Write the official response/i),
      "Approved."
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Submit & Close RFI/i })
    );
    // confirm step
    await userEvent.click(
      screen.getByRole("button", { name: /Confirm & Close RFI/i })
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/rfis/11/official-response/",
        { body: "Approved." }
      );
    });
    expect(toast.success).toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledWith(closedRfi);
  });

  it("surfaces an error from the server", async () => {
    mockUseAuth.mockReturnValue({ role: "Contract Administrator" });
    api.post.mockRejectedValueOnce({
      response: { data: { detail: "already closed" } },
    });

    render(<OfficialResponsePanel rfi={openRfi} />);
    await userEvent.type(
      screen.getByPlaceholderText(/Write the official response/i),
      "Done."
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Submit & Close RFI/i })
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Confirm & Close RFI/i })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("already closed")
    );
  });
});
