/**
 * AssigneePicker
 *
 * Custom multi-select for project members.
 * - Selected members appear as chips: [avatar with initials] [name] [× on hover]
 * - Clicking the container opens a dropdown listing unselected members,
 *   each showing the same avatar + name + role.
 * - Avatar gradient matches the profile section (from-blue-900 to-indigo-700).
 *
 * Props:
 *   members  – array of { id, name, role? } from the project
 *   value    – array of selected member IDs
 *   onChange – (newIds: number[]) => void
 */

import { useState, useRef, useEffect } from "react";
import { XMarkIcon, ChevronDownIcon, UserGroupIcon } from "@heroicons/react/20/solid";

// ── Helpers ───────────────────────────────────────────────────────────────────

const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, className = "h-7 w-7 text-xs" }) {
  return (
    <span
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-blue-900 to-indigo-700 text-white font-bold uppercase shrink-0 ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AssigneePicker({ members = [], value = [], onChange, emptyMessage }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected   = members.filter((m) => value.includes(m.id));
  const available  = members.filter((m) => !value.includes(m.id));

  const add    = (id) => onChange([...value, id]);
  const remove = (id) => onChange(value.filter((v) => v !== id));

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger box ──────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
        className="min-h-[2.75rem] flex flex-wrap items-center gap-2 px-3 py-2 rounded-md bg-white dark:bg-gray-700
                   outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 cursor-pointer
                   focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
      >
        {/* Placeholder */}
        {selected.length === 0 && (
          <span className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 select-none">
            <UserGroupIcon className="h-4 w-4" />
            {members.length === 0
              ? (emptyMessage || "Select a project first")
              : "Click to add…"}
          </span>
        )}

        {/* Selected chips */}
        {selected.map((member) => (
          <span
            key={member.id}
            className="group flex items-center gap-1.5 pl-1 pr-1.5 py-0.5
                       rounded-full bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700
                       text-indigo-900 dark:text-indigo-200 text-sm select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar name={member.name} className="h-5 w-5 text-[10px]" />
            <span className="font-medium leading-none">{member.name}</span>
            <button
              type="button"
              onClick={() => remove(member.id)}
              aria-label={`Remove ${member.name}`}
              className="rounded-full p-0.5 text-indigo-400 dark:text-indigo-400
                         opacity-0 group-hover:opacity-100
                         hover:bg-indigo-200 dark:hover:bg-indigo-700 hover:text-indigo-800 dark:hover:text-indigo-200
                         transition-all duration-150"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}

        {/* Chevron */}
        <ChevronDownIcon
          className={`h-4 w-4 text-gray-400 ml-auto shrink-0 transition-transform duration-150
                      ${open ? "rotate-180" : ""}`}
        />
      </div>

      {/* ── Dropdown ─────────────────────────────────────────────────── */}
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1 w-full rounded-md bg-white dark:bg-gray-800
                     shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          {available.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 italic">
              {members.length === 0
                ? (emptyMessage || "No members in this project yet")
                : "All members have been added"}
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {available.map((member) => (
                <li
                  key={member.id}
                  role="option"
                  aria-selected="false"
                  onClick={() => { add(member.id); }}
                  className="flex items-center gap-3 px-4 py-2.5
                             cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                >
                  <Avatar name={member.name} className="h-8 w-8 text-sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {member.name}
                    </p>
                    {member.role && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.role}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
