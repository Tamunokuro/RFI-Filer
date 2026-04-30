import {
  BriefcaseIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/outline";

const MemberCard = ({ member }) => {
  return (
    <div className="max-w-md w-full rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition duration-300">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-900 to-indigo-700 text-white text-2xl font-bold uppercase shadow-md">
          {member.name
            ?.split(" ")
            .map((part) => part.charAt(0).toUpperCase())
            .slice(0, 2)
            .join("")}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{member.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Profile Overview</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-700 p-3">
          <BriefcaseIcon className="h-5 w-5 text-blue-900 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Role
            </p>
            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
              {member.role || "Not provided"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-700 p-3">
          <EnvelopeIcon className="h-5 w-5 text-blue-900 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Email
            </p>
            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium break-all">
              {member.email || "Not provided"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-700 p-3">
          <BuildingOfficeIcon className="h-5 w-5 text-blue-900 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Company
            </p>
            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
              {member.company || "Not provided"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberCard;
