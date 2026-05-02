import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SessionWarningModal from "../SessionWarningModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(props = {}) {
  const defaults = {
    open: true,
    onContinue: vi.fn(),
    onLogout: vi.fn(),
  };
  return render(<SessionWarningModal {...defaults} {...props} />);
}

// ── Visibility ────────────────────────────────────────────────────────────────

describe("SessionWarningModal — visibility", () => {
  it("renders nothing when open is false", () => {
    const { container } = renderModal({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the modal when open is true", () => {
    renderModal();
    expect(screen.getByText(/session expiring/i)).toBeInTheDocument();
  });

  it("shows the inactivity message", () => {
    renderModal();
    expect(screen.getByText(/been inactive/i)).toBeInTheDocument();
  });
});

// ── Countdown display ─────────────────────────────────────────────────────────

describe("SessionWarningModal — countdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts at 5:00", () => {
    renderModal();
    expect(screen.getByText("5:00")).toBeInTheDocument();
  });

  it("decrements by one second after 1 second", () => {
    renderModal();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("4:59")).toBeInTheDocument();
  });

  it("decrements to 4:00 after 60 seconds", () => {
    renderModal();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("4:00")).toBeInTheDocument();
  });

  it("resets countdown to 5:00 when modal re-opens", () => {
    // Open → advance → close → reopen.
    const { rerender } = renderModal();
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("4:30")).toBeInTheDocument();

    rerender(<SessionWarningModal open={false} onContinue={vi.fn()} onLogout={vi.fn()} />);
    rerender(<SessionWarningModal open={true}  onContinue={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByText("5:00")).toBeInTheDocument();
  });

  it("shows 0:00 when countdown reaches zero", () => {
    renderModal();
    act(() => vi.advanceTimersByTime(300_000)); // 5 minutes
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});

// ── Action buttons ────────────────────────────────────────────────────────────

describe("SessionWarningModal — actions", () => {
  it("calls onContinue when 'Stay logged in' is clicked", async () => {
    const onContinue = vi.fn();
    renderModal({ onContinue });
    await userEvent.click(screen.getByRole("button", { name: /stay logged in/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("calls onLogout when 'Log out' is clicked", async () => {
    const onLogout = vi.fn();
    renderModal({ onLogout });
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("'Stay logged in' button has autoFocus", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /stay logged in/i })).toHaveFocus();
  });

  it("renders both action buttons", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /stay logged in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });
});

// ── Urgency styling ───────────────────────────────────────────────────────────

describe("SessionWarningModal — urgency", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("countdown element does not contain urgent styling at 5:00", () => {
    renderModal();
    // At 5:00 the countdown should NOT be the red class.
    const timer = screen.getByText("5:00");
    expect(timer.className).not.toMatch(/red/);
  });

  it("countdown turns red in the last 60 seconds", () => {
    renderModal();
    // Advance to 59 seconds remaining (300 - 241 = 59).
    act(() => vi.advanceTimersByTime(241_000));
    const timer = screen.getByText(/:\d{2}/); // e.g. "0:59"
    expect(timer.className).toMatch(/red/);
  });
});
