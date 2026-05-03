import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MemberCard from "../components/MemberCard";
import { useAuth } from "../context/Auth";
import toast from "../toast";
import {
  BriefcaseIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  XMarkIcon,
  FolderOpenIcon,
  ShieldCheckIcon,
} from "@heroicons/react/20/solid";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const statusMeta = (rfi) => {
  if (rfi.status === "closed") {
    return {
      label: "Closed",
      icon: <CheckCircleIcon className="h-4 w-4 text-gray-400" />,
      pill: "bg-gray-100 text-gray-600",
    };
  }
  const today = new Date();
  const due = new Date(rfi.due_date);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)
    return {
      label: "Overdue",
      icon: <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />,
      pill: "bg-red-100 text-red-700",
    };
  if (diffDays <= 3)
    return {
      label: "Due soon",
      icon: <ClockIcon className="h-4 w-4 text-yellow-500" />,
      pill: "bg-yellow-100 text-yellow-700",
    };
  return {
    label: "Active",
    icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
    pill: "bg-green-100 text-green-700",
  };
};

const MemberDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { memberId, login, isAuthenticated, username, role, isAdmin } = useAuth();
  const isOwnProfile = isAuthenticated && String(memberId) === String(id);

  const [member, setMember] = useState(null);
  const [rfis, setRfis] = useState([]);
  const [page, setPage] = useState(1);
  const [next, setNext] = useState(null);
  const [prev, setPrev] = useState(null);
  const [count, setCount] = useState(0);
  const [rfiLoading, setRfiLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  // Projects the member is on
  const [projectMemberships, setProjectMemberships] = useState([]);
  const [activeSection, setActiveSection] = useState("rfis"); // "rfis" | "projects"

  // Edit profile state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get(`/api/members/${id}/`)
      .then((res) => setMember(res.data))
      .catch(() => {});
  }, [id]);

  // Fetch the projects this member belongs to
  useEffect(() => {
    api
      .get("/api/memberships/", { params: { member: id } })
      .then(({ data }) => setProjectMemberships(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    setRfiLoading(true);
    api
      .get("/api/rfis/", { params: { assigned_to: id, page } })
      .then((res) => {
        setRfis(res.data.results);
        setNext(res.data.next);
        setPrev(res.data.previous);
        setCount(res.data.count);
      })
      .catch(() => {})
      .finally(() => setRfiLoading(false));
  }, [id, page]);

  const filtered = rfis.filter((rfi) => {
    if (filter === "open") return rfi.status === "open";
    if (filter === "closed") return rfi.status === "closed";
    return true;
  });

  const openEditForm = () => {
    setEditForm({ name: member.name || "", email: member.email || "" });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditErrors({});
    setSaving(true);
    try {
      const res = await api.patch("/api/me/", editForm);
      const updated = res.data.member;
      setMember((prev) => ({
        ...prev,
        name: updated.name,
        email: updated.email,
      }));
      // Sync auth context so the header display name updates immediately
      login({
        access: localStorage.getItem("access"),
        refresh: localStorage.getItem("refresh"),
        username,
        displayName: updated.name,
        memberId,
        role,
        isAdmin,
      });
      toast.success("Profile updated successfully.");
      setEditOpen(false);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        setEditErrors(data);
      } else {
        setEditErrors({
          non_field_errors: ["Failed to save. Please try again."],
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!member) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <Header title="Profile" />
          <p className="text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  const openCount = rfis.filter((r) => r.status === "open").length;
  const closedCount = rfis.filter((r) => r.status === "closed").length;
  const overdueCount = rfis.filter((r) => {
    if (r.status === "closed") return false;
    return new Date(r.due_date) < new Date();
  }).length;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
        <Header title="Profile" />

        {/* Top section: card + summary stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            <MemberCard member={member} />

            {/* Edit button — only visible on your own profile */}
            {isOwnProfile && !editOpen && (
              <button
                onClick={openEditForm}
                className="flex items-center gap-2 w-full justify-center rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/40 px-4 py-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition duration-150"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit Profile
              </button>
            )}

            {/* Inline edit form */}
            {isOwnProfile && editOpen && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Edit Profile
                  </h3>
                  <button
                    onClick={() => setEditOpen(false)}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Cancel"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleEditSave} className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        editErrors.name ? "border-red-400" : "border-gray-300 dark:border-gray-600"
                      }`}
                      placeholder="Jane Smith"
                      required
                    />
                    {editErrors.name && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {Array.isArray(editErrors.name)
                          ? editErrors.name[0]
                          : editErrors.name}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        editErrors.email ? "border-red-400" : "border-gray-300 dark:border-gray-600"
                      }`}
                      placeholder="you@example.com"
                      required
                    />
                    {editErrors.email && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {Array.isArray(editErrors.email)
                          ? editErrors.email[0]
                          : editErrors.email}
                      </p>
                    )}
                  </div>

                  {/* Non-field errors */}
                  {editErrors.non_field_errors && (
                    <p className="text-xs text-red-600">
                      {editErrors.non_field_errors[0]}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition duration-150"
                    >
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditOpen(false)}
                      className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition duration-150"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 grid grid-cols-3 gap-4 content-start">
            {[
              {
                label: "Total Assigned",
                value: count,
                color: "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200",
                icon: <BriefcaseIcon className="h-6 w-6 text-indigo-400" />,
              },
              {
                label: "Open",
                value: openCount,
                color: "bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200",
                icon: <CheckCircleIcon className="h-6 w-6 text-green-400" />,
              },
              {
                label: "Overdue",
                value: overdueCount,
                color: "bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200",
                icon: (
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />
                ),
              },
            ].map(({ label, value, color, icon }) => (
              <div
                key={label}
                className={`rounded-xl p-4 flex flex-col items-center gap-1 ${color}`}
              >
                {icon}
                <span className="text-3xl font-bold">{value}</span>
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabbed section: RFIs | Projects */}
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* Tab header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-3">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveSection("rfis")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  activeSection === "rfis"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <BriefcaseIcon className="h-4 w-4" />
                Assigned RFIs
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  activeSection === "rfis"
                    ? "bg-indigo-500 text-white"
                    : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                }`}>
                  {count}
                </span>
              </button>
              <button
                onClick={() => setActiveSection("projects")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  activeSection === "projects"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <FolderOpenIcon className="h-4 w-4" />
                Projects
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  activeSection === "projects"
                    ? "bg-indigo-500 text-white"
                    : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                }`}>
                  {projectMemberships.length}
                </span>
              </button>
            </div>

            {/* Filter chips — only shown on RFIs tab */}
            {activeSection === "rfis" && (
              <div className="flex gap-2">
                {["all", "open", "closed"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                      filter === f
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── RFIs tab ── */}
          {activeSection === "rfis" && (
            <>
              {rfiLoading ? (
                <p className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">Loading RFIs…</p>
              ) : filtered.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400 italic">
                  No {filter !== "all" ? filter + " " : ""}RFIs assigned to this member.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filtered.map((rfi) => {
                    const { label, icon, pill } = statusMeta(rfi);
                    return (
                      <li
                        key={rfi.id}
                        onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}`)}
                        className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {rfi.rfi_name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {rfi.project_number} · {rfi.project_name} · RFI{" "}
                            {rfi.rfi_number}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                          <span>Due {formatDate(rfi.due_date)}</span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${pill}`}
                          >
                            {icon}
                            {label}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Pagination */}
              {count > 10 && (
                <div className="flex items-center justify-center gap-4 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={!prev}
                    className="px-3 py-1 rounded text-sm disabled:text-gray-300 dark:disabled:text-gray-600 text-indigo-600 dark:text-indigo-400 hover:underline disabled:no-underline"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!next}
                    className="px-3 py-1 rounded text-sm disabled:text-gray-300 dark:disabled:text-gray-600 text-indigo-600 dark:text-indigo-400 hover:underline disabled:no-underline"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Projects tab ── */}
          {activeSection === "projects" && (
            <>
              {projectMemberships.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400 italic">
                  Not assigned to any projects.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {projectMemberships.map((m) => (
                    <li
                      key={m.id}
                      onClick={() => navigate(`/projects/${m.project}`)}
                      className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderOpenIcon className="h-5 w-5 shrink-0 text-indigo-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {m.project_number} – {m.project_name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {m.role}
                            {m.discipline ? ` · ${m.discipline}` : ""}
                            {" · Joined "}
                            {formatDate(m.joined_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.is_project_admin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                            <ShieldCheckIcon className="h-3.5 w-3.5" />
                            Admin
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
};

export default MemberDetail;
