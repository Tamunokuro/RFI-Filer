/**
 * AssigneeAvatars
 *
 * Renders a stacked row of circular avatars for a list of members.
 * Each avatar shows the member's initials and reveals their full name
 * in a tooltip on hover.
 *
 * Props:
 *   members – array of { id?, name } objects  (assigned_to_detail)
 */

const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

const SIZE = {
  sm: "h-5 w-5 text-[8px]",
  md: "h-7 w-7 text-[10px]",
};

export default function AssigneeAvatars({ members, size = "md" }) {
  if (!members?.length) return <span className="text-gray-400">—</span>;

  const avatarClass = SIZE[size] ?? SIZE.md;

  return (
    <div className="flex -space-x-1.5">
      {members.map((m, i) => (
        <div key={m.id ?? `${m.name}-${i}`} className="group relative">
          {/* Avatar */}
          <span
            className={`flex items-center justify-center rounded-full
                       bg-gradient-to-br from-blue-900 to-indigo-700
                       text-white font-bold uppercase
                       ring-2 ring-white cursor-default select-none ${avatarClass}`}
          >
            {getInitials(m.name)}
          </span>

          {/* Tooltip */}
          <div
            className="pointer-events-none absolute bottom-full left-1/2 z-20
                       mb-2 -translate-x-1/2
                       rounded bg-gray-900 px-2 py-1
                       text-xs font-medium text-white whitespace-nowrap
                       opacity-0 group-hover:opacity-100
                       transition-opacity duration-150"
          >
            {m.name}
            {/* Arrow */}
            <span
              className="absolute top-full left-1/2 -translate-x-1/2
                         border-4 border-transparent border-t-gray-900"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
