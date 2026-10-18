import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  MagnifyingGlassIcon,
  EnvelopeOpenIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PaperClipIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  WifiIcon,
  Cog6ToothIcon,
  FolderIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import {
  EnvelopeIcon,
  InboxStackIcon,
} from "@heroicons/react/24/outline";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useEmailInbox from "../hooks/useEmailInbox";
import useEmailConfigs from "../hooks/useEmailConfigs";
import EmailReviewModal from "../components/EmailReviewModal";
import EmailConfigModal from "../components/EmailConfigModal";
import EmailFolderModal from "../components/EmailFolderModal";

// ---------------------------------------------------------------------------
// Tab definitions — review queue tabs
// ---------------------------------------------------------------------------

const QUEUE_TABS = [
  { key: "pending",      label: "Pending Review",  icon: EnvelopeOpenIcon,         colour: "indigo" },
  { key: "auto_created", label: "Auto-created",    icon: CheckCircleIcon,           colour: "green"  },
  { key: "approved",     label: "Approved",        icon: CheckCircleIcon,           colour: "blue"   },
  { key: "rejected",     label: "Rejected",        icon: XCircleIcon,               colour: "red"    },
  { key: "filed",        label: "Filed",            icon: FolderIcon,               colour: "purple" },
  { key: "error",        label: "Errors",           icon: ExclamationTriangleIcon,  colour: "amber"  },
];

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ score }) {
  const pct = Math.round(score * 100);
  let cls = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (pct >= 85) cls = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  else if (pct >= 65) cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {pct}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Email type badge
// ---------------------------------------------------------------------------

const EMAIL_TYPE_STYLES = {
  rfi:       "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  pcn:       "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  app_email: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  other:     "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const EMAIL_TYPE_LABELS = {
  rfi:       "RFI",
  pcn:       "PCN",
  app_email: "App",
  other:     "Other",
};

function EmailTypeBadge({ type }) {
  const cls = EMAIL_TYPE_STYLES[type] || EMAIL_TYPE_STYLES.other;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {EMAIL_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  pending:      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  auto_created: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  approved:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  rejected:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  filed:        "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  error:        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function StatusPill({ status, display }) {
  const cls = STATUS_STYLES[status] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {display}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ activeTab }) {
  const tab = QUEUE_TABS.find((t) => t.key === activeTab);
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600">
      <EnvelopeIcon className="h-14 w-14 mb-4 opacity-40" />
      <p className="text-base font-medium">No {tab?.label.toLowerCase() ?? "emails"} found</p>
      <p className="text-sm mt-1 opacity-70">
        {activeTab === "pending"
          ? "The poller hasn't picked up any new emails yet."
          : "Nothing here right now."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email row
// ---------------------------------------------------------------------------

function EmailRow({ email, onSelect, onDelete, isSelected, onToggleSelect }) {
  const date = email.received_at
    ? new Date(email.received_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const time = email.received_at
    ? new Date(email.received_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <tr
      className={`group cursor-pointer transition-colors ${
        isSelected
          ? "bg-indigo-50 dark:bg-indigo-900/20"
          : "hover:bg-indigo-50/60 dark:hover:bg-indigo-900/10"
      }`}
      onClick={() => onSelect(email)}
    >
      {/* Checkbox */}
      <td className="py-3 pl-4 pr-2 sm:pl-5 w-8" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(email.id)}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
      </td>

      {/* Sender */}
      <td className="py-3 pl-2 pr-3 sm:pl-2">
        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate max-w-[180px]">
          {email.sender_name || email.sender_email}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">
          {email.sender_email}
        </div>
      </td>

      {/* Subject */}
      <td className="py-3 px-3 max-w-xs">
        <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
          {email.subject || <span className="italic text-gray-400">(no subject)</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {email.attachment_count > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <PaperClipIcon className="h-3 w-3" />
              {email.attachment_count}
            </span>
          )}
          {email.folder_name && (
            <span className="inline-flex items-center gap-1 text-xs text-purple-500 dark:text-purple-400">
              <FolderIcon className="h-3 w-3" />
              {email.folder_name}
            </span>
          )}
        </div>
      </td>

      {/* Email type */}
      <td className="py-3 px-3 hidden sm:table-cell">
        <EmailTypeBadge type={email.email_type} />
      </td>

      {/* Project */}
      <td className="py-3 px-3 hidden md:table-cell">
        {email.project_name ? (
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[160px]">
              {email.project_name}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{email.project_number}</div>
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic">Unmatched</span>
        )}
      </td>

      {/* Confidence */}
      <td className="py-3 px-3 hidden lg:table-cell text-center">
        <ConfidenceBadge score={email.confidence} />
      </td>

      {/* Status */}
      <td className="py-3 px-3 hidden sm:table-cell">
        <StatusPill status={email.status} display={email.status_display} />
      </td>

      {/* RFI link */}
      <td className="py-3 px-3 hidden lg:table-cell text-sm text-indigo-600 dark:text-indigo-400 font-medium">
        {email.rfi_number ?? "—"}
      </td>

      {/* Date + delete */}
      <td className="py-3 pl-3 pr-4 sm:pr-6 text-right hidden sm:table-cell">
        <div className="text-xs text-gray-500 dark:text-gray-400">{date}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500">{time}</div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(email.id); }}
          title="Delete email"
          className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Folder color dot
// ---------------------------------------------------------------------------

const FOLDER_COLOR_CLS = {
  indigo: "bg-indigo-500",
  blue:   "bg-blue-500",
  green:  "bg-green-500",
  amber:  "bg-amber-500",
  red:    "bg-red-500",
  purple: "bg-purple-500",
  gray:   "bg-gray-500",
};

function FolderDot({ color }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${FOLDER_COLOR_CLS[color] ?? "bg-gray-400"}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Inbox selector dropdown
// ---------------------------------------------------------------------------

function InboxSelector({ configs, activeConfigId, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const active = configs.find((c) => c.id === activeConfigId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm max-w-[200px]"
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${active ? (active.is_active ? "bg-green-500" : "bg-gray-400") : "bg-indigo-400"}`} />
        <span className="flex-1 text-left truncate">
          {active ? active.label : "All Inboxes"}
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
          {/* All inboxes */}
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left ${
              !activeConfigId
                ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <InboxStackIcon className="h-4 w-4 shrink-0 text-gray-400" />
            <span>All Inboxes</span>
            {!activeConfigId && <CheckCircleIcon className="h-4 w-4 ml-auto shrink-0 text-indigo-500" />}
          </button>

          {loading && (
            <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">Loading…</p>
          )}

          {configs.length > 0 && (
            <>
              <div className="h-px bg-gray-100 dark:bg-gray-800 mx-3" />
              {configs.map((cfg) => (
                <button
                  key={cfg.id}
                  type="button"
                  onClick={() => { onChange(cfg.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left ${
                    activeConfigId === cfg.id
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 mt-0.5 ${cfg.is_active ? "bg-green-500" : "bg-gray-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{cfg.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{cfg.username}</p>
                  </div>
                  {activeConfigId === cfg.id && (
                    <CheckCircleIcon className="h-4 w-4 shrink-0 text-indigo-500" />
                  )}
                </button>
              ))}
            </>
          )}

          {!loading && configs.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No inboxes configured.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox config card
// ---------------------------------------------------------------------------

function ConfigCard({ config, onEdit, onDelete, onTest, isTesting, testResult, onPoll, isPolling }) {
  const lastPolled = config.last_polled_at
    ? new Date(config.last_polled_at).toLocaleString(undefined, {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "Never";

  const busy = isTesting || isPolling;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {config.label}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                config.is_active
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {config.is_active ? "Active" : "Paused"}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 text-xs font-medium capitalize">
              {config.provider_display}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
            {config.username}
          </p>
          {config.subject_format_hint && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 italic truncate">
              Format: {config.subject_format_hint}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Poll now */}
          <button
            type="button"
            onClick={() => onPoll(config.id)}
            disabled={busy || !config.is_active}
            title={config.is_active ? "Poll now" : "Inbox is paused"}
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-40"
          >
            {isPolling
              ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
              : <ArrowDownTrayIcon className="h-4 w-4" />
            }
          </button>

          {/* Test connection */}
          <button
            type="button"
            onClick={() => onTest(config.id)}
            disabled={busy}
            title="Test connection"
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-40"
          >
            {isTesting
              ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
              : <WifiIcon className="h-4 w-4" />
            }
          </button>

          <button
            type="button"
            onClick={() => onEdit(config)}
            disabled={busy}
            title="Edit"
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-40"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(config.id)}
            disabled={busy}
            title="Remove"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400 dark:text-gray-500">
        <span>
          Mailbox: <span className="font-mono text-gray-600 dark:text-gray-300">{config.mailbox}</span>
        </span>
        <span>
          Auto-create: <span className="font-semibold text-gray-600 dark:text-gray-300">
            {Math.round(config.auto_create_threshold * 100)}%+
          </span>
        </span>
        <span className={isPolling ? "animate-pulse" : ""}>
          Last polled: {isPolling ? "Polling…" : lastPolled}
        </span>
      </div>

      {/* Connection test result */}
      {testResult && (
        <div
          className={`mt-2 rounded-md px-3 py-2 text-xs font-medium flex items-center gap-2 ${
            testResult.ok
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
          }`}
        >
          {testResult.ok
            ? <CheckCircleIcon className="h-4 w-4 shrink-0" />
            : <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          }
          {testResult.detail}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EmailInbox() {
  const navigate = useNavigate();

  // ---- Review queue state ----
  const [activeTab, setActiveTab]               = useState("pending");
  const [search, setSearch]                     = useState("");
  const [searchInput, setSearchInput]           = useState("");
  const [page, setPage]                         = useState(1);
  const [selectedEmail, setSelectedEmail]       = useState(null);
  const [activeEmailType, setActiveEmailType]   = useState(null); // rfi|pcn|app_email|other|null
  const [activeFolderId, setActiveFolderId]     = useState(null); // folder id or null
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState(null); // email id to delete
  const [selectedIds, setSelectedIds]               = useState(new Set()); // bulk selection
  const [bulkDeleteConfirm, setBulkDeleteConfirm]   = useState(false);

  // ---- Config management state ----
  const [showSettings, setShowSettings]   = useState(false);
  const [configModal, setConfigModal]     = useState(null);   // null | "new" | config object
  const [folderModal, setFolderModal]     = useState(null);   // null | "new" | folder object
  const [deleteConfirm, setDeleteConfirm] = useState(null);  // { type: "config"|"folder", id }
  const [activeConfigId, setActiveConfigId] = useState(null); // inbox filter; null = all

  const { emails, loading, error, count, next, prev, refetch, deleteEmail, bulkDeleteEmails } = useEmailInbox({
    status: activeTab,
    search,
    page,
    configId: activeConfigId,
    emailType: activeEmailType,
    folderId: activeFolderId,
  });

  const {
    configs, folders, loading: cfgLoading, error: cfgError,
    testingId, testResult,
    pollingId, pollConfig,
    createConfig, updateConfig, deleteConfig, testConfig,
    createFolder, updateFolder, deleteFolder, applyFolders,
  } = useEmailConfigs();

  const [applyingFolders, setApplyingFolders] = useState(false);

  const handlePoll = async (id) => {
    const res = await pollConfig(id);
    // Pull newly ingested emails into the table without a page reload
    if (res.ok && res.data?.emails_processed > 0) refetch();
  };

  const handleApplyFolders = async () => {
    setApplyingFolders(true);
    await applyFolders();
    setApplyingFolders(false);
  };

  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setPage(1);
    setSearch("");
    setSearchInput("");
    setActiveEmailType(null);
    setActiveFolderId(null);
    setSelectedIds(new Set());
    setShowSettings(false);
  }, []);

  // ---- Bulk selection helpers ----
  const allOnPageSelected = emails.length > 0 && emails.every((e) => selectedIds.has(e.id));
  const someOnPageSelected = emails.some((e) => selectedIds.has(e.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        emails.forEach((e) => next.delete(e.id));
      } else {
        emails.forEach((e) => next.add(e.id));
      }
      return next;
    });
  }, [emails, allOnPageSelected]);

  const toggleSelectOne = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleBulkDeleteConfirmed = async () => {
    const ids = [...selectedIds];
    const { ok } = await bulkDeleteEmails(ids);
    if (ok) setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleModalClose = (didChange) => {
    setSelectedEmail(null);
    if (didChange) refetch();
  };

  const handleConfigSave = async (data) => {
    if (configModal === "new") {
      return createConfig(data);
    }
    return updateConfig(configModal.id, data);
  };

  const handleFolderSave = async (data) => {
    if (folderModal === "new") {
      return createFolder(data);
    }
    return updateFolder(folderModal.id, data);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "config") {
      await deleteConfig(deleteConfirm.id);
    } else {
      await deleteFolder(deleteConfirm.id);
    }
    setDeleteConfirm(null);
  };

  const handleDeleteEmailConfirmed = async () => {
    if (!deleteEmailConfirm) return;
    const { ok } = await deleteEmail(deleteEmailConfirm);
    if (ok) setSelectedEmail(null); // close modal if open
    setDeleteEmailConfirm(null);
  };

  const totalPages = Math.ceil(count / 20) || 1;

  // If deletions shrink the total pages below the current page, jump back.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <Header />

        {/* Page title */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <InboxStackIcon className="h-7 w-7 text-indigo-500" />
              Email Inbox
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Review and manage emails fetched from your watched inboxes.
            </p>
          </div>

          {/* Right controls: inbox picker + settings gear */}
          <div className="flex items-center gap-2 shrink-0">
            <InboxSelector
              configs={configs}
              activeConfigId={activeConfigId}
              onChange={(id) => {
                setActiveConfigId(id);
                setPage(1);
                setSearch("");
                setSearchInput("");
                setSelectedIds(new Set());
              }}
              loading={cfgLoading}
            />
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              title="Manage inboxes & folders"
              className={`shrink-0 p-2 rounded-lg border transition-colors ${
                showSettings
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* SETTINGS PANEL                                                   */}
        {/* ---------------------------------------------------------------- */}
        {showSettings && (
          <div className="mb-8 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-5 space-y-6">

            {/* ----- Inbox Configs section ----- */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    <EnvelopeIcon className="h-4 w-4 text-indigo-500" />
                    Watched Inboxes
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Email addresses the system polls for new RFIs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfigModal("new")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add Inbox
                </button>
              </div>

              {cfgLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-4">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              )}

              {cfgError && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {cfgError}
                </div>
              )}

              {!cfgLoading && configs.length === 0 && (
                <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                  <EnvelopeIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No inboxes configured yet.</p>
                  <p className="text-xs mt-1">Click "Add Inbox" to connect your first email address.</p>
                </div>
              )}

              {configs.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {configs.map((cfg) => (
                    <ConfigCard
                      key={cfg.id}
                      config={cfg}
                      onEdit={setConfigModal}
                      onDelete={(id) => setDeleteConfirm({ type: "config", id })}
                      onTest={testConfig}
                      isTesting={testingId === cfg.id}
                      testResult={testResult[cfg.id]}
                      onPoll={handlePoll}
                      isPolling={pollingId === cfg.id}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ----- Folders section ----- */}
            <section className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    <FolderIcon className="h-4 w-4 text-purple-500" />
                    Email Folders
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    App notifications (Asana, Jira, etc.) are auto-filed by keyword match.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyFolders}
                    disabled={applyingFolders}
                    title="Re-run keyword matching against all existing emails"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {applyingFolders
                      ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                      : <ArrowPathIcon className="h-3.5 w-3.5" />
                    }
                    Re-apply rules
                  </button>
                  <button
                    type="button"
                    onClick={() => setFolderModal("new")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    New Folder
                  </button>
                </div>
              </div>

              {folders.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                  <FolderIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No folders yet.</p>
                  <p className="text-xs mt-1">Create folders to auto-file app notifications.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderDot color={folder.color} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{folder.name}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {folder.email_count ?? 0} email{folder.email_count !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {folder.keywords?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {folder.keywords.map((kw) => (
                                <span
                                  key={kw}
                                  className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-2 py-0.5 font-mono"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setFolderModal(folder)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm({ type: "folder", id: folder.id })}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* REVIEW QUEUE                                                     */}
        {/* ---------------------------------------------------------------- */}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {QUEUE_TABS.map(({ key, label, icon: Icon }) => {
              const active = key === activeTab && !showSettings;
              return (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  className={`
                    flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium
                    border-b-2 transition-colors
                    ${active
                      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600"
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── Sub-filters: folder chips + email-type chips ── */}
        {(folders.length > 0 || true) && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4">

            {/* Folder chips */}
            {folders.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Folder:</span>
                <button
                  type="button"
                  onClick={() => { setActiveFolderId(null); setPage(1); }}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    activeFolderId === null
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >All</button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setActiveFolderId(activeFolderId === f.id ? null : f.id); setPage(1); }}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      activeFolderId === f.id
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}

            {/* Email-type chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Type:</span>
              {[
                { key: null,        label: "All" },
                { key: "rfi",       label: "RFI" },
                { key: "pcn",       label: "PCN" },
                { key: "app_email", label: "App" },
                { key: "other",     label: "Other" },
              ].map(({ key, label }) => (
                <button
                  key={String(key)}
                  type="button"
                  onClick={() => { setActiveEmailType(key); setPage(1); }}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    activeEmailType === key
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4 flex gap-2 max-w-md">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by subject or sender…"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
              className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {/* Count */}
        {!loading && !error && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            {count === 0 ? "No results" : `${count} email${count !== 1 ? "s" : ""}`}
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-indigo-600 px-4 py-2.5 text-white shadow-md">
            <span className="text-sm font-medium flex-1">
              {selectedIds.size} email{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-indigo-200 hover:text-white text-xs font-medium transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-500 hover:bg-red-400 px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Delete selected
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          {loading ? (
            <div className="flex justify-center items-center py-20 text-gray-400 dark:text-gray-600 text-sm gap-2">
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : emails.length === 0 ? (
            <EmptyState activeTab={activeTab} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {/* Select-all checkbox */}
                    <th className="py-3 pl-4 pr-2 sm:pl-5 w-8">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 pl-2 pr-3 sm:pl-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Sender
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Subject
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                      Type
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      Project
                    </th>
                    <th className="py-3 px-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                      Confidence
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                      Status
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                      RFI
                    </th>
                    <th className="py-3 pl-3 pr-4 sm:pr-6 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                      Received
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {emails.map((email) => (
                    <EmailRow
                      key={email.id}
                      email={email}
                      onSelect={setSelectedEmail}
                      onDelete={setDeleteEmailConfirm}
                      isSelected={selectedIds.has(email.id)}
                      onToggleSelect={toggleSelectOne}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!prev}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!next}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Modals                                                              */}
      {/* ------------------------------------------------------------------ */}

      {/* Email review modal */}
      {selectedEmail && (
        <EmailReviewModal
          emailId={selectedEmail.id}
          onClose={handleModalClose}
        />
      )}

      {/* Config create/edit modal */}
      {configModal !== null && (
        <EmailConfigModal
          config={configModal === "new" ? null : configModal}
          onSave={handleConfigSave}
          onClose={() => setConfigModal(null)}
        />
      )}

      {/* Folder create/edit modal */}
      {folderModal !== null && (
        <EmailFolderModal
          folder={folderModal === "new" ? null : folderModal}
          onSave={handleFolderSave}
          onClose={() => setFolderModal(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Confirm Delete
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {deleteConfirm.type === "config"
                ? "This will permanently remove the inbox configuration. Existing inbound emails are kept."
                : "This will permanently delete the folder. Emails filed here will become unfiled."}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete {selectedIds.size} email{selectedIds.size !== 1 ? "s" : ""}?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              This permanently removes the selected email records. Any linked RFIs will remain.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteConfirmed}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Delete {selectedIds.size}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete email confirmation */}
      {deleteEmailConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Email
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              This will permanently remove the email record. Any linked RFI will remain.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteEmailConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEmailConfirmed}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
