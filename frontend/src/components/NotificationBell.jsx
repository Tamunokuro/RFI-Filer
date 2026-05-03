/**
 * NotificationBell
 *
 * Self-contained bell icon + dropdown notifications panel.
 *
 * Two notification streams are merged:
 *   1. RFI comment activity — polled from /api/rfis/unread-summary/
 *      and loaded from /api/rfis/notifications/ when the panel opens.
 *   2. Project membership events — loaded from /api/notifications/
 *      (project_added, etc.) when the panel opens; count also added to badge.
 *
 * "Mark all as read" clears both streams in one click.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BellAlertIcon,
  BellSlashIcon,
  CheckCircleIcon,
  FolderOpenIcon,
  BriefcaseIcon,
  ClockIcon,
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
  const [isOpen, setIsOpen]               = useState(false);
  const [totalUnread, setTotalUnread]     = useState(0);
  const [rfiNotifs, setRfiNotifs]         = useState([]);
  const [projectNotifs, setProjectNotifs] = useState([]);
  const [loading, setLoading]             = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // ── Poll badge count every 30 s ──────────────────────────────────────────
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [rfiRes, projRes] = await Promise.all([
          api.get("/api/rfis/unread-summary/").catch(() => ({ data: {} })),
          api.get("/api/notifications/").catch(() => ({ data: [] })),
        ]);

        const rfiTotal = Object.values(rfiRes.data || {}).reduce(
          (sum, n) => sum + Number(n),
          0
        );
        const projTotal = Array.isArray(projRes.data) ? projRes.data.length : 0;
        setTotalUnread(rfiTotal + projTotal);
      } catch {
        // silently ignore poll failures
      }
    };

    fetchCounts();
    const id = setInterval(fetchCounts, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch notification details when panel opens ───────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [rfiRes, projRes] = await Promise.all([
          api.get("/api/rfis/notifications/").catch(() => ({ data: [] })),
          api.get("/api/notifications/").catch(() => ({ data: [] })),
        ]);
        setRfiNotifs(Array.isArray(rfiRes.data) ? rfiRes.data : []);
        setProjectNotifs(Array.isArray(projRes.data) ? projRes.data : []);
      } catch {
        setRfiNotifs([]);
        setProjectNotifs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
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
      await Promise.all([
        api.post("/api/rfis/mark-all-read/").catch(() => {}),
        api.post("/api/notifications/mark-read/").catch(() => {}),
      ]);
      setTotalUnread(0);
      setRfiNotifs([]);
      setProjectNotifs([]);
    } catch {
      // silent
    }
  };

  const handleRfiClick = (notif) => {
    setRfiNotifs((prev) => prev.filter((n) => n.rfi_id !== notif.rfi_id));
    setTotalUnread((prev) => Math.max(0, prev - notif.unread_count));
    setIsOpen(false);
    api.post(`/api/rfis/${notif.rfi_id}/mark-read/`).catch(() => {});
    navigate(`/rfi/${notif.rfi_id}/${notif.rfi_slug}`);
  };

  const handleProjectNotifClick = (notif) => {
    setProjectNotifs((prev) => prev.filter((n) => n.id !== notif.id));
    setTotalUnread((prev) => Math.max(0, prev - 1));
    setIsOpen(false);
    api.post("/api/notifications/mark-read/").catch(() => {});
    // Route to RFI or project depending on verb
    if (notif.rfi_id) {
      navigate(`/rfi/${notif.rfi_id}/${notif.rfi_slug}`);
    } else {
      navigate(`/projects/${notif.project_id}`);
    }
  };

  const hasAny = rfiNotifs.length > 0 || projectNotifs.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative hover:bg-blue-100 dark:hover:bg-gray-700 text-blue-800 dark:text-blue-300 p-2 rounded-full border border-blue-200 dark:border-gray-600 shadow-sm transition duration-150"
        title={
          totalUnread > 0
            ? `${totalUnread} unread notification${totalUnread === 1 ? "" : "s"}`
            : "No new notifications"
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
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[80vh] flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl z-50 overflow-hidden">
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
            {hasAny && (
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
            ) : !hasAny ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-gray-400 dark:text-gray-500">
                <BellSlashIcon className="w-10 h-10 opacity-50" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  You're all caught up!
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No new notifications.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {/* ── Project / RFI notifications (shown first) ─────── */}
                {projectNotifs.map((notif) => {
                  const isAssigned = notif.verb === "rfi_assigned";
                  const isDueSoon  = notif.verb === "rfi_due_soon";
                  const isProject  = notif.verb === "project_added";

                  const dotColor = isDueSoon
                    ? "bg-red-500"
                    : isAssigned
                    ? "bg-blue-500"
                    : "bg-amber-500";

                  const hoverBg = isDueSoon
                    ? "hover:bg-red-50 dark:hover:bg-gray-700"
                    : isAssigned
                    ? "hover:bg-blue-50 dark:hover:bg-gray-700"
                    : "hover:bg-amber-50 dark:hover:bg-gray-700";

                  const badgeColor = isDueSoon
                    ? "text-red-700 dark:text-red-400"
                    : isAssigned
                    ? "text-blue-700 dark:text-blue-400"
                    : "text-amber-700 dark:text-amber-400";

                  const BadgeIcon = isDueSoon
                    ? ClockIcon
                    : isAssigned
                    ? BriefcaseIcon
                    : FolderOpenIcon;

                  const badgeLabel = isDueSoon
                    ? `Due in ${notif.days_remaining ?? 3} days`
                    : isAssigned
                    ? "Assigned to RFI"
                    : "Added to project";

                  return (
                    <li
                      key={`proj-${notif.id}`}
                      onClick={() => handleProjectNotifClick(notif)}
                      className={`flex gap-3 px-4 py-3.5 ${hoverBg} cursor-pointer transition-colors`}
                    >
                      {/* Unread dot */}
                      <div className="mt-1.5 shrink-0">
                        <span className={`block w-2 h-2 rounded-full ${dotColor}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Type badge */}
                        <p className={`text-[11px] font-semibold flex items-center gap-1 mb-0.5 ${badgeColor}`}>
                          <BadgeIcon className="h-3.5 w-3.5 shrink-0" />
                          {badgeLabel}
                        </p>

                        {/* Primary title */}
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">
                          {isProject
                            ? `${notif.project_number} – ${notif.project_name}`
                            : `RFI #${notif.rfi_number}: ${notif.rfi_name}`}
                        </p>

                        {/* Secondary line */}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {isProject && notif.role && (
                            <>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Role:</span>{" "}
                              {notif.role}
                              {notif.actor_name && (
                                <> · Added by <span className="font-medium text-gray-700 dark:text-gray-300">{notif.actor_name}</span></>
                              )}
                            </>
                          )}
                          {isAssigned && (
                            <>
                              {notif.project_number} – {notif.project_name}
                              {notif.actor_name && (
                                <> · Assigned by <span className="font-medium text-gray-700 dark:text-gray-300">{notif.actor_name}</span></>
                              )}
                            </>
                          )}
                          {isDueSoon && (
                            <>
                              {notif.project_number} – {notif.project_name}
                              {notif.due_date && (
                                <> · Due <span className="font-medium text-red-600 dark:text-red-400">{new Date(notif.due_date).toLocaleDateString()}</span></>
                              )}
                            </>
                          )}
                        </p>

                        {/* Time */}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                          {relativeTime(notif.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}

                {/* ── RFI comment notifications ──────────────────────── */}
                {rfiNotifs.map((notif) => (
                  <li
                    key={`rfi-${notif.rfi_id}`}
                    onClick={() => handleRfiClick(notif)}
                    className="flex gap-3 px-4 py-3.5 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    {/* Unread indicator dot */}
                    <div className="mt-1.5 shrink-0">
                      <span className="block w-2 h-2 rounded-full bg-indigo-500" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* RFI + project identifier */}
                      <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 truncate">
                        {notif.rfi_number}
                        <span className="mx-1 text-indigo-300 dark:text-indigo-600">·</span>
                        {notif.project_number}
                      </p>

                      {/* RFI name */}
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">
                        {notif.rfi_name}
                      </p>

                      {/* Official response badge */}
                      {notif.is_official && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded px-1.5 py-0.5">
                          Official Response
                        </span>
                      )}

                      {/* Author + message snippet */}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {notif.latest_author}:
                        </span>{" "}
                        {notif.latest_body}
                      </p>

                      {/* Footer row: project name + unread count + time */}
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                          {notif.project_name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {notif.unread_count > 1 && (
                            <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-700 rounded-full px-1.5 py-0.5">
                              +{notif.unread_count - 1} more
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
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
          {hasAny && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
                {[
                  projectNotifs.length > 0 &&
                    `${projectNotifs.length} update${projectNotifs.length !== 1 ? "s" : ""}`,
                  rfiNotifs.length > 0 &&
                    `${rfiNotifs.length} RFI${rfiNotifs.length !== 1 ? "s" : ""} with new activity`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
