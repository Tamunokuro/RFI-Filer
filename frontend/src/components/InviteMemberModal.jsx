import { useState } from "react";
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
 * InviteMemberModal
 *
 * Admin-only modal that creates a new member account and sends a
 * set-password email to the supplied address.
 *
 * Props
 *   onClose  – called when the user dismisses the modal
 *   onInvited – called with the new member object after success
 */
const InviteMemberModal = ({ onClose, onInvited }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [company, setCompany] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [isAdminFlag, setIsAdminFlag] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const { data } = await api.post("/api/members/invite/", {
        name: name.trim(),
        email: email.trim(),
        role,
        company: company.trim() || undefined,
        discipline: discipline || undefined,
        is_admin: isAdminFlag,
      });
      toast.success(`Invitation sent to ${email}.`);
      if (onInvited) onInvited(data.member);
      onClose();
    } catch (err) {
      const errData = err.response?.data;
      if (errData && typeof errData === "object") {
        setErrors(errData);
      }
      toast.error(errData?.detail || "Failed to send invitation.");
    } finally {
      setSaving(false);
    }
  };

  const fieldCls = (key) =>
    `w-full rounded-md border px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
      errors[key]
        ? "border-red-400 dark:border-red-500"
        : "border-gray-300 dark:border-gray-600"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-5 space-y-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Invite new member
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              An email will be sent with a link to set their password.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Full name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
            disabled={saving}
            className={fieldCls("name")}
          />
          {errors.name && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name[0]}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
            disabled={saving}
            className={fieldCls("email")}
          />
          {errors.email && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.email[0]}</p>
          )}
        </div>

        {/* Role + Discipline */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Role *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={saving}
              className={fieldCls("role")}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {errors.role && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.role[0]}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Discipline
            </label>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              disabled={saving}
              className={fieldCls("discipline")}
            >
              <option value="">— None —</option>
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Company */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Company
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="ACME Engineering"
            disabled={saving}
            className={fieldCls("company")}
          />
        </div>

        {/* Admin flag */}
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={isAdminFlag}
            onChange={(e) => setIsAdminFlag(e.target.checked)}
            disabled={saving}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Grant system admin rights
        </label>

        {/* Non-field errors */}
        {errors.non_field_errors && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.non_field_errors[0]}</p>
        )}
        {errors.detail && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.detail}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
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
            {saving ? "Sending invite…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InviteMemberModal;
