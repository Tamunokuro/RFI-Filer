/**
 * EmailReviewModal
 *
 * Opens when a row in the Email Inbox table is clicked.
 *
 * Pending / Error emails  → editable fields + Approve / Reject / Retry buttons
 * Other statuses          → read-only view, link to the created RFI if present
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  XMarkIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  PaperClipIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  EnvelopeIcon,
  UserIcon,
  FolderIcon,
  ChatBubbleBottomCenterTextIcon,
} from "@heroicons/react/20/solid";
import api from "../api";
import toast from "../toast";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRADE_OPTIONS = [
  { value: "M", label: "Mechanical" },
  { value: "E", label: "Electrical" },
  { value: "C", label: "Civil" },
  { value: "S", label: "Structural" },
  { value: "P", label: "Architectural" },
];

const REVIEWABLE_STATUSES = ["pending", "error"];

const STATUS_STYLES = {
  pending:      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  auto_created: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  approved:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  rejected:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  error:        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function Label({ children }) {
  return (
    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="text-sm text-gray-800 dark:text-gray-200">{children}</div>
    </div>
  );
}

function ConfidenceBadge({ score }) {
  const pct = Math.round(score * 100);
  let cls = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (pct >= 85) cls = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  else if (pct >= 65) cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {pct}% confidence
    </span>
  );
}

function SectionHeading({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-indigo-400 dark:text-indigo-500 shrink-0" />
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {children}
      </h3>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export default function EmailReviewModal({ emailId, onClose }) {
  const navigate = useNavigate();

  // Remote data
  const [email, setEmail]       = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Editable form state (pre-filled from parsed fields)
  const [form, setForm] = useState({
    project_id: "",
    rfi_name:   "",
    question:   "",
    trade:      "M",
    due_date:   "",
  });

  // Action state
  const [submitting, setSubmitting]         = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason]     = useState("");

  // ---------------------------------------------------------------------------
  // Fetch email detail + project list
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [emailRes, projectsRes] = await Promise.all([
        api.get(`/api/email/inbound/${emailId}/`),
        api.get("/api/projects/", { params: { page_size: 200 } }),
      ]);
      const e = emailRes.data;
      setEmail(e);
      setProjects(projectsRes.data.results ?? projectsRes.data);
      setForm({
        project_id: e.project_id ?? "",
        rfi_name:   e.parsed_rfi_name ?? "",
        question:   e.parsed_question ?? "",
        trade:      e.parsed_trade || "M",
        due_date:   "",
      });
    } catch {
      setError("Failed to load email details.");
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleApprove = async () => {
    if (!form.project_id) {
      toast.error("Please select a project before approving.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        project_id: Number(form.project_id),
        rfi_name:   form.rfi_name,
        question:   form.question,
        trade:      form.trade,
      };
      if (form.due_date) payload.due_date = form.due_date;

      await api.post(`/api/email/inbound/${emailId}/approve/`, payload);
      toast.success("RFI created successfully.");
      onClose(true);
    } catch (err) {
      toast.error(err.response?.data?.detail ?? "Approval failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await api.post(`/api/email/inbound/${emailId}/reject/`, { reason: rejectReason });
      toast.success("Email rejected.");
      onClose(true);
    } catch {
      toast.error("Rejection failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    setSubmitting(true);
    try {
      // Send the current form values as hints so the matcher uses
      // whatever the reviewer has typed rather than the raw email text.
      const res = await api.post(`/api/email/inbound/${emailId}/retry/`, {
        subject_hint: form.rfi_name.trim(),
        body_hint:    form.question.trim(),
      });

      const { confidence, project_id, project_name, diagnostics } = res.data;
      const pct = Math.round(confidence * 100);
      const nums = diagnostics?.extracted_numbers ?? [];
      const total = diagnostics?.total_projects_in_db ?? 0;

      if (project_name) {
        toast.success(`Matched "${project_name}" — ${pct}% confidence`);
        setForm((f) => ({ ...f, project_id: project_id ?? f.project_id }));
      } else if (nums.length > 0) {
        // Regex found a number but no project matched it
        toast.error(
          `Found number${nums.length > 1 ? "s" : ""} "${nums.join(", ")}" in the text but no project in the database matches. Check your project numbers.`
        );
      } else if (total === 0) {
        toast.error("No projects exist in the database yet. Create a project first.");
      } else {
        toast.error(
          `No project number detected. Try including your exact project number in the RFI Name field (e.g. "RFI – PRJ-001 – Description").`
        );
      }

      // Refresh email detail so match reason + confidence badge update
      fetchData();
    } catch {
      toast.error("Retry failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const isReviewable = email && REVIEWABLE_STATUSES.includes(email.status);
  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={() => onClose(false)}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {loading ? "Loading…" : (email?.subject || "(no subject)")}
            </h2>
            {email && (
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[email.status] ?? ""}`}
                >
                  {email.status_display}
                </span>
                <ConfidenceBadge score={email?.confidence ?? 0} />
              </div>
            )}
          </div>
          <button
            onClick={() => onClose(false)}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {loading && (
            <div className="flex justify-center items-center py-16 text-gray-400 gap-2 text-sm">
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && email && (
            <>
              {/* ── Email metadata ── */}
              <div>
                <SectionHeading icon={EnvelopeIcon}>Email</SectionHeading>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="From">
                    <span className="font-medium">{email.sender_name || "—"}</span>
                    <span className="ml-1 text-gray-400 dark:text-gray-500 text-xs">
                      &lt;{email.sender_email}&gt;
                    </span>
                  </Field>
                  <Field label="Received">{fmtDate(email.received_at)}</Field>
                  <Field label="Fetched at">{fmtDate(email.fetched_at)}</Field>
                  {email.attachment_count > 0 && (
                    <Field label="Attachments">
                      <div className="flex flex-wrap gap-2 mt-1">
                        {email.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            <PaperClipIcon className="h-3.5 w-3.5" />
                            {att.original_filename}
                          </a>
                        ))}
                      </div>
                    </Field>
                  )}
                </div>

                {/* Body */}
                <div className="mt-4">
                  <Label>Body</Label>
                  <div className="mt-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono leading-relaxed">
                    {email.body_text || <span className="italic text-gray-400">(empty)</span>}
                  </div>
                </div>
              </div>

              {/* ── Match result ── */}
              <div>
                <SectionHeading icon={FolderIcon}>Project Match</SectionHeading>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 mr-1">Matched:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {email.project_name
                          ? `${email.project_number} — ${email.project_name}`
                          : "No match"}
                      </span>
                    </div>
                    <ConfidenceBadge score={email.confidence} />
                  </div>
                  {email.match_reason && (
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 italic">
                      {email.match_reason}
                    </p>
                  )}
                </div>
              </div>

              {/* ── If already has an RFI ── */}
              {email.rfi_number && (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      RFI created: {email.rfi_number}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/rfi/${email.rfi_id}/${email.rfi_slug}`)}
                    className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 hover:underline font-medium"
                  >
                    View RFI <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* ── Rejection reason ── */}
              {email.status === "rejected" && email.rejection_reason && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3">
                  <Label>Rejection reason</Label>
                  <p className="text-sm text-red-700 dark:text-red-400">{email.rejection_reason}</p>
                </div>
              )}

              {/* ── Editable RFI fields (pending / error only) ── */}
              {isReviewable && (
                <div>
                  <SectionHeading icon={ChatBubbleBottomCenterTextIcon}>
                    RFI Fields — edit before approving
                  </SectionHeading>

                  <div className="space-y-4">
                    {/* Project picker */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Project <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.project_id}
                        onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                        className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">— Select a project —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.project_number} — {p.project_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* RFI name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        RFI Name
                      </label>
                      <input
                        type="text"
                        value={form.rfi_name}
                        onChange={(e) => setForm((f) => ({ ...f, rfi_name: e.target.value }))}
                        className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Derived from email subject"
                      />
                    </div>

                    {/* Trade + Due date side by side */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Discipline
                        </label>
                        <select
                          value={form.trade}
                          onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))}
                          className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {TRADE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Due Date
                          <span className="ml-1 text-xs text-gray-400 font-normal">(defaults to +14 days)</span>
                        </label>
                        <div className="relative">
                          <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                          <input
                            type="date"
                            value={form.due_date}
                            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Question */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Question
                      </label>
                      <textarea
                        rows={5}
                        value={form.question}
                        onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                        className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                        placeholder="Parsed from email body"
                      />
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && !error && email && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">

            {/* Reject form — replaces normal buttons when active */}
            {isReviewable && showRejectForm ? (
              <div className="px-6 py-4 space-y-3">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Reason for rejection <span className="font-normal text-gray-400">(optional)</span>
                </p>
                <textarea
                  autoFocus
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="block w-full rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  placeholder="e.g. Duplicate, not RFI-related, wrong inbox…"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                    className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
                  >
                    <XCircleIcon className="h-4 w-4" />
                    {submitting ? "Rejecting…" : "Confirm Reject"}
                  </button>
                </div>
              </div>
            ) : (
              /* Normal action buttons */
              <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap">

                {/* Left — secondary actions */}
                <div className="flex gap-2">
                  {isReviewable && (
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={submitting}
                      title="Re-run project matching"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      <ArrowPathIcon className={`h-4 w-4 ${submitting ? "animate-spin" : ""}`} />
                      Retry match
                    </button>
                  )}
                  {isReviewable && (
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(true)}
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                    >
                      <XCircleIcon className="h-4 w-4" />
                      Reject
                    </button>
                  )}
                </div>

                {/* Right — primary action */}
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => onClose(false)}
                    className="px-4 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {isReviewable ? "Cancel" : "Close"}
                  </button>
                  {isReviewable && (
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={submitting || !form.project_id}
                      className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                      {submitting ? "Creating RFI…" : "Approve & Create RFI"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
