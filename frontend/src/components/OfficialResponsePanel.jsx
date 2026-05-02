import { useEffect, useRef, useState } from "react";
import api from "../api";
import toast from "../toast";
import {
  canSubmitOfficialResponse,
  canReviseOfficialResponse,
  useAuth,
} from "../context/Auth";
import {
  PaperClipIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/20/solid";

const ACCEPTED =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.xls,.xlsx,.csv,.mp4,.mov,.webm," +
  "application/pdf,image/*,video/*," +
  "application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const formatSize = (bytes) => {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

// ── Compact read-only attachment row ─────────────────────────────────────────
const AttachmentRow = ({ att }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-indigo-100 dark:border-indigo-700 bg-white dark:bg-gray-700 px-3 py-2 text-sm">
    <span
      className="truncate text-indigo-900 dark:text-indigo-300 font-medium"
      title={att.original_filename}
    >
      {att.original_filename}
    </span>
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-xs text-indigo-500 dark:text-indigo-400">
        {formatSize(att.size)}
      </span>
      <a
        href={att.file_url}
        target="_blank"
        rel="noreferrer"
        title="Open"
        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
      >
        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
      </a>
      <a
        href={att.file_url}
        download={att.original_filename}
        title="Download"
        className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
      </a>
    </div>
  </div>
);

// ── Single response-history card (collapsed by default for older entries) ─────
const ResponseHistoryCard = ({ revision, isLatest }) => {
  const [open, setOpen] = useState(isLatest);

  return (
    <div
      className={`rounded-md border ${
        isLatest
          ? "border-indigo-300 dark:border-indigo-600"
          : "border-gray-200 dark:border-gray-700"
      } bg-white dark:bg-gray-800`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {isLatest ? (
            <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              Latest
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Response #{revision.response_number}
            </span>
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {revision.responded_by_name || "a project member"}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            · {formatDateTime(revision.responded_at)}
          </span>
          {revision.attachments?.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · {revision.attachments.length} attachment
              {revision.attachments.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDownIcon className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3">
          <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
            {revision.body}
          </p>
          {revision.attachments?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                Attachments ({revision.attachments.length})
              </p>
              {revision.attachments.map((att) => (
                <AttachmentRow key={att.id} att={att} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Submission form (shared by initial submit and revised submit) ─────────────
const ResponseForm = ({ rfiId, isRevision, onSuccess }) => {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = useRef(null);

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...picked.filter((f) => !existing.has(f.name + f.size))];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("body", body.trim());
      files.forEach((f) => fd.append("files", f));
      const { data } = await api.post(`/api/rfis/${rfiId}/official-response/`, fd);
      toast.success(
        isRevision ? "Revised response submitted." : "Official response submitted."
      );
      if (onSuccess) onSuccess(data);
    } catch (err) {
      const responseData = err.response?.data;
      if (responseData?.errors?.length) {
        responseData.errors.forEach((e) => toast.error(`${e.filename}: ${e.error}`));
      } else {
        toast.error(
          responseData?.detail ||
            responseData?.body?.[0] ||
            "Failed to submit response."
        );
      }
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="official-response-panel">
      <textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write the official response…"
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        disabled={submitting}
      />

      {/* File picker */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          onChange={addFiles}
          className="hidden"
          data-testid="official-response-file-input"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
          className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 disabled:text-gray-400 dark:disabled:text-gray-600 transition-colors"
        >
          <PaperClipIcon className="h-4 w-4" />
          Attach files
        </button>
      </div>

      {/* Staged file list */}
      {files.length > 0 && (
        <ul className="space-y-1" data-testid="staged-files">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 text-sm"
            >
              <span className="truncate text-gray-800 dark:text-gray-200">{f.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatSize(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={submitting}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
            >
              {submitting ? "Submitting…" : "Confirm & Submit"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => body.trim() && setConfirming(true)}
            disabled={!body.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
          >
            Submit Response
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
const OfficialResponsePanel = ({ rfi, onUpdated }) => {
  const { role } = useAuth();
  const allowed = canSubmitOfficialResponse(role);
  const canRevise = canReviseOfficialResponse(role);

  const [history, setHistory] = useState(null); // null = not yet fetched
  const [showReviseForm, setShowReviseForm] = useState(false);

  // Fetch full response history whenever the RFI has any response.
  useEffect(() => {
    if (rfi.status === "responded" || rfi.status === "closed") {
      api
        .get(`/api/rfis/${rfi.id}/response-history/`)
        .then(({ data }) => setHistory(data))
        .catch(() => setHistory([]));
    } else {
      setHistory(null);
    }
  }, [rfi.id, rfi.status, rfi.responded_at]);

  // ── Responded / closed state ──────────────────────────────────────────────
  if (rfi.status === "responded" || rfi.status === "closed") {
    const responseAtts = rfi.official_response_attachments || [];
    const hasHistory = history && history.length > 0;

    return (
      <section
        className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 p-5 space-y-4"
        data-testid="official-response-closed"
      >
        <div>
          <h3 className="text-base font-semibold text-indigo-900 dark:text-indigo-200">
            Official Response
          </h3>
        </div>

        {/* Response history (newest first) or legacy single view */}
        {hasHistory ? (
          <div className="space-y-2">
            {history.map((rev, idx) => (
              <ResponseHistoryCard
                key={rev.id}
                revision={rev}
                isLatest={idx === 0}
              />
            ))}
          </div>
        ) : (
          /* Legacy fallback for RFIs created before the response-history feature */
          <div className="space-y-3">
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-400">
              Submitted by {rfi.responded_by_name || "a project member"}
              {rfi.responded_at && (
                <> · {formatDateTime(rfi.responded_at)}</>
              )}
            </p>
            <p className="whitespace-pre-wrap text-sm text-indigo-950 dark:text-indigo-100">
              {rfi.official_response}
            </p>
            {responseAtts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  Attachments ({responseAtts.length})
                </p>
                {responseAtts.map((att) => (
                  <AttachmentRow key={att.id} att={att} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Designer: add a revised response (only when not yet closed) */}
        {canRevise && rfi.status === "responded" && (
          <div className="border-t border-indigo-200 dark:border-indigo-700 pt-4">
            {showReviseForm ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                    Submit Revised Response
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowReviseForm(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">
                  This will add a new response record to the audit history.
                  The requester will still need to close the RFI once reviewed.
                </p>
                <ResponseForm
                  rfiId={rfi.id}
                  isRevision={true}
                  onSuccess={(updated) => {
                    setShowReviseForm(false);
                    if (onUpdated) onUpdated(updated);
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowReviseForm(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 dark:border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition"
                data-testid="revise-response-btn"
              >
                + Submit Revised Response
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  if (!allowed) return null;

  // ── Under-review: initial submission form ─────────────────────────────────
  return (
    <section
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3"
      aria-label="Submit official response"
    >
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Submit Official Response
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Only Project Designers, Sub Consultants, Contract Administrators, and
          Project Managers can submit. The RFI moves to <em>Responded</em>{" "}
          status — the requester can then close it.
        </p>
      </div>
      <ResponseForm
        rfiId={rfi.id}
        isRevision={false}
        onSuccess={(updated) => {
          if (onUpdated) onUpdated(updated);
        }}
      />
    </section>
  );
};

export default OfficialResponsePanel;
