/**
 * useIdleLogout
 * -------------
 * Tracks real user activity and forces a logout after IDLE_TIMEOUT_MS of
 * inactivity. Shows a warning modal WARN_BEFORE_MS before the timeout so
 * the user can choose to stay logged in.
 *
 * Activity events that reset the timer:
 *   mousemove, mousedown, keydown, scroll, touchstart, click
 *
 * Usage
 * -----
 *   const { showWarning, extendSession } = useIdleLogout();
 *
 *   <SessionWarningModal
 *     open={showWarning}
 *     onContinue={extendSession}
 *     onLogout={() => logout(navigate)}
 *   />
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/Auth";

// ── Tuneable constants ────────────────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; //  30 min  → forced logout
const WARN_BEFORE_MS  =  5 * 60 * 1000; //   5 min  → show warning at 25 min

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];
// ─────────────────────────────────────────────────────────────────────────────

export function useIdleLogout() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const idleTimerRef = useRef(null);
  const warnTimerRef = useRef(null);

  const [showWarning, setShowWarning] = useState(false);

  // Clear both pending timers.
  const clearTimers = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(warnTimerRef.current);
  }, []);

  /**
   * Reset the idle clock.
   * Called on every activity event and when the user clicks "Stay logged in".
   */
  const resetTimers = useCallback(() => {
    setShowWarning(false);
    clearTimers();

    if (!isAuthenticated) return;

    // ── Warning timer (fires 5 min before logout) ──────────────────────────
    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);

    // ── Logout timer ───────────────────────────────────────────────────────
    idleTimerRef.current = setTimeout(() => {
      logout(navigate);
    }, IDLE_TIMEOUT_MS);
  }, [isAuthenticated, logout, navigate, clearTimers]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearTimers();
      setShowWarning(false);
      return;
    }

    // Start the clock immediately on mount / login.
    resetTimers();

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimers, { passive: true })
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, resetTimers)
      );
    };
  }, [isAuthenticated, resetTimers, clearTimers]);

  return {
    showWarning,
    /** Call this to dismiss the warning and restart the idle clock. */
    extendSession: resetTimers,
  };
}
