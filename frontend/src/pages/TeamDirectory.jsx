import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import InviteMemberModal from "../components/InviteMemberModal";
import { useAuth, canViewTeamDirectory } from "../context/Auth";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
} from "@heroicons/react/20/solid";
import { ShieldCheckIcon } from "@heroicons/react/20/solid";

const ROLE_FILTERS = [
  "All",
  "Project Manager",
  "Project Designer",
  "Sub Consultant",
  "Contract Administrator",
  "Contractor",
  "Client",
];

/** Deterministic avatar colour from a name string */
const avatarColor = (name = "") => {
  const colours = [
    "from-violet-600 to-indigo-600",
    "from-blue-600 to-cyan-500",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-500",
    "from-sky-500 to-blue-600",
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return colours[hash % colours.length];
};

const initials = (name = "") =>
  name
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

const TeamDirectory = () => {
  const navigate = useNavigate();
  const { isAdmin, role } = useAuth();

  // Redirect unauthorised roles before rendering anything
  useEffect(() => {
    if (!canViewTeamDirectory(role, isAdmin)) {
      navigate("/", { replace: true });
    }
  }, [role, isAdmin, navigate]);

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [showInvite, setShowInvite] = useState(false);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/members/");
      setMembers(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("Failed to load team directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((m) => {
      const matchesRole = roleFilter === "All" || m.role === roleFilter;
      const matchesSearch =
        !term ||
        [m.name, m.email, m.company, m.role, m.discipline]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      return matchesRole && matchesSearch;
    });
  }, [members, search, roleFilter]);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-5">
        <Header title="Team" />

        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Team Directory
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({members.length} member{members.length !== 1 ? "s" : ""})
              </span>
            )}
          </h2>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <PlusIcon className="h-4 w-4" />
              Invite member
            </button>
          )}
        </div>

        {/* Search + role filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, email, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  roleFilter === r
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading team…</p>
        ) : error ? (
          <p className="text-red-600 dark:text-red-400">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 italic">
            No members match your search.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/members/${m.id}`)}
                className="text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 transition-all"
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarColor(m.name)} text-white text-sm font-bold shadow`}
                  >
                    {initials(m.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {m.name}
                    </p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">
                      {m.role}
                      {m.discipline ? ` · ${m.discipline}` : ""}
                    </p>
                  </div>
                </div>

                {/* Meta rows */}
                <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                  {m.email && (
                    <div className="flex items-center gap-1.5 truncate">
                      <EnvelopeIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{m.email}</span>
                    </div>
                  )}
                  {m.company && (
                    <div className="flex items-center gap-1.5 truncate">
                      <BuildingOfficeIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{m.company}</span>
                    </div>
                  )}
                </div>

                {/* Admin badge */}
                {m.is_admin && (
                  <div className="mt-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      <ShieldCheckIcon className="h-3.5 w-3.5" />
                      Admin
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteMemberModal
          onClose={() => setShowInvite(false)}
          onInvited={(newMember) => {
            setMembers((prev) => [...prev, newMember]);
          }}
        />
      )}

      <Footer />
    </div>
  );
};

export default TeamDirectory;
