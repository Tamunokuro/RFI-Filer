import { useRef, useState } from "react";
import api from "../api";
import toast from "../toast";
import { canSubmitOfficialResponse, useAuth } from "../context/Auth";
import {
  PaperClipIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
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

/** Compact read-only attachment row used in the closed panel. */
const AttachmentRow = ({ att }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-indigo-100 bg-white px-3 py-2 text-sm">
    <span
      className="truncate text-indigo-900 font-medium"
      title={att.original_filename}
    >
      {att.original_filename}
    </span>
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-xs text-indigo-500">{formatSize(att.size)}</span>
      <a
        href={att.file_url}
        target="_blank"
        rel="noreferrer"
        title="Open"
        className="text-indigo-600 hover:text-indigo-800"
      >
        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
      </a>
      <a
        href={att.file_url}
        download={att.original_filename}
        title="Download"
        className="text-indigo-500 hover:text-indigo-700"
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
      </a>
    </div>
  </div>
);

const OfficialResponsePanel = ({ rfi, onClosed }) => {
  const { role } = useAuth();
  const allowed = canSubmitOfficialResponse(role);

  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]); // staged File objects
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = useRef(null);

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...picked.filter((f) => !existing.has(f.name + f.size))];
    });
    // Reset input so the same file can be re-selected if removed and re-added
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

      const { data } = await api.post(
        `/api/rfis/${rfi.id}/official-response/`,
        fd
      );
      toast.success("Official response submitted. RFI closed.");
      if (onClosed) onClosed(data);
    } catch (err) {
      const responseData = err.response?.data;
      if (responseData?.errors?.length) {
        responseData.errors.forEach((e) =>
          toast.error(`${e.filename}: ${e.error}`)
        );
      } else {
        const msg =
          responseData?.detail ||
          responseData?.body?.[0] ||
          "Failed to submit official response.";
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  // ── Closed state ────────────────────────────────────────────────────────────
  if (rfi.status === "closed") {
    const responseAtts = rfi.official_response_attachments || [];
    return (
      <section
        className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-3"
        data-testid="official-response-closed"
      >
        <div>
          <h3 className="text-base font-semibold text-indigo-900">
            Official Response
          </h3>
          <p className="mt-1 text-xs text-indigo-700">
            Submitted by {rfi.responded_by_name || "a project member"}
            {rfi.responded_at && (
              <> · {new Date(rfi.responded_at).toLocaleString()}</>
            )}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-indigo-950">
            {rfi.official_response}
          </p>
        </div>

        {responseAtts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Attachments ({responseAtts.length})
            </p>
            {responseAtts.map((att) => (
              <AttachmentRow key={att.id} att={att} />
            ))}
          </div>
        )}
      </section>
    );
  }

  if (!allowed) return null;

  // ── Open / submit state ─────────────────────────────────────────────────────
  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
      aria-label="Submit official response"
      data-testid="official-response-panel"
    >
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Submit Official Response
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Closes this RFI. Only Project Designers, Contract Administrators, and
          Project Managers can submit.
        </p>
      </div>

      {/* Response body */}
      <textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write the official response…"
        className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 transition-colors"
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
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
            >
              <span className="truncate text-gray-800">{f.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">
                  {formatSize(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={submitting}
                  className="text-gray-400 hover:text-red-500 transition-colors"
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
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
            >
              {submitting ? "Submitting…" : "Confirm & Close RFI"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => body.trim() && setConfirming(true)}
            disabled={!body.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300"
          >
            Submit & Close RFI
          </button>
        )}
      </div>
    </section>
  );
};

export default OfficialResponsePanel;
