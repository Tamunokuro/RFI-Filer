import { useEffect, useState } from "react";
import api from "../api";
import toast from "../toast";
import { XMarkIcon } from "@heroicons/react/20/solid";

/**
 * ProjectFormModal
 *
 * Modal that creates a new project or edits an existing one.
 *
 * Props
 *   project   – existing project (null for create)
 *   onClose   – called when the user dismisses the modal
 *   onSaved   – called with the saved project payload after success
 */
const ProjectFormModal = ({ project = null, onClose, onSaved }) => {
  const editing = !!project;

  const [number, setNumber]   = useState(project?.project_number || "");
  const [name, setName]       = useState(project?.project_name   || "");
  const [pmId, setPmId]       = useState(project?.project_manager || "");
  const [slaDays, setSlaDays] = useState(project?.sla_days ?? 14);

  const [members, setMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Fetch all members so the user can pick a project manager.
  useEffect(() => {
    api
      .get("/api/members/", { params: { role: "Project Manager" } })
      .then(({ data }) => setMembers(Array.isArray(data) ? data : []))
      .catch(() => setMembers([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (!number.trim() || !name.trim()) {
      setErrors({
        ...(number.trim() ? {} : { project_number: ["Required."] }),
        ...(name.trim() ? {} : { project_name: ["Required."] }),
      });
      return;
    }
    setSaving(true);
    const sla = parseInt(slaDays, 10);
    const payload = {
      project_number:  number.trim(),
      project_name:    name.trim(),
      project_manager: pmId || null,
      sla_days:        Number.isFinite(sla) && sla > 0 ? sla : 14,
    };
    try {
      const { data } = editing
        ? await api.patch(`/api/projects/${project.id}/`, payload)
        : await api.post("/api/projects/", payload);
      toast.success(editing ? "Project updated." : "Project created.");
      if (onSaved) onSaved(data);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        setErrors(data);
      }
      toast.error(data?.detail || (editing ? "Failed to update project." : "Failed to create project."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {editing ? "Edit project" : "New project"}
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

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Project number *
          </label>
          <input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="e.g. P-2026-014"
            disabled={saving}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
          />
          {errors.project_number && (
            <p className="text-xs text-red-600 mt-1">{errors.project_number[0]}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Project name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hospital Wing A"
            disabled={saving}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
          />
          {errors.project_name && (
            <p className="text-xs text-red-600 mt-1">{errors.project_name[0]}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Project manager
          </label>
          <select
            value={pmId || ""}
            onChange={(e) => setPmId(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
          >
            <option value="">— No project manager —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.email})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The PM is automatically added to the project team and granted admin rights.
          </p>
        </div>

        {/* SLA / response time */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            SLA — default response time (days)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="365"
              value={slaDays}
              onChange={(e) => setSlaDays(e.target.value)}
              disabled={saving}
              className="w-24 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">calendar days</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            When creating an RFI, the due date auto-fills as Received + this many days.
          </p>
        </div>

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
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectFormModal;
