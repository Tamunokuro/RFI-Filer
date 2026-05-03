import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "../toast";
import ProjectMemberPicker from "./ProjectMemberPicker";
import {
  PlusIcon,
  TrashIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/20/solid";

/**
 * ProjectMembersTab
 *
 * Lists every member on a project and lets admins / project admins:
 *   - add new members
 *   - remove members
 *   - toggle the project_admin flag on a membership
 *
 * Props
 *   projectId – the project's primary key
 *   canManage – boolean, whether the viewer is allowed to mutate the team
 */
const ProjectMembersTab = ({ projectId, canManage }) => {
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/projects/${projectId}/members/`);
      setMemberships(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("Failed to load members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const remove = async (membership) => {
    if (!confirm(`Remove ${membership.member?.name || "this member"} from the project?`)) {
      return;
    }
    try {
      await api.delete(`/api/projects/${projectId}/members/${membership.member.id}/`);
      toast.success("Member removed.");
      setMemberships((prev) => prev.filter((m) => m.id !== membership.id));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to remove member.");
    }
  };

  const toggleAdmin = async (membership) => {
    try {
      const { data } = await api.patch(
        `/api/projects/${projectId}/members/${membership.member.id}/`,
        { is_project_admin: !membership.is_project_admin }
      );
      toast.success(
        data.is_project_admin
          ? "Member promoted to project admin."
          : "Project admin rights removed."
      );
      setMemberships((prev) => prev.map((m) => (m.id === membership.id ? data : m)));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update role.");
    }
  };

  const onAdded = (newMembership) => {
    setMemberships((prev) => [...prev, newMembership]);
    setPicking(false);
  };

  return (
    <div className="space-y-3" data-testid="project-members-tab">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {memberships.length} member{memberships.length === 1 ? "" : "s"} on this project.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add member
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading members…</p>
      ) : error ? (
        <p className="text-red-600 dark:text-red-400">{error}</p>
      ) : memberships.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 italic">No members on this project yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Email</th>
                <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Role</th>
                <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Discipline</th>
                <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Project Admin</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/members/${m.member.id}`)}
                      className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {m.member.name}
                    </button>
                    {m.member.company && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{m.member.company}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m.member.email}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m.role}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m.discipline || "—"}</td>
                  <td className="px-3 py-2">
                    {m.is_project_admin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        <ShieldCheckIcon className="h-3.5 w-3.5" /> Yes
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">No</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => toggleAdmin(m)}
                          title={m.is_project_admin ? "Revoke project admin" : "Promote to project admin"}
                          className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 p-1"
                        >
                          {m.is_project_admin ? (
                            <ShieldExclamationIcon className="h-4 w-4" />
                          ) : (
                            <ShieldCheckIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(m)}
                          title="Remove from project"
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking && (
        <ProjectMemberPicker
          projectId={projectId}
          existingMemberIds={memberships.map((m) => m.member?.id).filter(Boolean)}
          onClose={() => setPicking(false)}
          onAdded={onAdded}
        />
      )}
    </div>
  );
};

export default ProjectMembersTab;
