import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import api from "../api";
import Footer from "./Footer";
import Header from "./Header";
import RfiDiscussion from "./RfiDiscussion";
import OfficialResponsePanel from "./OfficialResponsePanel";
import RfiAttachments from "./RfiAttachments";
import RfiRevisionHistory from "./RfiRevisionHistory";
import ContractChangesPanel from "./ContractChangesPanel";
import { useAuth, canEditRfi } from "../context/Auth";
import toast from "../toast";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

// ── Priority display config ────────────────────────────────────────────────────
const PRIORITY_META = {
  low:      { label: "Low",      cls: "bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300" },
  medium:   { label: "Medium",   cls: "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300" },
  high:     { label: "High",     cls: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300" },
  critical: { label: "Critical", cls: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 animate-pulse" },
};

// ── Status display config ──────────────────────────────────────────────────────
const STATUS_META = {
  open:         { label: "Open",                  cls: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300" },
  submitted:    { label: "Submitted",             cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300" },
  under_review: { label: "Under Review",          cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300" },
  responded:    { label: "Responded",             cls: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300" },
  returned:     { label: "Returned to Submitter", cls: "bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300" },
  closed:       { label: "Closed",               cls: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300" },
};

// The "natural next step" button for each status that has a UI-driven transition.
// under_review → responded is handled by OfficialResponsePanel, not a button here.
const NEXT_STEP = {
  open:      { target: "submitted",    label: "Submit for Review" },
  submitted: { target: "under_review", label: "Mark Under Review" },
  responded: { target: "closed",       label: "Close RFI" },
  returned:  { target: "submitted",    label: "Resubmit for Review" },
};

// ── Audit log — convert action + detail to readable English ──────────────────
function auditDescription(action, detail = {}, actorName = "") {
  const who = actorName || "Someone";
  switch (action) {
    case "created":
      return `${who} created this RFI`;
    case "status_change":
      if (detail.from && detail.to) {
        const from = detail.from.replace(/_/g, " ");
        const to   = detail.to.replace(/_/g, " ");
        return `Status changed from "${from}" to "${to}"`;
      }
      return `${who} changed the status`;
    case "returned":
      return detail.note
        ? `${who} returned this RFI to the submitter — "${detail.note}"`
        : `${who} returned this RFI to the submitter`;
    case "official_response":
      return detail.response_revision
        ? `${who} posted official response (revision ${detail.response_revision})`
        : `${who} posted an official response`;
    case "comment_added":
    case "comment":
      return `${who} added a comment`;
    case "watcher_added":
      return detail.watcher_name
        ? `${detail.watcher_name} was added to the team`
        : `${who} added a team member`;
    case "watcher_removed":
      return detail.watcher_name
        ? `${detail.watcher_name} was removed from the team`
        : `${who} removed a team member`;
    case "escalated":
      return detail.new_priority
        ? `RFI escalated — priority raised to ${detail.new_priority}`
        : `${who} escalated this RFI`;
    case "assigned":
      return detail.assignee
        ? `${detail.assignee} was assigned to this RFI`
        : `${who} updated assignments`;
    default:
      // Graceful fallback: humanise the action key
      return `${who} — ${action.replace(/_/g, " ")}`;
  }
}

// ── Roles that can return an RFI to the submitter ─────────────────────────────
const RETURN_ROLES = new Set([
  "Project Designer", "Sub Consultant", "Contract Administrator", "Project Manager"
]);

// ── Roles that can manage watchers ────────────────────────────────────────────
const WATCHER_MANAGER_ROLES = new Set([
  "Project Manager", "Contract Administrator", "Project Designer", "Sub Consultant"
]);

// ── Collapsible section ───────────────────────────────────────────────────────
function Collapsible({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
      >
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          {title}
          {count != null && (
            <span className="ml-2 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full px-2 py-0.5">
              {count}
            </span>
          )}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-6 pb-5 pt-1">{children}</div>}
    </section>
  );
}

// ── Return-to-submitter modal ─────────────────────────────────────────────────
function ReturnModal({ onConfirm, onCancel, submitting }) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          Return RFI to Submitter
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Explain what clarification or information is needed before this RFI
          can be reviewed. The submitter will be notified.
        </p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={4}
          placeholder="Reason for returning…"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                       text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            disabled={!note.trim() || submitting}
            className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white font-semibold
                       hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Returning…" : "Return RFI"}
          </button>
        </div>
      </div>
    </div>
  );
}

const RfiDetail = () => {
  const { pk } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetCommentId = searchParams.get("comment") ? Number(searchParams.get("comment")) : null;
  const { memberId, role } = useAuth();
  const [rfi, setRfi] = useState(null);
  const [error, setError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Return-to-submitter
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returning, setReturning] = useState(false);

  // Watchers
  const [watchers, setWatchers]         = useState([]);
  const [watchersLoaded, setWatchersLoaded] = useState(false);
  const [addingWatcher, setAddingWatcher]   = useState(false);
  const [watcherSearch, setWatcherSearch]   = useState("");
  const [projectMembers, setProjectMembers] = useState([]);

  // Audit log
  const [auditLog, setAuditLog]           = useState([]);
  const [auditLoaded, setAuditLoaded]     = useState(false);

  const loadRfi = async () => {
    try {
      const { data } = await api.get(`/api/rfis/${pk}/`);
      setRfi(data);
      setError("");
    } catch (err) {
      setError("Failed to load RFI.");
    }
  };

  const loadWatchers = async () => {
    try {
      const { data } = await api.get(`/api/rfis/${pk}/watchers/`);
      setWatchers(data);
      setWatchersLoaded(true);
    } catch { /* silently fail */ }
  };

  const loadAuditLog = async () => {
    try {
      const { data } = await api.get(`/api/rfis/${pk}/audit-log/`);
      setAuditLog(data);
      setAuditLoaded(true);
    } catch { /* silently fail */ }
  };

  useEffect(() => {
    loadRfi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pk]);

  // Load project members for watcher search once we know the project
  useEffect(() => {
    if (!rfi) return;
    api.get(`/api/projects/${rfi.project}/members/`)
      .then(r => setProjectMembers(r.data.map(m => m.member).filter(Boolean)))
      .catch(() => {});
    loadWatchers();
    loadAuditLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfi?.project]);

  const handleReturn = async (note) => {
    setReturning(true);
    try {
      await api.post(`/api/rfis/${rfi.id}/return/`, { note });
      setShowReturnModal(false);
      await loadRfi();
      loadAuditLog();
      toast.success("RFI returned to submitter.");
    } catch (err) {
      toast.error(err.response?.data?.note?.[0] || err.response?.data?.detail || "Failed to return RFI.");
    } finally {
      setReturning(false);
    }
  };

  const handleAddWatcher = async (member) => {
    setAddingWatcher(true);
    try {
      const { data } = await api.post(`/api/rfis/${rfi.id}/watchers/`, { member_id: member.id });
      setWatchers(w => [...w, data]);
      setWatcherSearch("");
      toast.success(`${member.name} is now watching this RFI.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add watcher.");
    } finally {
      setAddingWatcher(false);
    }
  };

  const handleRemoveWatcher = async (watcherMemberId, name) => {
    try {
      await api.delete(`/api/rfis/${rfi.id}/watchers/${watcherMemberId}/`);
      setWatchers(w => w.filter(x => x.member_id !== watcherMemberId));
      toast.success(`${name} removed from watchers.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to remove watcher.");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Header title="RFI" />
          <p className="text-red-500 dark:text-red-400">{error}</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!rfi) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Header title="RFI" />
          <p className="text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  const closed = rfi.status === "closed";
  const editAllowed = canEditRfi(role, rfi.status);
  const statusMeta   = STATUS_META[rfi.status]     ?? { label: rfi.status,    cls: "" };
  const priorityMeta = PRIORITY_META[rfi.priority] ?? PRIORITY_META.medium;
  const nextStep = NEXT_STEP[rfi.status] ?? null;
  const designers = rfi.designers_detail?.map((m) => m.name).join(", ") || "—";
  const contractAdmins = rfi.contract_administrators_detail?.map((m) => m.name).join(", ") || "—";

  const canReturn = rfi.status === "under_review" && RETURN_ROLES.has(role);
  const canManageWatchers = WATCHER_MANAGER_ROLES.has(role);

  // Filter project members for watcher picker — always show available members,
  // narrowed by search text when the user is typing.
  const watcherMemberIds = new Set(watchers.map(w => w.member_id));
  const watcherSuggestions = projectMembers.filter(
    m => !watcherMemberIds.has(m.id) &&
         (watcherSearch.length === 0 ||
          m.name.toLowerCase().includes(watcherSearch.toLowerCase()))
  ).slice(0, 8);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const response = await api.get(`/api/rfis/${pk}/pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      // Trigger the browser's Save dialog so the user gets a local copy.
      // The "View in RFI Filer →" link and the attachment hyperlinks inside
      // the PDF still work after the file is saved and reopened.
      const link = document.createElement("a");
      link.href = url;
      link.download = `${rfi.rfi_number} - ${rfi.rfi_name}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The download is queued synchronously on click, so the blob can be
      // released immediately.
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleTransition = async (newStatus) => {
    setTransitioning(true);
    try {
      await api.post(`/api/rfis/${rfi.id}/transition/`, { status: newStatus });
      await loadRfi();
      toast.success(`Status updated to "${STATUS_META[newStatus]?.label ?? newStatus}".`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update status.");
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {showReturnModal && (
        <ReturnModal
          onConfirm={handleReturn}
          onCancel={() => setShowReturnModal(false)}
          submitting={returning}
        />
      )}

      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
        <Header title={rfi.rfi_number} />

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {rfi.rfi_name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {rfi.project_number} — {rfi.project_name}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Priority badge */}
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${priorityMeta.cls}`}
                data-testid="rfi-priority-badge"
              >
                {priorityMeta.label}
              </span>

              {/* Status badge */}
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.cls}`}
                data-testid="rfi-status-badge"
              >
                {statusMeta.label}
              </span>

              {/* Workflow transition button — shown when a natural next step exists */}
              {nextStep && (
                <button
                  onClick={() => handleTransition(nextStep.target)}
                  disabled={transitioning}
                  data-testid="rfi-transition-btn"
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-300 dark:border-indigo-600
                             px-3 py-1 text-sm font-medium text-indigo-700 dark:text-indigo-300
                             hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                             disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {transitioning ? "Updating…" : `${nextStep.label} →`}
                </button>
              )}

              {/* Return to submitter — only for designers/CAs while under review */}
              {canReturn && (
                <button
                  onClick={() => setShowReturnModal(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300 dark:border-rose-600
                             px-3 py-1 text-sm font-medium text-rose-700 dark:text-rose-300
                             hover:bg-rose-50 dark:hover:bg-rose-900/30 transition"
                >
                  ↩ Return to Submitter
                </button>
              )}

              {/* PDF export */}
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                title="Download as PDF"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600
                           px-3 py-1 text-sm text-gray-700 dark:text-gray-300
                           hover:bg-gray-50 dark:hover:bg-gray-700
                           disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {pdfLoading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10"
                              stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                         stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M9 13h6m-3-3v6" />
                    </svg>
                    Export PDF
                  </>
                )}
              </button>

              {/* Edit — visible only when role + status allow it */}
              {editAllowed && (
                <button
                  onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}/edit`)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {rfi.status === "under_review" ? "Revise →" : "Edit"}
                </button>
              )}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Trade</dt>
              <dd className="text-gray-900 dark:text-gray-100">{rfi.trade || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Received</dt>
              <dd className="text-gray-900 dark:text-gray-100">{formatDate(rfi.received_date)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Due</dt>
              <dd className="text-gray-900 dark:text-gray-100">{formatDate(rfi.due_date)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Project Manager</dt>
              <dd className="text-gray-900 dark:text-gray-100">{rfi.project_manager_name || "—"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-gray-500 dark:text-gray-400">Designers</dt>
              <dd className="text-gray-900 dark:text-gray-100">{designers}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-gray-500 dark:text-gray-400">Contract Administrators</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contractAdmins}</dd>
            </div>
            {rfi.question && (
              <div className="md:col-span-4">
                <dt className="text-gray-500 dark:text-gray-400">Question</dt>
                <dd className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                  {rfi.question}
                </dd>
              </div>
            )}
            {rfi.proposed_solution && (
              <div className="md:col-span-4">
                <dt className="text-gray-500 dark:text-gray-400">Proposed Solution</dt>
                <dd className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                  {rfi.proposed_solution}
                </dd>
              </div>
            )}
          </dl>

          {/* ── Return note banner ───────────────────────────────────────────── */}
          {rfi.status === "returned" && rfi.return_note && (
            <div className="mt-5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-rose-500 dark:text-rose-400 mb-1">
                ↩ Returned to Submitter — Action Required
              </p>
              <p className="text-sm text-rose-800 dark:text-rose-300 whitespace-pre-wrap">
                {rfi.return_note}
              </p>
            </div>
          )}

          {/* ── Revision lineage ─────────────────────────────────────────────── */}
          {(rfi.parent_rfi || (rfi.child_rfis && rfi.child_rfis.length > 0)) && (
            <div className="mt-4 space-y-2">
              {/* This RFI supersedes a parent */}
              {rfi.parent_rfi && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Supersedes:</span>
                  <Link
                    to={`/rfi/${rfi.parent_rfi}/${rfi.parent_rfi_slug}`}
                    className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 dark:bg-indigo-900/40
                               border border-indigo-200 dark:border-indigo-700
                               text-indigo-700 dark:text-indigo-300 rounded-full px-3 py-1
                               hover:bg-indigo-100 dark:hover:bg-indigo-800/60 transition"
                  >
                    ← {rfi.parent_rfi_number}{rfi.parent_rfi_name ? `: ${rfi.parent_rfi_name}` : ""}
                  </Link>
                </div>
              )}
              {/* Child revisions of this RFI */}
              {rfi.child_rfis && rfi.child_rfis.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Revised by:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {rfi.child_rfis.map(child => (
                      <Link
                        key={child.id}
                        to={`/rfi/${child.id}/${child.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/30
                                   border border-amber-200 dark:border-amber-700
                                   text-amber-700 dark:text-amber-300 rounded-full px-3 py-1
                                   hover:bg-amber-100 dark:hover:bg-amber-800/50 transition"
                      >
                        {child.rfi_number} →
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── References callout — only rendered when at least one field is set ── */}
          {(rfi.drawing_number || rfi.spec_section) && (
            <div className="mt-5 rounded-lg border border-indigo-100 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">
                References
              </p>
              <div className="flex flex-wrap gap-6">
                {/* Drawing reference */}
                {rfi.drawing_number && (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 dark:bg-indigo-900/60">
                      <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Drawing</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {rfi.drawing_number}
                        {rfi.drawing_revision && (
                          <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
                            {rfi.drawing_revision}
                          </span>
                        )}
                      </p>
                      {rfi.drawing_title && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rfi.drawing_title}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Divider when both are present */}
                {rfi.drawing_number && rfi.spec_section && (
                  <div className="hidden sm:block w-px self-stretch bg-indigo-200 dark:bg-indigo-800" />
                )}

                {/* Spec section reference */}
                {rfi.spec_section && (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 dark:bg-indigo-900/60">
                      <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Specification</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {rfi.spec_section}
                      </p>
                      {rfi.spec_section_title && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rfi.spec_section_title}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Revision history — only visible when revisions exist */}
        <RfiRevisionHistory rfiId={rfi.id} />

        <RfiAttachments
          rfiId={rfi.id}
          currentMemberId={memberId}
          isClosed={closed}
        />

        <OfficialResponsePanel rfi={rfi} onUpdated={(updated) => setRfi(updated)} />

        {/* Contract Changes — only renders when this RFI has any */}
        <ContractChangesPanel rfiId={rfi.id} hideWhenEmpty />

        {/* ── Team ─────────────────────────────────────────────────────────── */}
        <Collapsible title="Team" count={watchers.length}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Team members receive email notifications for all activity on this RFI.
          </p>

          {/* Watcher list */}
          {watchers.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic mb-4">No team members added yet.</p>
          ) : (
            <ul className="space-y-2 mb-5">
              {watchers.map(w => {
                const initials = w.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                const canRemove = (canManageWatchers || w.member_id === memberId) && !closed;
                return (
                  <li key={w.id}
                    className="flex items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-700/50
                               border border-gray-100 dark:border-gray-700 px-3 py-2"
                  >
                    {/* Avatar */}
                    <span className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50
                                     text-indigo-700 dark:text-indigo-300 flex items-center justify-center
                                     text-xs font-bold">
                      {initials}
                    </span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{w.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {w.role}{w.company ? ` · ${w.company}` : ""}
                      </p>
                    </div>
                    {/* Remove × */}
                    {canRemove && (
                      <button
                        onClick={() => handleRemoveWatcher(w.member_id, w.name)}
                        title={`Remove ${w.name}`}
                        className="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center
                                   text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30
                                   transition"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add watcher — search box + dropdown */}
          {canManageWatchers && !closed && (
            <div className="relative">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                Add team member
              </label>
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <input
                  type="text"
                  value={watcherSearch}
                  onChange={e => setWatcherSearch(e.target.value)}
                  placeholder="Type a name to search…"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                             pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Available members — always visible, filtered by search text */}
              {watcherSuggestions.length === 0 && watcherSearch.length > 0 ? (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic pl-1">
                  No matching members found.
                </p>
              ) : watcherSuggestions.length === 0 ? (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic pl-1">
                  All project members are already on the team.
                </p>
              ) : (
                <ul className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-600
                               bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700
                               overflow-hidden shadow-sm">
                  {watcherSuggestions.map(m => {
                    const ini = m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => handleAddWatcher(m)}
                          disabled={addingWatcher}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left
                                     hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                                     disabled:opacity-50 transition"
                        >
                          <span className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50
                                           text-indigo-700 dark:text-indigo-300 flex items-center justify-center
                                           text-xs font-bold">
                            {ini}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{m.role}</p>
                          </div>
                          <span className="ml-auto text-xs bg-indigo-50 dark:bg-indigo-900/50
                                           text-indigo-600 dark:text-indigo-400 font-semibold
                                           rounded-full px-2.5 py-0.5 flex-shrink-0">
                            + Add
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Collapsible>

        {/* ── Audit Log ─────────────────────────────────────────────────────── */}
        <Collapsible title="Audit Log" count={auditLog.length}>
          {!auditLoaded ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : auditLog.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No audit entries yet.</p>
          ) : (
            <ol className="space-y-0">
              {auditLog.map((entry, idx) => {
                const ts   = new Date(entry.timestamp);
                const date = ts.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const time = ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                const desc = auditDescription(entry.action, entry.detail, entry.actor_name);
                const isLast = idx === auditLog.length - 1;
                return (
                  <li key={entry.id} className="flex gap-3">
                    {/* Thread line + dot */}
                    <div className="flex flex-col items-center">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                      {!isLast && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />}
                    </div>
                    {/* Content */}
                    <div className={`pb-3 min-w-0 ${isLast ? "" : ""}`}>
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                        {desc}
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {date} · {time}
                        </span>
                      </p>
                      {entry.actor_role && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {entry.actor_name} · {entry.actor_role}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Collapsible>

        <RfiDiscussion
          rfiId={rfi.id}
          projectId={rfi.project}
          targetCommentId={targetCommentId}
          isClosed={closed}
          onActivity={() => { loadAuditLog(); }}
        />
      </div>
      <Footer />
    </div>
  );
};

export default RfiDetail;
