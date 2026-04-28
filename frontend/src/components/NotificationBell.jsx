/**
 * NotificationBell
 *
 * Self-contained bell icon + dropdown notifications panel.
 * - Polls /api/rfis/unread-summary/ every 30 s for the badge count.
 * - Fetches /api/rfis/notifications/ when the panel is opened.
 * - Clicking an item navigates to the relevant RFI detail page.
 * - "Mark all as read" calls /api/rfis/mark-all-read/ and clears state.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BellAlertIcon,
  BellSlashIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import api from "../api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────────────

const NotificationBell = () => {
  const [isOpen, setIsOpen]             = useState(false);
  const [totalUnread, setTotalUnread]   = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]           = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // ── Poll badge count every 30 s ──────────────────────────────────────────
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const { data } = await api.get("/api/rfis/unread-summary/");
        const total = Object.values(data || {}).reduce(
          (sum, n) => sum + Number(n),
          0
        );
        setTotalUnread(total);
      } catch {
        // silently ignore poll failures
      }
    };

    fetchSummary();
    const id = setInterval(fetchSummary, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch notification details when panel opens ───────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/api/rfis/notifications/");
        setNotifications(Array.isArray(data) ? data : []);
      } catch {
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [isOpen]);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    try {
      await api.post("/api/rfis/mark-all-read/");
      setTotalUnread(0);
      setNotifications([]);
    } catch {
      // silent
    }
  };

  const handleItemClick = (notif) => {
    // Optimistic update — remove item and shrink badge immediately so the
    // user sees the change without waiting for the server or the 30 s poll.
    setNotifications((prev) => prev.filter((n) => n.rfi_id !== notif.rfi_id));
    setTotalUnread((prev) => Math.max(0, prev - notif.unread_count));
    setIsOpen(false);

    // Tell the server this RFI is now read (fire-and-forget; poll corrects on failure).
    api.post(`/api/rfis/${notif.rfi_id}/mark-read/`).catch(() => {});

    navigate(`/rfi/${notif.rfi_id}/${notif.rfi_slug}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative hover:bg-blue-100 text-blue-800 p-2 rounded-full border border-blue-200 shadow-sm transition duration-150"
        title={
          totalUnread > 0
            ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"}`
            : "No new messages"
        }
        aria-label="Notifications"
      >
        <BellAlertIcon className="w-6 h-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[80vh] flex flex-col bg-white rounded-xl border border-gray-200 shadow-2xl z-50 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-800 to-indigo-900 shrink-0">
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Notifications
              {totalUnread > 0 && (
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-blue-200 hover:text-white transition-colors"
              >
                <CheckCircleIcon className="w-4 h-4" />
                Mark all as read
              </button>
            )}
          </div>

          {/* Panel body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              /* Loading spinner */
              <div className="flex items-center justify-center py-14">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-gray-400">
                <BellSlashIcon className="w-10 h-10 opacity-50" />
                <p className="text-sm font-medium text-gray-500">
                  You're all caught up!
                </p>
                <p className="text-xs text-gray-400">
                  No new messages on your RFIs.
                </p>
              </div>
            ) : (
              /* Notification list */
              <ul className="divide-y divide-gray-100">
                {notifications.map((notif) => (
                  <li
                    key={notif.rfi_id}
                    onClick={() => handleItemClick(notif)}
                    className="flex gap-3 px-4 py-3.5 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    {/* Unread indicator dot */}
                    <div className="mt-1.5 shrink-0">
                      <span className="block w-2 h-2 rounded-full bg-indigo-500" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* RFI + project identifier */}
                      <p className="text-[11px] font-semibold text-indigo-700 truncate">
                        {notif.rfi_number}
                        <span className="mx-1 text-indigo-300">·</span>
                        {notif.project_number}
                      </p>

                      {/* RFI name */}
                      <p className="text-sm font-semibold text-gray-900 truncate leading-snug">
                        {notif.rfi_name}
                      </p>

                      {/* Official response badge */}
                      {notif.is_official && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                          Official Response
                        </span>
                      )}

                      {/* Author + message snippet */}
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                        <span className="font-semibold text-gray-700">
                          {notif.latest_author}:
                        </span>{" "}
                        {notif.latest_body}
                      </p>

                      {/* Footer row: project name + unread count + time */}
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-[10px] text-gray-400 truncate">
                          {notif.project_name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {notif.unread_count > 1 && (
                            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-1.5 py-0.5">
                              +{notif.unread_count - 1} more
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {relativeTime(notif.latest_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Panel footer — only when there are items */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 shrink-0">
              <p className="text-[10px] text-gray-400 text-center">
                Showing {notifications.length} RFI
                {notifications.length !== 1 ? "s" : ""} with new activity
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
