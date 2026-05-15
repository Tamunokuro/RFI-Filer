import { useState, useCallback } from "react";
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
  PaperClipIcon,
} from "@heroicons/react/20/solid";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useEmailInbox from "../hooks/useEmailInbox";
import EmailReviewModal from "../components/EmailReviewModal";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { key: "pending",      label: "Pending Review",  icon: EnvelopeOpenIcon,         colour: "indigo" },
  { key: "auto_created", label: "Auto-created",    icon: CheckCircleIcon,           colour: "green"  },
  { key: "approved",     label: "Approved",        icon: CheckCircleIcon,           colour: "blue"   },
  { key: "rejected",     label: "Rejected",        icon: XCircleIcon,               colour: "red"    },
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
// Status pill
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  pending:      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  auto_created: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  approved:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  rejected:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
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
  const tab = TABS.find((t) => t.key === activeTab);
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

function EmailRow({ email, onSelect }) {
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
      className="group cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-colors"
      onClick={() => onSelect(email)}
    >
      {/* Sender */}
      <td className="py-3 pl-4 pr-3 sm:pl-6">
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
        {email.attachment_count > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            <PaperClipIcon className="h-3 w-3" />
            {email.attachment_count}
          </span>
        )}
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

      {/* Date */}
      <td className="py-3 pl-3 pr-4 sm:pr-6 text-right hidden sm:table-cell">
        <div className="text-xs text-gray-500 dark:text-gray-400">{date}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500">{time}</div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EmailInbox() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab]       = useState("pending");
  const [search, setSearch]             = useState("");
  const [searchInput, setSearchInput]   = useState("");
  const [page, setPage]                 = useState(1);
  const [selectedEmail, setSelectedEmail] = useState(null);

  const { emails, loading, error, count, next, prev, refetch } = useEmailInbox({
    status: activeTab,
    search,
    page,
  });

  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setPage(1);
    setSearch("");
    setSearchInput("");
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleModalClose = (didChange) => {
    setSelectedEmail(null);
    if (didChange) refetch();
  };

  const totalPages = Math.ceil(count / 20) || 1;

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
      <Header />

        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <EnvelopeIcon className="h-7 w-7 text-indigo-500" />
            Email Inbox
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Emails fetched from watched inboxes. Review pending items and convert them to RFIs.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = key === activeTab;
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
                    <th className="py-3 pl-4 pr-3 sm:pl-6 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Sender
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Subject
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
                    <EmailRow key={email.id} email={email} onSelect={setSelectedEmail} />
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

      {/* Review modal — rendered here so it can refetch on close */}
      {selectedEmail && (
        <EmailReviewModal
          emailId={selectedEmail.id}
          onClose={handleModalClose}
        />
      )}

      <Footer />
    </div>
  );
}
