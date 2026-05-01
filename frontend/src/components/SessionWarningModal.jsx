/**
 * SessionWarningModal
 * --------------------
 * Displayed when the user has been idle for 25 minutes (5 min before the
 * 30-minute forced-logout threshold). Shows a live countdown and two actions:
 *   • Stay logged in  → resets the idle timer
 *   • Log out         → immediately clears the session
 */

import { useEffect, useState } from "react";

const COUNTDOWN_SECONDS = 5 * 60; // must match WARN_BEFORE_MS in useIdleLogout

const SessionWarningModal = ({ open, onContinue, onLogout }) => {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  // Start / reset the countdown whenever the modal opens or closes.
  useEffect(() => {
    if (!open) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      return;
    }

    setSecondsLeft(COUNTDOWN_SECONDS);

    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  if (!open) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const urgent  = secondsLeft <= 60; // turn red in the last minute

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 text-center">

        {/* Icon */}
        <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
            />
          </svg>
        </div>

        {/* Heading */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Session Expiring
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          You've been inactive. You'll be automatically logged out in:
        </p>

        {/* Countdown */}
        <p
          className={`text-5xl font-mono font-bold mb-6 transition-colors ${
            urgent
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {timeStr}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600
                       text-gray-700 dark:text-gray-300 text-sm font-medium
                       hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            Log out
          </button>
          <button
            onClick={onContinue}
            autoFocus
            className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700
                       text-white text-sm font-semibold transition"
          >
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionWarningModal;
