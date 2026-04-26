import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MemberCard from "../components/MemberCard";
import {
  BriefcaseIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/20/solid";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const statusMeta = (rfi) => {
  if (rfi.status === "closed") {
    return {
      label: "Closed",
      icon: <CheckCircleIcon className="h-4 w-4 text-gray-400" />,
      pill: "bg-gray-100 text-gray-600",
    };
  }
  const today = new Date();
  const due = new Date(rfi.due_date);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)
    return {
      label: "Overdue",
      icon: <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />,
      pill: "bg-red-100 text-red-700",
    };
  if (diffDays <= 3)
    return {
      label: "Due soon",
      icon: <ClockIcon className="h-4 w-4 text-yellow-500" />,
      pill: "bg-yellow-100 text-yellow-700",
    };
  return {
    label: "Active",
    icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
    pill: "bg-green-100 text-green-700",
  };
};

const MemberDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [rfis, setRfis] = useState([]);
  const [page, setPage] = useState(1);
  const [next, setNext] = useState(null);
  const [prev, setPrev] = useState(null);
  const [count, setCount] = useState(0);
  const [rfiLoading, setRfiLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api
      .get(`/api/members/${id}/`)
      .then((res) => setMember(res.data))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    setRfiLoading(true);
    api
      .get("/api/rfis/", { params: { assigned_to: id, page } })
      .then((res) => {
        setRfis(res.data.results);
        setNext(res.data.next);
        setPrev(res.data.previous);
        setCount(res.data.count);
      })
      .catch(() => {})
      .finally(() => setRfiLoading(false));
  }, [id, page]);

  const filtered = rfis.filter((rfi) => {
    if (filter === "open") return rfi.status === "open";
    if (filter === "closed") return rfi.status === "closed";
    return true;
  });

  if (!member) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <Header title="Profile" />
          <p className="text-gray-500">Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  const openCount = rfis.filter((r) => r.status === "open").length;
  const closedCount = rfis.filter((r) => r.status === "closed").length;
  const overdueCount = rfis.filter((r) => {
    if (r.status === "closed") return false;
    return new Date(r.due_date) < new Date();
  }).length;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
        <Header title="Profile" />

        {/* Top section: card + summary stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <MemberCard member={member} />
          </div>

          <div className="lg:col-span-2 grid grid-cols-3 gap-4 content-start">
            {[
              {
                label: "Total Assigned",
                value: count,
                color: "bg-indigo-50 text-indigo-800",
                icon: <BriefcaseIcon className="h-6 w-6 text-indigo-400" />,
              },
              {
                label: "Open",
                value: openCount,
                color: "bg-green-50 text-green-800",
                icon: <CheckCircleIcon className="h-6 w-6 text-green-400" />,
              },
              {
                label: "Overdue",
                value: overdueCount,
                color: "bg-red-50 text-red-800",
                icon: <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />,
              },
            ].map(({ label, value, color, icon }) => (
              <div
                key={label}
                className={`rounded-xl p-4 flex flex-col items-center gap-1 ${color}`}
              >
                {icon}
                <span className="text-3xl font-bold">{value}</span>
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RFI list */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
            <h3 className="text-base font-semibold text-gray-900">
              Assigned RFIs
            </h3>
            <div className="flex gap-2">
              {["all", "open", "closed"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                    filter === f
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {rfiLoading ? (
            <p className="px-5 py-8 text-sm text-gray-500">Loading RFIs…</p>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-500 italic">
              No {filter !== "all" ? filter + " " : ""}RFIs assigned to this member.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((rfi) => {
                const { label, icon, pill } = statusMeta(rfi);
                return (
                  <li
                    key={rfi.id}
                    onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}`)}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {rfi.rfi_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {rfi.project_number} · {rfi.project_name} · RFI{" "}
                        {rfi.rfi_number}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500">
                      <span>Due {formatDate(rfi.due_date)}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${pill}`}
                      >
                        {icon}
                        {label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination */}
          {count > 10 && (
            <div className="flex items-center justify-center gap-4 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={!prev}
                className="px-3 py-1 rounded text-sm disabled:text-gray-300 text-indigo-600 hover:underline disabled:no-underline"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-500">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!next}
                className="px-3 py-1 rounded text-sm disabled:text-gray-300 text-indigo-600 hover:underline disabled:no-underline"
              >
                Next →
              </button>
            </div>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
};

export default MemberDetail;
