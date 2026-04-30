import { CalendarDaysIcon } from "@heroicons/react/20/solid";

/**
 * DateInput
 *
 * A polished date field built on the native <input type="date">.
 * - Calendar icon on the left
 * - Full dark-mode support via [color-scheme] (browser renders the picker chrome correctly)
 * - Fires a synthetic event identical in shape to every other form input so that
 *   useCreateRfi's generic handleChange works without modification.
 */
const DateInput = ({ label, name, value, onChange, required = false }) => {
  return (
    <div className="flex-1 min-w-0">
      <label
        htmlFor={name}
        className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1"
      >
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>

      <div className="relative">
        <CalendarDaysIcon
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <input
          type="date"
          id={name}
          name={name}
          value={value || ""}
          onChange={onChange}
          required={required}
          className="
            block w-full rounded-md
            border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700
            pl-9 pr-3 py-2
            text-sm text-gray-900 dark:text-gray-100
            shadow-sm
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            [color-scheme:light] dark:[color-scheme:dark]
          "
        />
      </div>
    </div>
  );
};

export default DateInput;
