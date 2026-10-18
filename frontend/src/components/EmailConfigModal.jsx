import { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import {
  EnvelopeIcon,
  ServerIcon,
  KeyIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

const PROVIDERS = [
  { value: "gmail",   label: "Gmail" },
  { value: "outlook", label: "Outlook / Microsoft 365" },
  { value: "other",   label: "Other (custom IMAP)" },
];

const IMAP_DEFAULTS = {
  gmail:   { imap_host: "imap.gmail.com",              imap_port: 993 },
  outlook: { imap_host: "outlook.office365.com",       imap_port: 993 },
  other:   { imap_host: "",                            imap_port: 993 },
};

const inputCls =
  "w-full rounded-md border border-gray-300 dark:border-gray-600 " +
  "bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 " +
  "placeholder:text-gray-400 dark:placeholder:text-gray-500 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";

const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

/**
 * Modal for creating or editing an EmailConfig.
 *
 * Props
 * -----
 * config     — existing config object (edit mode) or null (create mode)
 * onSave(data) — called with the form data; should return { ok, errors? }
 * onClose()  — called to dismiss the modal
 */
export default function EmailConfigModal({ config, onSave, onClose }) {
  const isEdit = Boolean(config);

  const [form, setForm] = useState({
    label:               config?.label               ?? "",
    provider:            config?.provider            ?? "gmail",
    imap_host:           config?.imap_host           ?? "imap.gmail.com",
    imap_port:           config?.imap_port           ?? 993,
    username:            config?.username            ?? "",
    password:            "",    // never pre-filled for security
    mailbox:             config?.mailbox             ?? "INBOX",
    is_active:           config?.is_active           ?? true,
    gmail_primary_only:  config?.gmail_primary_only  ?? true,
    auto_create_threshold: config?.auto_create_threshold ?? 0.85,
    subject_format_hint: config?.subject_format_hint ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // Auto-fill IMAP host/port when provider changes
  useEffect(() => {
    const defaults = IMAP_DEFAULTS[form.provider] || IMAP_DEFAULTS.other;
    setForm((prev) => ({
      ...prev,
      imap_host: defaults.imap_host,
      imap_port: defaults.imap_port,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.provider]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});

    // In edit mode, only send password if the user typed something
    const payload = { ...form };
    if (isEdit && !payload.password) {
      delete payload.password;
    }
    payload.imap_port = Number(payload.imap_port);
    payload.auto_create_threshold = Number(payload.auto_create_threshold);

    const result = await onSave(payload);
    setSaving(false);

    if (result.ok) {
      onClose();
    } else {
      setFieldErrors(result.errors || {});
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <EnvelopeIcon className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? "Edit Inbox" : "Add Inbox to Watch"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Label */}
          <div>
            <label className={labelCls}>Friendly Name *</label>
            <input
              type="text"
              name="label"
              value={form.label}
              onChange={handleChange}
              required
              placeholder='e.g. "Project RFI Inbox"'
              className={inputCls}
            />
            {fieldErrors.label && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.label}</p>
            )}
          </div>

          {/* Provider */}
          <div>
            <label className={labelCls}>Email Provider *</label>
            <select
              name="provider"
              value={form.provider}
              onChange={handleChange}
              className={inputCls}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Email address */}
          <div>
            <label className={labelCls}>Email Address *</label>
            <input
              type="email"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
              placeholder="rfi-inbox@company.com"
              className={inputCls}
            />
            {fieldErrors.username && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className={labelCls}>
              {form.provider === "gmail" ? "App Password" : "Password"}
              {isEdit && (
                <span className="ml-1 text-gray-400 font-normal">(leave blank to keep current)</span>
              )}
            </label>
            {form.provider === "gmail" && (
              <div className="flex items-start gap-2 mb-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
                <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                Gmail requires a 16-character <strong>App Password</strong>. Enable 2FA on your Google account, then create an App Password at myaccount.google.com/apppasswords.
              </div>
            )}
            <div className="relative">
              <KeyIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required={!isEdit}
                placeholder={isEdit ? "••••••••••••••••" : "Enter password / app password"}
                className={`${inputCls} pl-9`}
                autoComplete="new-password"
              />
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          {/* IMAP settings — shown for "other" provider or as expandable details */}
          {form.provider === "other" ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>IMAP Host *</label>
                <div className="relative">
                  <ServerIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    name="imap_host"
                    value={form.imap_host}
                    onChange={handleChange}
                    required
                    placeholder="mail.example.com"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Port</label>
                <input
                  type="number"
                  name="imap_port"
                  value={form.imap_port}
                  onChange={handleChange}
                  min={1}
                  max={65535}
                  className={inputCls}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
              IMAP: <span className="font-mono">{form.imap_host}:{form.imap_port}</span> (auto-set for {PROVIDERS.find(p => p.value === form.provider)?.label})
            </p>
          )}

          {/* Mailbox folder */}
          <div>
            <label className={labelCls}>Mailbox / Folder</label>
            <input
              type="text"
              name="mailbox"
              value={form.mailbox}
              onChange={handleChange}
              placeholder="INBOX"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              IMAP folder to monitor, e.g. <span className="font-mono">INBOX</span> or <span className="font-mono">RFIs</span>.
            </p>
          </div>

          {/* Subject format hint */}
          <div>
            <label className={labelCls}>Expected Subject Format</label>
            <input
              type="text"
              name="subject_format_hint"
              value={form.subject_format_hint}
              onChange={handleChange}
              placeholder='e.g. "RFI – {project_number} – {rfi_name}"'
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Optional. Describe the subject pattern so the system can parse it more accurately.
              Use <span className="font-mono">{"{project_number}"}</span>, <span className="font-mono">{"{rfi_name}"}</span>, etc. as placeholders.
            </p>
          </div>

          {/* Auto-create threshold */}
          <div>
            <label className={labelCls}>
              Auto-create Threshold: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{Math.round(form.auto_create_threshold * 100)}%</span>
            </label>
            <input
              type="range"
              name="auto_create_threshold"
              min={0}
              max={1}
              step={0.05}
              value={form.auto_create_threshold}
              onChange={handleChange}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              <span>0% (manual review all)</span>
              <span>100% (auto-create all)</span>
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Emails matched above this confidence score are automatically converted to RFIs.
            </p>
          </div>

          {/* Gmail primary only */}
          {form.provider === "gmail" && (
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="gmail_primary_only"
                name="gmail_primary_only"
                checked={form.gmail_primary_only}
                onChange={handleChange}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <label htmlFor="gmail_primary_only" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Gmail Primary tab only
                </label>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Skip Promotions, Social, and Updates tabs. Recommended for business inboxes.
                </p>
              </div>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              checked={form.is_active}
              onChange={handleChange}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                Active — poll this inbox
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Uncheck to pause polling without deleting the configuration.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Inbox"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
