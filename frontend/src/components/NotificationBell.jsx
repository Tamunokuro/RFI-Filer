/**
 * NotificationBell
 *
 * Notifications from two streams:
 *   1. RFI comment activity  — /api/rfis/unread-summary/ (poll) + /api/rfis/notifications/ (panel)
 *   2. Project / RFI events  — /api/notifications/ (project_added, rfi_assigned, rfi_due_soon)
 *
 * Grouping: notifications of the same verb type are collapsed into a single
 * expandable card (e.g. "Assigned to 4 RFIs") so the panel never feels spammy
 * when many actions happen at once.  Single-item groups render as a regular card.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  BellAlertIcon,
  BellSlashIcon,
  CheckCircleIcon,
  FolderOpenIcon,
  BriefcaseIcon,
  ClockIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import api from "../api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoString) {
  if (!isoString) return "";
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Per-verb display config ─────────────────────────────────────────────────────
const VERB_META = {
  project_added: {
    Icon:        FolderOpenIcon,
    dotColor:    "bg-amber-500",
    badgeColor:  "text-amber-700 dark:text-amber-400",
    hoverBg:     "hover:bg-amber-50 dark:hover:bg-gray-700/60",
    groupBg:     "bg-amber-50/50 dark:bg-amber-950/20",
    groupBorder: "border-amber-100 dark:border-amber-900/40",
    groupLabel:  (n) => `Added to ${n} project${n !== 1 ? "s" : ""}`,
    singleLabel: "Added to project",
    itemLine:    (n) => `${n.project_number} – ${n.project_name}`,
    itemSub:     (n) => [n.role, n.actor_name && `by ${n.actor_name}`].filter(Boolean).join(" · "),
    destination: (n) => `/projects/${n.project_id}`,
  },
  rfi_assigned: {
    Icon:        BriefcaseIcon,
    dotColor:    "bg-blue-500",
    badgeColor:  "text-blue-700 dark:text-blue-400",
    hoverBg:     "hover:bg-blue-50 dark:hover:bg-gray-700/60",
    groupBg:     "bg-blue-50/50 dark:bg-blue-950/20",
    groupBorder: "border-blue-100 dark:border-blue-900/40",
    groupLabel:  (n) => `Assigned to ${n} RFI${n !== 1 ? "s" : ""}`,
    singleLabel: "Assigned to RFI",
    itemLine:    (n) => `RFI #${n.rfi_number}: ${n.rfi_name}`,
    itemSub:     (n) => [
      `${n.project_number} – ${n.project_name}`,
      n.actor_name && `by ${n.actor_name}`,
    ].filter(Boolean).join(" · "),
    destination: (n) => `/rfi/${n.rfi_id}/${n.rfi_slug}`,
  },
  rfi_due_soon: {
    Icon:        ClockIcon,
    dotColor:    "bg-red-500",
    badgeColor:  "text-red-700 dark:text-red-400",
    hoverBg:     "hover:bg-red-50 dark:hover:bg-gray-700/60",
    groupBg:     "bg-red-50/50 dark:bg-red-950/20",
    groupBorder: "border-red-100 dark:border-red-900/40",
    groupLabel:  (n) => `${n} RFI${n !== 1 ? "s" : ""} due soon`,
    singleLabel: (n) => `Due in ${n?.days_remaining ?? 3} days`,
    itemLine:    (n) => `RFI #${n.rfi_number}: ${n.rfi_name}`,
    itemSub:     (n) => [
      `${n.project_number}`,
      n.due_date && `due ${fmtDate(n.due_date)}`,
    ].filter(Boolean).join(" · "),
    destination: (n) => `/rfi/${n.rfi_id}/${n.rfi_slug}`,
  },
};

// Group an array of notifications by verb, preserving insertion order of first seen
function groupByVerb(notifs) {
  const map = new Map();
  for (const n of notifs) {
    if (!map.has(n.verb)) map.set(n.verb, []);
    map.get(n.verb).push(n);
  }
  return Array.from(map.entries()).map(([verb, items]) => ({ verb, items }));
}

// ── Component ─────────────────────────────────────────────────────────────────

const NotificationBell = () => {
  const [isOpen, setIsOpen]               = useState(false);
  const [totalUnread, setTotalUnread]     = useState(0);
  const [rfiNotifs, setRfiNotifs]         = useState([]);
  const [projectNotifs, setProjectNotifs] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [expandedVerbs, setExpandedVerbs] = useState(new Set());

  const containerRef = useRef(null);
  const navigate     = useNavigate();

  // ── Poll badge count every 30 s ──────────────────────────────────────────
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [rfiRes, projRes] = await Promise.all([
          api.get("/api/rfis/unread-summary/").catch(() => ({ data: {} })),
          api.get("/api/notifications/").catch(() => ({ data: [] })),
        ]);
        const rfiTotal  = Object.values(rfiRes.data || {}).reduce((s, n) => s + Number(n), 0);
        const projTotal = Array.isArray(projRes.data) ? projRes.data.length : 0;
        setTotalUnread(rfiTotal + projTotal);
      } catch { /* silent */ }
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch full lists when panel opens ─────────────────────────────────────
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
        // Auto-expand if only one verb group exists
        const groups = groupByVerb(Array.isArray(projRes.data) ? projRes.data : []);
        if (groups.length === 1 && groups[0].items.length > 1) {
          setExpandedVerbs(new Set([groups[0].verb]));
        }
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
      if (containerRef.current && !containerRef.current.contains(e.target))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleVerb = useCallback((verb) => {
    setExpandedVerbs((prev) => {
      const next = new Set(prev);
      next.has(verb) ? next.delete(verb) : next.add(verb);
      return next;
    });
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await Promise.all([
        api.post("/api/rfis/mark-all-read/").catch(() => {}),
        api.post("/api/notifications/mark-read/").catch(() => {}),
      ]);
      setTotalUnread(0);
      setRfiNotifs([]);
      setProjectNotifs([]);
      setExpandedVerbs(new Set());
    } catch { /* silent */ }
  };

  const handleRfiClick = (notif) => {
    setRfiNotifs((prev) => prev.filter((n) => n.rfi_id !== notif.rfi_id));
    setTotalUnread((prev) => Math.max(0, prev - notif.unread_count));
    setIsOpen(false);
    api.post(`/api/rfis/${notif.rfi_id}/mark-read/`).catch(() => {});
    navigate(`/rfi/${notif.rfi_id}/${notif.rfi_slug}`);
  };

  // Navigate to a specific project notification item and remove it from state
  const handleProjectItemClick = useCallback((notif) => {
    const meta = VERB_META[notif.verb];
    setProjectNotifs((prev) => prev.filter((n) => n.id !== notif.id));
    setTotalUnread((prev) => Math.max(0, prev - 1));
    setIsOpen(false);
    api.post("/api/notifications/mark-read/").catch(() => {});
    navigate(meta?.destination(notif) ?? "/");
  }, [navigate]);

  const hasAny = rfiNotifs.length > 0 || projectNotifs.length > 0;
  const verbGroups = groupByVerb(projectNotifs);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      {/* ── Bell button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((p) => !p)}
        className="relative hover:bg-blue-100 dark:hover:bg-gray-700 text-blue-800 dark:text-blue-300 p-2 rounded-full border border-blue-200 dark:border-gray-600 shadow-sm transition duration-150"
        title={totalUnread > 0 ? `${totalUnread} unread notification${totalUnread !== 1 ? "s" : ""}` : "No new notifications"}
        aria-label="Notifications"
      >
        <BellAlertIcon className="w-6 h-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ──────────────────────────────────────────────── */}
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
              <div className="flex items-center justify-center py-14">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
              </div>
            ) : !hasAny ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-gray-400 dark:text-gray-500">
                <BellSlashIcon className="w-10 h-10 opacity-50" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You're all caught up!</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">No new notifications.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">

                {/* ── Grouped project / RFI event notifications ──────── */}
                {verbGroups.map(({ verb, items }) => {
                  const meta     = VERB_META[verb] ?? VERB_META.project_added;
                  const { Icon } = meta;
                  const isExpanded = expandedVerbs.has(verb);
                  const single   = items.length === 1;
                  const latest   = items[0]; // already ordered newest-first from API

                  // ── Single item: full detail card (unchanged look) ──
                  if (single) {
                    const label = typeof meta.singleLabel === "function"
                      ? meta.singleLabel(latest)
                      : meta.singleLabel;
                    return (
                      <li
                        key={verb}
                        onClick={() => handleProjectItemClick(latest)}
                        className={`flex gap-3 px-4 py-3.5 ${meta.hoverBg} cursor-pointer transition-colors`}
                      >
                        <div className="mt-1.5 shrink-0">
                          <span className={`block w-2 h-2 rounded-full ${meta.dotColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-semibold flex items-center gap-1 mb-0.5 ${meta.badgeColor}`}>
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            {label}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">
                            {meta.itemLine(latest)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {meta.itemSub(latest)}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                            {relativeTime(latest.created_at)}
                          </p>
                        </div>
                      </li>
                    );
                  }

                  // ── Multiple items: collapsible group card ──────────
                  const groupLabel = typeof meta.groupLabel === "function"
                    ? meta.groupLabel(items.length)
                    : meta.groupLabel;

                  return (
                    <li key={verb} className={`border-b border-gray-100 dark:border-gray-700 last:border-b-0`}>
                      {/* Group header — click to expand/collapse */}
                      <button
                        type="button"
                        onClick={() => toggleVerb(verb)}
                        className={`w-full flex items-center gap-3 px-4 py-3 ${meta.hoverBg} transition-colors text-left`}
                      >
                        {/* Dot + icon */}
                        <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                          <span className={`block w-2 h-2 rounded-full ${meta.dotColor}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-semibold flex items-center gap-1 ${meta.badgeColor}`}>
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            {groupLabel}
                            {/* Count badge */}
                            <span className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white ${meta.dotColor}`}>
                              {items.length}
                            </span>
                          </p>
                          {!isExpanded && (
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                              Most recent: {relativeTime(latest.created_at)}
                            </p>
                          )}
                        </div>

                        {/* Chevron */}
                        <ChevronDownIcon
                          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>

                      {/* Expanded item list */}
                      {isExpanded && (
                        <ul className={`${meta.groupBg} border-t ${meta.groupBorder}`}>
                          {items.map((notif, idx) => (
                            <li
                              key={notif.id}
                              onClick={() => handleProjectItemClick(notif)}
                              className={`flex items-start gap-3 px-5 py-2.5 cursor-pointer ${meta.hoverBg} transition-colors
                                ${idx < items.length - 1 ? "border-b " + meta.groupBorder : ""}`}
                            >
                              {/* Bullet */}
                              <span className={`mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotColor} opacity-70`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate leading-snug">
                                  {meta.itemLine(notif)}
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                  {meta.itemSub(notif)}
                                  {notif.created_at && (
                                    <span className="ml-1.5 text-gray-400 dark:text-gray-500">
                                      · {relativeTime(notif.created_at)}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}

                {/* ── RFI comment notifications (already per-RFI, no grouping needed) */}
                {rfiNotifs.map((notif) => (
                  <li
                    key={`rfi-${notif.rfi_id}`}
                    onClick={() => handleRfiClick(notif)}
                    className="flex gap-3 px-4 py-3.5 hover:bg-blue-50 dark:hover:bg-gray-700/60 cursor-pointer transition-colors"
                  >
                    <div className="mt-1.5 shrink-0">
                      <span className="block w-2 h-2 rounded-full bg-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 truncate">
                        {notif.rfi_number}
                        <span className="mx-1 text-indigo-300 dark:text-indigo-600">·</span>
                        {notif.project_number}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">
                        {notif.rfi_name}
                      </p>
                      {notif.is_official && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded px-1.5 py-0.5">
                          Official Response
                        </span>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {notif.latest_author}:
                        </span>{" "}
                        {notif.latest_body}
                      </p>
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

          {/* Panel footer */}
          {hasAny && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
                {[
                  verbGroups.length > 0 &&
                    `${projectNotifs.length} update${projectNotifs.length !== 1 ? "s" : ""} in ${verbGroups.length} group${verbGroups.length !== 1 ? "s" : ""}`,
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
