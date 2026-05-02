import { useEffect, useState } from "react";
import api from "../api";
import toast from "../toast";
import { useAuth } from "../context/Auth";
import { ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon, PencilSquareIcon } from "@heroicons/react/20/solid";

const TYPE_LABEL = {
  PCN:   "Project Change Notice (PCN)",
  SI:    "Site Instruction (SI)",
  CD:    "Change Directive (CD)",
  CO:    "Change Order (CO)",
  Other: "Other",
};

const STATUS_META = {
  pending:   { label: "Pending",   cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300" },
  issued:    { label: "Issued",    cls: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300" },
  cancelled: { label: "Cancelled", cls: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400" },
};

const CONTRACT_CHANGE_EDITOR_ROLES = [
  "Project Designer",
  "Sub Consultant",
  "Contract Administrator",
  "Project Manager",
];

const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

// ── Single contract-change card ──────────────────────────────────────────────
const ContractChangeCard = ({ change, canEdit, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [reference, setReference] = useState(change.reference_number || "");
  const [issuedType, setIssuedType] = useState(change.issued_type || change.anticipated_type);
  const [notes, setNotes] = useState(change.notes || "");
  const [saving, setSaving] = useState(false);

  const meta = STATUS_META[change.status] || STATUS_META.pending;

  const markIssued = async () => {
    if (!reference.trim()) {
      toast.error("Reference number is required to mark a change as issued.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch(`/api/contract-changes/${change.id}/`, {
        status: "issued",
        reference_number: reference.trim(),
        issued_type: issuedType,
        notes: notes.trim(),
      });
      toast.success(`Marked ${data.reference_number} as issued.`);
      setEditing(false);
      if (onUpdate) onUpdate(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update contract change.");
    } finally {
      setSaving(false);
    }
  };

  const cancelChange = async () => {
    if (!confirm("Cancel this contract change? It will no longer block RFI closure.")) return;
    setSaving(true);
    try {
      const { data } = await api.patch(`/api/contract-changes/${change.id}/`, {
        status: "cancelled",
        notes: notes.trim() || change.notes || "",
      });
      toast.success("Contract change cancelled.");
      setEditing(false);
      if (onUpdate) onUpdate(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to cancel.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
            {meta.label}
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {change.reference_number || `Anticipated: ${TYPE_LABEL[change.anticipated_type] || change.anticipated_type}`}
          </span>
          {change.issued_type && change.issued_type !== change.anticipated_type && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (issued as {TYPE_LABEL[change.issued_type]})
            </span>
          )}
        </div>
        {canEdit && change.status === "pending" && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-700 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
            Update
          </button>
        )}
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
        {change.description}
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>Created by {change.created_by_name || "—"} · {formatDateTime(change.created_at)}</span>
        {change.issued_at && (
          <span>Issued by {change.issued_by_name || "—"} · {formatDateTime(change.issued_at)}</span>
        )}
        {change.rfi_number && (
          <span>RFI {change.rfi_number}</span>
        )}
      </div>

      {change.notes && !editing && (
        <p className="text-xs italic text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
          Notes: {change.notes}
        </p>
      )}

      {editing && (
        <div className="border-t border-amber-200 dark:border-amber-700 pt-3 space-y-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Reference number *
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. PCN-007"
              disabled={saving}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Issued document type
            </label>
            <select
              value={issuedType}
              onChange={(e) => setIssuedType(e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
            >
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context…"
              disabled={saving}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm p-2 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={cancelChange}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              <XCircleIcon className="h-3.5 w-3.5" />
              Cancel change
            </button>
            <button
              type="button"
              onClick={markIssued}
              disabled={saving || !reference.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
            >
              <CheckCircleIcon className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Mark issued"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main panel ───────────────────────────────────────────────────────────────
/**
 * ContractChangesPanel
 *
 * Lists contract changes scoped to either an RFI (rfiId) or a project
 * (projectId).  When neither is provided the panel renders nothing.
 *
 * Re-fetches whenever ``refreshKey`` changes so a parent can force a reload
 * after creating a new change.
 */
const ContractChangesPanel = ({ rfiId, projectId, refreshKey, hideWhenEmpty = false }) => {
  const { role } = useAuth();
  const canEdit = CONTRACT_CHANGE_EDITOR_ROLES.includes(role);
  const [changes, setChanges] = useState(null); // null = loading
  const [error, setError] = useState("");

  useEffect(() => {
    if (!rfiId && !projectId) {
      setChanges([]);
      return;
    }
    const params = rfiId ? `rfi=${rfiId}` : `project=${projectId}`;
    api
      .get(`/api/contract-changes/?${params}`)
      .then(({ data }) => {
        // Defensive: API should return an array, but if not, treat it as empty.
        setChanges(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch(() => {
        setChanges([]);
        setError("Failed to load contract changes.");
      });
  }, [rfiId, projectId, refreshKey]);

  const handleUpdate = (updated) => {
    setChanges((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)));
  };

  if (changes === null) return null;
  if (hideWhenEmpty && changes.length === 0) return null;

  const pendingCount = changes.filter((c) => c.status === "pending").length;

  return (
    <section
      className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10 p-5 space-y-3"
      data-testid="contract-changes-panel"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
            Contract Changes
          </h3>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-200 dark:bg-amber-800 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-100">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {changes.length === 0 ? (
        <p className="text-sm text-amber-800 dark:text-amber-300 italic">
          No contract changes recorded.
        </p>
      ) : (
        <div className="space-y-2">
          {changes.map((c) => (
            <ContractChangeCard
              key={c.id}
              change={c}
              canEdit={canEdit}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default ContractChangesPanel;
