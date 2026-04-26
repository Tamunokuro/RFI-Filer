/**
 * Apple-style notification toaster.
 *
 * Subscribes to the toast event bus (src/toast.js) and renders dark-pill
 * notifications that slide in from the top, auto-dismiss after 3.5 s,
 * and can be manually dismissed with a click or the × button.
 *
 * Usage: mount <Toaster /> once near the root of your tree (App.jsx).
 */

import { useState, useEffect, useCallback } from "react";
import toast from "../toast";
import {
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";

// ── Config ────────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 3500;
const SLIDE_OUT_MS    = 280;
const MAX_TOASTS      = 5;

const ICON_MAP = {
  success: <CheckCircleIcon      className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />,
  error:   <XCircleIcon          className="h-5 w-5 text-red-400   shrink-0 mt-0.5" />,
  info:    <InformationCircleIcon className="h-5 w-5 text-blue-400  shrink-0 mt-0.5" />,
};

// ── Single toast ──────────────────────────────────────────────────────────────

function ToastItem({ item, onDismiss }) {
  const [visible, setVisible] = useState(false);

  // Trigger enter on next microtask so CSS transition fires
  useEffect(() => {
    const enterTick = requestAnimationFrame(() => setVisible(true));
    const autoHide  = setTimeout(() => startDismiss(), AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(enterTick);
      clearTimeout(autoHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onDismiss(item.id), SLIDE_OUT_MS);
  }, [item.id, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      onClick={startDismiss}
      className={[
        // layout
        "flex items-start gap-3 px-4 py-3 cursor-pointer select-none",
        // appearance — dark pill matching macOS / iOS style
        "bg-gray-900/95 backdrop-blur-sm rounded-2xl shadow-2xl",
        "min-w-[280px] max-w-[380px] w-max",
        // transition
        "transition-all duration-[280ms] ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3",
      ].join(" ")}
    >
      {ICON_MAP[item.type] ?? ICON_MAP.info}

      <p className="flex-1 text-sm font-medium text-white leading-snug">
        {item.message}
      </p>

      <button
        aria-label="Dismiss notification"
        onClick={(e) => { e.stopPropagation(); startDismiss(); }}
        className="mt-0.5 shrink-0 text-gray-400 hover:text-white transition-colors"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

export default function Toaster() {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (item) => {
      setItems((prev) => [item, ...prev].slice(0, MAX_TOASTS));
    };
    toast._subscribe(handler);
    return () => toast._unsubscribe(handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed top-6 inset-x-0 z-50 flex flex-col items-center gap-2 pointer-events-none"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastItem item={item} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
