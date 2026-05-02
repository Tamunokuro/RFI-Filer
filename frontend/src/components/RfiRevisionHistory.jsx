import { useEffect, useState } from "react";
import api from "../api";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

// ── Friendly labels for each tracked field ────────────────────────────────────
const FIELD_LABELS = {
  rfi_name:                "RFI Name",
  question:                "Question",
  proposed_solution:       "Proposed Solution",
  trade:                   "Trade",
  due_date:                "Due Date",
  received_date:           "Received Date",
  designers:               "Designers",
  contract_administrators: "Contract Administrators",
};

const formatRevisionDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

// ── Single field diff row ─────────────────────────────────────────────────────
const DiffRow = ({ field, before, after }) => {
  const label = FIELD_LABELS[field] || field;
  const isList = Array.isArray(before) || Array.isArray(after);

  const renderValue = (val) => {
    if (val === null || val === undefined || val === "") return <em className="text-gray-400">—</em>;
    if (Array.isArray(val)) {
      return val.length > 0 ? val.join(", ") : <em className="text-gray-400">none</em>;
    }
    return val;
  };

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 py-1.5 text-xs border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <span className="text-red-600 dark:text-red-400 line-through">{renderValue(before)}</span>
      <span className="text-green-700 dark:text-green-400">{renderValue(after)}</span>
    </div>
  );
};

// ── Single revision card ──────────────────────────────────────────────────────
const RevisionCard = ({ revision }) => {
  const [open, setOpen] = useState(false);
  const changeEntries = Object.entries(revision.changes || {});

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-xs font-bold text-amber-700 dark:text-amber-300">
            {revision.revision_number}
          </span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Revised by {revision.revised_by_name || "unknown"}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatRevisionDate(revision.revised_at)}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            · {changeEntries.length} field{changeEntries.length !== 1 ? "s" : ""} changed
          </span>
        </div>
        {open ? (
          <ChevronDownIcon className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <span>Field</span>
            <span>Before</span>
            <span>After</span>
          </div>
          {changeEntries.map(([field, { before, after }]) => (
            <DiffRow key={field} field={field} before={before} after={after} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const RfiRevisionHistory = ({ rfiId }) => {
  const [revisions, setRevisions] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/api/rfis/${rfiId}/revisions/`)
      .then(({ data }) => setRevisions(data))
      .catch(() => {}) // silently ignore; the section simply won't render
      .finally(() => setLoading(false));
  }, [rfiId]);

  if (loading || revisions.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-2">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            RFI Revision History
          </h3>
          <span className="rounded-full bg-amber-200 dark:bg-amber-800 px-2 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-200">
            {revisions.length}
          </span>
        </div>
        {expanded ? (
          <ChevronDownIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The following changes were made to this RFI while it was under review.
          </p>
          {revisions.map((rev) => (
            <RevisionCard key={rev.id} revision={rev} />
          ))}
        </div>
      )}
    </section>
  );
};

export default RfiRevisionHistory;
