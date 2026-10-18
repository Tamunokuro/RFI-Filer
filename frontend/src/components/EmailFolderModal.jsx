import { useState } from "react";
import { XMarkIcon, PlusIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { FolderIcon } from "@heroicons/react/24/outline";

const COLORS = [
  { value: "indigo",  label: "Indigo",  cls: "bg-indigo-500"  },
  { value: "blue",    label: "Blue",    cls: "bg-blue-500"    },
  { value: "green",   label: "Green",   cls: "bg-green-500"   },
  { value: "amber",   label: "Amber",   cls: "bg-amber-500"   },
  { value: "red",     label: "Red",     cls: "bg-red-500"     },
  { value: "purple",  label: "Purple",  cls: "bg-purple-500"  },
  { value: "gray",    label: "Gray",    cls: "bg-gray-500"    },
];

const inputCls =
  "w-full rounded-md border border-gray-300 dark:border-gray-600 " +
  "bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 " +
  "placeholder:text-gray-400 dark:placeholder:text-gray-500 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";

const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

/**
 * Modal for creating or editing an EmailFolder.
 *
 * Props
 * -----
 * folder     — existing folder object (edit mode) or null (create mode)
 * onSave(data) — called with the form data; returns { ok, errors? }
 * onClose()  — called to dismiss the modal
 */
export default function EmailFolderModal({ folder, onSave, onClose }) {
  const isEdit = Boolean(folder);

  const [name, setName]               = useState(folder?.name        ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [color, setColor]             = useState(folder?.color       ?? "indigo");
  const [keywords, setKeywords]       = useState(folder?.keywords    ?? []);
  const [kwInput, setKwInput]         = useState("");
  const [saving, setSaving]           = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const addKeyword = () => {
    const kw = kwInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords((prev) => [...prev, kw]);
    }
    setKwInput("");
  };

  const removeKeyword = (kw) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const handleKwKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    const result = await onSave({ name, description, color, keywords });
    setSaving(false);
    if (result.ok) {
      onClose();
    } else {
      setFieldErrors(result.errors || {});
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <FolderIcon className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? "Edit Folder" : "New Folder"}
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Folder Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder='e.g. "Asana Notifications"'
              className={inputCls}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — shown as a tooltip"
              className={inputCls}
            />
          </div>

          {/* Color */}
          <div>
            <label className={labelCls}>Colour</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={`h-7 w-7 rounded-full ${c.cls} transition-all ${
                    color === c.value
                      ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110"
                      : "opacity-60 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div>
            <label className={labelCls}>Auto-file Keywords</label>
            <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
              If any keyword appears in the sender domain or email subject, the email is automatically filed here.
              Press <kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">Enter</kbd> or <kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">,</kbd> to add.
            </p>
            {/* Existing keyword chips */}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium px-2.5 py-0.5"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className="ml-0.5 text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors"
                    >
                      <XCircleIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={handleKwKeyDown}
                placeholder="asana.com, jira, monday…"
                className={inputCls}
              />
              <button
                type="button"
                onClick={addKeyword}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add
              </button>
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
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Folder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
