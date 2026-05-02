import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "../toast";
import { useAuth } from "../context/Auth";

import Header from "./Header";
import Footer from "./Footer";

import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilSquareIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/20/solid";

const TYPE_LABEL = {
  PCN:   "PCN",
  SI:    "SI",
  CD:    "CD",
  CO:    "CO",
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

const STATUS_ORDER = ["pending", "issued", "cancelled"];
const TYPE_ORDER = ["PCN", "SI", "CD", "CO", "Other"];

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString() : "—";

// ── Inline issue / cancel dialog (modal) ─────────────────────────────────────
const IssueModal = ({ change, onClose, onSaved }) => {
  const [reference, setReference] = useState(change.reference_number || "");
  const [issuedType, setIssuedType] = useState(change.issued_type || change.anticipated_type);
  const [notes, setNotes] = useState(change.notes || "");
  const [saving, setSaving] = useState(false);

  const submit = async (statusValue) => {
    if (statusValue === "issued" && !reference.trim()) {
      toast.error("Reference number is required to mark a change as issued.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch(`/api/contract-changes/${change.id}/`, {
        status: statusValue,
        reference_number: reference.trim(),
        issued_type: issuedType,
        notes: notes.trim(),
      });
      toast.success(
        statusValue === "issued" ? "Marked as issued." : "Marked as cancelled."
      );
      onSaved(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-5 space-y-3 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Update contract change
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Anticipated: {TYPE_LABEL[change.anticipated_type] || change.anticipated_type} · RFI {change.rfi_number || "—"}
        </p>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Reference number
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
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Notes (optional)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm p-2 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => submit("cancelled")}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            <XCircleIcon className="h-4 w-4" />
            Cancel change
          </button>
          <button
            type="button"
            onClick={() => submit("issued")}
            disabled={saving || !reference.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
          >
            <CheckCircleIcon className="h-4 w-4" />
            {saving ? "Saving…" : "Mark issued"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Contract Changes page ───────────────────────────────────────────────
const ContractChanges = () => {
  const { role } = useAuth();
  const canEdit = CONTRACT_CHANGE_EDITOR_ROLES.includes(role);
  const navigate = useNavigate();

  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeChange, setActiveChange] = useState(null);

  const fetchChanges = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/contract-changes/");
      setChanges(data);
      setError("");
    } catch {
      setError("Failed to load contract changes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChanges();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return changes.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.anticipated_type !== typeFilter) return false;
      if (!term) return true;
      const haystack = [
        c.reference_number, c.description, c.notes,
        c.project_number, c.project_name,
        c.rfi_number, c.rfi_name,
        c.created_by_name, c.issued_by_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [changes, search, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    const c = { all: changes.length };
    STATUS_ORDER.forEach((s) => { c[s] = 0; });
    changes.forEach((cc) => { c[cc.status] = (c[cc.status] || 0) + 1; });
    return c;
  }, [changes]);

  const handleUpdate = (updated) => {
    setChanges((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setActiveChange(null);
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export.");
      return;
    }
    const header = [
      "Project Number", "Project Name", "RFI Number", "RFI Name",
      "Anticipated Type", "Issued Type", "Reference", "Status",
      "Description", "Notes",
      "Created By", "Created At", "Issued By", "Issued At",
    ];
    const rows = filtered.map((c) => [
      c.project_number, c.project_name,
      c.rfi_number || "", c.rfi_name || "",
      TYPE_LABEL[c.anticipated_type] || c.anticipated_type,
      c.issued_type ? (TYPE_LABEL[c.issued_type] || c.issued_type) : "",
      c.reference_number || "",
      c.status_display || c.status,
      (c.description || "").replace(/\n/g, " "),
      (c.notes || "").replace(/\n/g, " "),
      c.created_by_name || "", fmtDate(c.created_at),
      c.issued_by_name || "", fmtDate(c.issued_at),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contract-changes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <div className="container mx-auto px-4 py-6">
        <Header title="Contract Changes" />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 mb-4">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search reference, project, RFI, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All statuses ({counts.all})</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label} ({counts[s] || 0})</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All types</option>
              {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading contract changes…</p>
        ) : error ? (
          <p className="text-red-600 dark:text-red-400">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 italic">No contract changes match your filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Reference</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Type</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Project</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">RFI</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Description</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Created</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Issued</th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const meta = STATUS_META[c.status] || STATUS_META.pending;
                  return (
                    <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700 align-top">
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {c.reference_number || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {TYPE_LABEL[c.anticipated_type] || c.anticipated_type}
                        {c.issued_type && c.issued_type !== c.anticipated_type && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {" "}→ {TYPE_LABEL[c.issued_type]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        <div className="font-medium">{c.project_number}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{c.project_name}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {c.rfi_number ? (
                          <button
                            type="button"
                            className="text-indigo-600 dark:text-indigo-400 hover:underline"
                            onClick={() => navigate(`/rfi/${c.rfi}/${c.rfi_slug || ""}`)}
                          >
                            {c.rfi_number}
                          </button>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-xs">
                        <div className="line-clamp-3">{c.description}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                        <div>{c.created_by_name || "—"}</div>
                        <div>{fmtDate(c.created_at)}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                        {c.issued_at ? (
                          <>
                            <div>{c.issued_by_name || "—"}</div>
                            <div>{fmtDate(c.issued_at)}</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {canEdit && c.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => setActiveChange(c)}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-700 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                            Update
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeChange && (
        <IssueModal
          change={activeChange}
          onClose={() => setActiveChange(null)}
          onSaved={handleUpdate}
        />
      )}

      <Footer />
    </div>
  );
};

export default ContractChanges;
