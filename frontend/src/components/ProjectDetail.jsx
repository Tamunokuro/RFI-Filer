import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";
import toast from "../toast";

import Header from "./Header";
import Footer from "./Footer";
import AssigneeAvatars from "./AssigneeAvatars";
import ContractChangesPanel from "./ContractChangesPanel";
import ProjectMembersTab from "./ProjectMembersTab";
import ProjectFormModal from "./ProjectFormModal";

import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
} from "@heroicons/react/20/solid";
import { exportProjectReportToExcel } from "../utils/exportProjectReportToExcel";
import { useAuth } from "../context/Auth";

const STATUS_META = {
  open:         { label: "Open",         cls: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300" },
  submitted:    { label: "Submitted",    cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300" },
  under_review: { label: "Under Review", cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300" },
  responded:    { label: "Responded",    cls: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300" },
  closed:       { label: "Closed",       cls: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300" },
};

const isOverdue = (rfi) =>
  rfi.due_date && rfi.status !== "closed" && new Date(rfi.due_date) < new Date();

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

// ── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "active", label: "Active RFIs" },
  { id: "closed", label: "Closed RFIs" },
  { id: "changes", label: "Contract Changes" },
  { id: "members", label: "Team" },
];

const ProjectDetail = () => {
  const { pk } = useParams();
  const navigate = useNavigate();
  const { memberId, role } = useAuth();

  const [project, setProject] = useState(null);
  const [contractChanges, setContractChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [memberships, setMemberships] = useState([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [projResp, ccResp, memResp] = await Promise.all([
        api.get(`/api/projects/${pk}/`),
        api.get(`/api/contract-changes/?project=${pk}`),
        api.get(`/api/projects/${pk}/members/`),
      ]);
      setProject(projResp.data);
      setContractChanges(Array.isArray(ccResp.data) ? ccResp.data : []);
      setMemberships(Array.isArray(memResp.data) ? memResp.data : []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pk]);

  // Permission helper — admin or PM or project_admin can manage this project.
  // We approximate by checking project_manager_id and the membership rows we
  // already loaded; backend remains the source of truth.
  const myMembership = memberships.find((m) => String(m.member?.id) === String(memberId));
  const canManage =
    project &&
    (
      (myMembership && myMembership.is_project_admin) ||
      String(project.project_manager) === String(memberId) ||
      role === "Project Manager" || // backend may still reject if not on project; UI hint only
      role === "Contract Administrator"
    );

  const allRfis = project?.rfis || [];
  const activeRfis = useMemo(
    () => allRfis.filter((r) => r.status !== "closed"),
    [allRfis]
  );
  const closedRfis = useMemo(
    () => allRfis.filter((r) => r.status === "closed"),
    [allRfis]
  );

  // Apply search to whichever list is active.
  const filteredRfis = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = activeTab === "closed" ? closedRfis : activeRfis;
    if (!term) return list;
    return list.filter((r) => {
      const haystack = [
        r.rfi_number, r.rfi_name, r.trade,
        ...(r.designers_detail || []).map((m) => m.name),
        ...(r.contract_administrators_detail || []).map((m) => m.name),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [activeTab, activeRfis, closedRfis, search]);

  const filteredChanges = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contractChanges;
    return contractChanges.filter((c) =>
      [
        c.reference_number, c.description, c.notes,
        c.rfi_number, c.rfi_name,
        c.created_by_name, c.issued_by_name,
      ].filter(Boolean).join(" ").toLowerCase().includes(term)
    );
  }, [contractChanges, search]);

  const handleExport = async () => {
    if (!project) return;
    setExporting(true);
    try {
      await exportProjectReportToExcel(project, allRfis, contractChanges);
      toast.success("Report downloaded.");
    } catch (err) {
      toast.error("Failed to generate report.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4 py-6">
          <Header title="Project" />
          <p className="text-gray-500 dark:text-gray-400 mt-4">Loading project…</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
        <div className="container mx-auto px-4 py-6">
          <Header title="Project" />
          <p className="text-red-600 dark:text-red-400 mt-4">{error || "Project not found."}</p>
        </div>
        <Footer />
      </div>
    );
  }

  const tabCounts = {
    active: activeRfis.length,
    closed: closedRfis.length,
    changes: contractChanges.length,
    members: memberships.length,
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <div className="container mx-auto px-4 py-6 space-y-5">
        <Header title={project.project_number} />

        {/* Project summary card */}
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 mb-1"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" /> All projects
              </button>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {project.project_name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {project.project_number} · PM: {project.project_manager_name || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canManage && (
                <button
                  type="button"
                  onClick={() => setEditingProject(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  data-testid="edit-project-btn"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  Edit project
                </button>
              )}
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {exporting ? "Generating…" : "Export Project Report"}
              </button>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Total RFIs</dt>
              <dd className="text-gray-900 dark:text-gray-100 font-semibold">{allRfis.length}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Active</dt>
              <dd className="text-gray-900 dark:text-gray-100 font-semibold">{activeRfis.length}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Closed</dt>
              <dd className="text-gray-900 dark:text-gray-100 font-semibold">{closedRfis.length}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Contract Changes</dt>
              <dd className="text-gray-900 dark:text-gray-100 font-semibold">{contractChanges.length}</dd>
            </div>
          </dl>
        </section>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-1 -mb-px" aria-label="Tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                data-testid={`tab-${t.id}`}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                  activeTab === t.id
                    ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {t.label}
                <span className="ml-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">
                  {tabCounts[t.id]}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Search bar — hidden on the team tab (tab has its own controls) */}
        {activeTab !== "members" && (
          <div className="relative max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={
                activeTab === "changes"
                  ? "Search contract changes…"
                  : "Search RFI number, name, designer…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            />
          </div>
        )}

        {/* Tab content */}
        {activeTab === "members" ? (
          <ProjectMembersTab projectId={project.id} canManage={!!canManage} />
        ) : activeTab === "changes" ? (
          <ContractChangesPanel projectId={project.id} />
        ) : (
          <div className="space-y-2">
            {filteredRfis.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 italic">
                No {activeTab === "closed" ? "closed" : "active"} RFIs match your search.
              </p>
            ) : (
              filteredRfis.map((rfi) => {
                const meta = STATUS_META[rfi.status] || { label: rfi.status, cls: "" };
                return (
                  <button
                    type="button"
                    key={rfi.id}
                    onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}`)}
                    className={`w-full text-left p-3 rounded border shadow-sm transition ${
                      isOverdue(rfi)
                        ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                        : rfi.status === "closed"
                        ? "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {rfi.rfi_number}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300 truncate">
                            {rfi.rfi_name}
                          </span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span>Trade: {rfi.trade || "—"}</span>
                          <span>Received: {fmtDate(rfi.received_date)}</span>
                          <span>Due: {fmtDate(rfi.due_date)}</span>
                          {isOverdue(rfi) && (
                            <span className="text-red-600 dark:text-red-400 font-semibold">⚠️ Overdue</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-xs">
                          <span className="text-gray-500 dark:text-gray-400 shrink-0">Team:</span>
                          <AssigneeAvatars
                            members={[
                              ...(rfi.designers_detail || []),
                              ...(rfi.contract_administrators_detail || []),
                            ]}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {editingProject && (
        <ProjectFormModal
          project={project}
          onClose={() => setEditingProject(false)}
          onSaved={(updated) => {
            setEditingProject(false);
            setProject(updated);
          }}
        />
      )}

      <Footer />
    </div>
  );
};

export default ProjectDetail;
