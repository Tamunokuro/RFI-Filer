import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import SplashScreen from "../SplashScreen";

// ── Phase timings (must match SplashScreen constants) ─────────────────────────
const PHASE_1_MS  =  800;   // card appears
const PHASE_2_MS  = 1700;   // checkmark draws
const PHASE_3_MS  = 3500;   // fade-out starts
const TOTAL_MS    = 4500;   // onDone fires

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => vi.useFakeTimers());
afterEach (() => vi.useRealTimers());

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("SplashScreen — initial render", () => {
  it("renders the app name", () => {
    render(<SplashScreen onDone={vi.fn()} />);
    expect(screen.getByText("RFI Filer")).toBeInTheDocument();
  });

  it("renders the app tagline", () => {
    render(<SplashScreen onDone={vi.fn()} />);
    expect(screen.getByText(/construction rfi management/i)).toBeInTheDocument();
  });

  it("does not show the RFI card before phase 1", () => {
    render(<SplashScreen onDone={vi.fn()} />);
    // The skeleton card only mounts after 800 ms.
    expect(screen.queryByRole("separator")).toBeNull(); // no card-specific structure yet
  });

  it("renders the loading dots", () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    // Three dot spans — query by the animation style they carry.
    const dots = container.querySelectorAll("span[style*='dot-bounce']");
    expect(dots).toHaveLength(3);
  });
});

// ── Phase progression ─────────────────────────────────────────────────────────

describe("SplashScreen — phase transitions", () => {
  it("card (skeleton lines) appears after 800 ms", () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(PHASE_1_MS));

    // The shimmer lines (.ss-line) mount with the card.
    const lines = container.querySelectorAll(".ss-line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("green resolved bar appears after the checkmark phase (1700 ms)", () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(PHASE_2_MS));

    // The emerald bar uses bg-emerald-100 or bg-emerald-900/40.
    const resolved = container.querySelector("[class*='emerald']");
    expect(resolved).not.toBeNull();
  });

  it("the SVG checkmark circle renders after phase 2", () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(PHASE_2_MS));

    // Phase ≥2 renders an SVG with a circle element.
    const circle = container.querySelector("svg circle");
    expect(circle).not.toBeNull();
  });
});

// ── onDone callback ───────────────────────────────────────────────────────────

describe("SplashScreen — onDone lifecycle", () => {
  it("calls onDone after the full animation duration (4500 ms)", () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);

    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(TOTAL_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not call onDone before the full duration", () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);

    act(() => vi.advanceTimersByTime(TOTAL_MS - 1));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("cancels all timers on unmount (no onDone after unmount)", () => {
    const onDone = vi.fn();
    const { unmount } = render(<SplashScreen onDone={onDone} />);

    act(() => vi.advanceTimersByTime(PHASE_1_MS));
    unmount();
    act(() => vi.advanceTimersByTime(TOTAL_MS));

    expect(onDone).not.toHaveBeenCalled();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("SplashScreen — accessibility", () => {
  it("has a select-none class to prevent text selection during animation", () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    // The component renders a <style> tag first, then the backdrop <div>.
    const backdrop = container.querySelector("div.fixed");
    expect(backdrop).not.toBeNull();
    expect(backdrop.className).toMatch(/select-none/);
  });

  it("is positioned fixed and covers the full viewport (z-index layer)", () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    const backdrop = container.querySelector("div.fixed");
    expect(backdrop).not.toBeNull();
    expect(backdrop.className).toMatch(/inset-0/);
  });
});
