import { useEffect, useState } from "react";
import api from "../api";
import toast from "../toast";
import { XMarkIcon } from "@heroicons/react/20/solid";

const ROLES = [
  "Project Manager",
  "Project Designer",
  "Sub Consultant",
  "Contract Administrator",
  "Contractor",
  "Client",
];

const DISCIPLINES = ["Electrical", "Mechanical", "Civil", "Structural", "Architectural"];

/**
 * ProjectMemberPicker
 *
 * Modal for adding an existing member to a project.
 * - Fetches all members; excludes those already on the project.
 * - Lets the user override the role and discipline + flag the member as a
 *   project admin.
 */
const ProjectMemberPicker = ({ projectId, existingMemberIds = [], onClose, onAdded }) => {
  const [allMembers, setAllMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [role, setRole] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [isProjectAdmin, setIsProjectAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/api/members/")
      .then(({ data }) => setAllMembers(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load members."));
  }, []);

  const term = search.trim().toLowerCase();
  const eligible = allMembers
    .filter((m) => !existingMemberIds.includes(m.id))
    .filter((m) =>
      !term ||
      [m.name, m.email, m.company, m.role].filter(Boolean).join(" ").toLowerCase().includes(term)
    );

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedId) {
      toast.error("Please choose a member.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post(`/api/projects/${projectId}/members/`, {
        member_id: selectedId,
        role: role || undefined,
        discipline: discipline || undefined,
        is_project_admin: isProjectAdmin,
      });
      toast.success("Member added to project.");
      if (onAdded) onAdded(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add member.");
    } finally {
      setSaving(false);
    }
  };

  // When the user picks a member, default role/discipline to that member's profile.
  const handlePick = (m) => {
    setSelectedId(m.id);
    setRole(m.role || "");
    setDiscipline(m.discipline || "");
  };

  const selectedMember = allMembers.find((m) => m.id === Number(selectedId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Add member to project
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <input
          type="text"
          placeholder="Search members by name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
        />

        <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
          {eligible.length === 0 ? (
            <p className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">
              No matching members.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {eligible.slice(0, 50).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(m)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 ${
                      Number(selectedId) === m.id ? "bg-indigo-100 dark:bg-indigo-900/40" : ""
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">{m.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {m.email} · {m.role}
                      {m.company ? ` · ${m.company}` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedMember && (
          <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Role on this project
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Discipline
                </label>
                <select
                  value={discipline}
                  onChange={(e) => setDiscipline(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
                >
                  <option value="">— None —</option>
                  {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={isProjectAdmin}
                onChange={(e) => setIsProjectAdmin(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Grant project admin (can manage team and edit project)
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !selectedId}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
          >
            {saving ? "Adding…" : "Add to project"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectMemberPicker;
