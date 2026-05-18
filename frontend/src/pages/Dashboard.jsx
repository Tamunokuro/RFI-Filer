/**
 * Dashboard — the home screen every user lands on.
 *
 * Sections
 *   1. KPI row          — Overdue · Open · Due This Week · Critical
 *   2. Project breakdown — per-project open / overdue / due-soon + ball-in-court
 *   3. Due This Week     — compact sorted list of upcoming RFIs
 *   4. In Your Court     — RFIs where the current user needs to act
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import {
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
  FireIcon,
  ArrowRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

const PRIORITY_META = {
  low:      { label: "Low",      cls: "bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400" },
  medium:   { label: "Medium",   cls: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300" },
  high:     { label: "High",     cls: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300" },
  critical: { label: "Critical", cls: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" },
};

const STATUS_LABEL = {
  open:         "Open",
  submitted:    "Submitted",
  under_review: "Under Review",
  responded:    "Responded",
};

// Ball-in-court labels per status
const BIC_LABEL = {
  open:         { label: "Requester",  cls: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" },
  submitted:    { label: "Designer",   cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" },
  under_review: { label: "Designer",   cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" },
  responded:    { label: "CA / PM",    cls: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" },
};

function DaysChip({ days }) {
  if (days === null || days === undefined) return null;
  if (days < 0)
    return (
      <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
        {Math.abs(days)}d overdue
      </span>
    );
  if (days === 0)
    return (
      <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
        Due today
      </span>
    );
  if (days <= 3)
    return (
      <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
        {days}d left
      </span>
    );
  return (
    <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
      {days}d left
    </span>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, Icon, accent, onClick }) {
  const accentMap = {
    red:    "border-red-300 dark:border-red-800/60",
    amber:  "border-amber-300 dark:border-amber-800/60",
    indigo: "border-indigo-200 dark:border-indigo-800/40",
    orange: "border-orange-300 dark:border-orange-800/60",
  };
  const iconMap = {
    red:    "text-red-500 dark:text-red-400",
    amber:  "text-amber-500 dark:text-amber-400",
    indigo: "text-indigo-500 dark:text-indigo-400",
    orange: "text-orange-500 dark:text-orange-400",
  };
  const numMap = {
    red:    "text-red-700 dark:text-red-300",
    amber:  "text-amber-700 dark:text-amber-300",
    indigo: "text-indigo-700 dark:text-indigo-300",
    orange: "text-orange-700 dark:text-orange-300",
  };

  const base = `text-left w-full rounded-xl border ${accentMap[accent]} bg-white dark:bg-gray-800 p-5 shadow-sm transition-shadow`;

  if (!onClick) {
    return (
      <div className={base}>
        <div className="flex items-start justify-between">
          <Icon className={`h-6 w-6 ${iconMap[accent]} opacity-40`} />
        </div>
        <p className={`mt-3 text-4xl font-bold tracking-tight ${numMap[accent]} opacity-40`}>
          {value ?? "—"}
        </p>
        <p className="mt-1 text-sm font-medium text-gray-400 dark:text-gray-500">{label}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group ${base} hover:shadow-md`}
    >
      <div className="flex items-start justify-between">
        <Icon className={`h-6 w-6 ${iconMap[accent]}`} />
        <ArrowRightIcon className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" />
      </div>
      <p className={`mt-3 text-4xl font-bold tracking-tight ${numMap[accent]}`}>
        {value ?? "—"}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </button>
  );
}

// ── Project breakdown row ─────────────────────────────────────────────────────

function BicBar({ withSubmitter, withDesigner, withCa }) {
  const total = withSubmitter + withDesigner + withCa;
  if (total === 0) return null;
  const pct = (n) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 rounded-full flex overflow-hidden w-20 bg-gray-100 dark:bg-gray-700">
        {withSubmitter > 0 && (
          <div className="bg-gray-400 dark:bg-gray-500 h-full" style={{ width: pct(withSubmitter) }} title={`Requester: ${withSubmitter}`} />
        )}
        {withDesigner > 0 && (
          <div className="bg-blue-400 dark:bg-blue-500 h-full" style={{ width: pct(withDesigner) }} title={`Designer: ${withDesigner}`} />
        )}
        {withCa > 0 && (
          <div className="bg-purple-400 dark:bg-purple-500 h-full" style={{ width: pct(withCa) }} title={`CA/PM: ${withCa}`} />
        )}
      </div>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
        {withSubmitter > 0 && <span className="text-gray-500 dark:text-gray-400">{withSubmitter} Req </span>}
        {withDesigner > 0 && <span className="text-blue-500 dark:text-blue-400">{withDesigner} Des </span>}
        {withCa > 0       && <span className="text-purple-500 dark:text-purple-400">{withCa} CA</span>}
      </span>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children, action }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: d } = await api.get("/api/dashboard/");
      setData(d);
    } catch {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const goToRfi = (rfi) => navigate(`/rfi/${rfi.id}/${rfi.slug}`);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
        <Header title="Dashboard" />

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          </div>
        ) : data && (
          <>
            {/* ── KPI row ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Overdue"
                value={data.stats.overdue}
                Icon={ExclamationTriangleIcon}
                accent="red"
                onClick={() => navigate("/?status=open&overdue=true")}
              />
              <KpiCard
                label="Total Open"
                value={data.stats.total_open}
                Icon={ClipboardDocumentListIcon}
                accent="indigo"
                onClick={() => navigate("/rfis")}
              />
              <KpiCard
                label="Due This Week"
                value={data.stats.due_this_week}
                Icon={CalendarDaysIcon}
                accent="amber"
                onClick={data.stats.due_this_week > 0 ? () => navigate("/rfis?due_this_week=true") : null}
              />
              <KpiCard
                label="Critical Priority"
                value={data.stats.critical}
                Icon={FireIcon}
                accent="orange"
                onClick={() => navigate("/rfis")}
              />
            </div>

            {/* ── Middle row ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* Project breakdown — 3 cols */}
              <div className="lg:col-span-3">
                <Section
                  title="Open RFIs by Project"
                  subtitle={`${data.project_breakdown.length} project${data.project_breakdown.length !== 1 ? "s" : ""} with active RFIs`}
                >
                  {data.project_breakdown.length === 0 ? (
                    <p className="px-5 py-8 text-sm text-center text-gray-400 dark:text-gray-500">
                      No active RFIs. 🎉
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {data.project_breakdown.map((p) => (
                        <button
                          key={p.project_id}
                          type="button"
                          onClick={() => navigate(`/projects/${p.project_id}`)}
                          className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 text-left transition-colors"
                        >
                          {/* Project name */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {p.project_number}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                              {p.project_name}
                            </p>
                          </div>

                          {/* Open count */}
                          <div className="shrink-0 text-center w-10">
                            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-none">
                              {p.open}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">open</p>
                          </div>

                          {/* Overdue chip */}
                          <div className="shrink-0 w-16 text-right">
                            {p.overdue > 0 ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                                {p.overdue} OD
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                                on time
                              </span>
                            )}
                          </div>

                          {/* Due this week chip */}
                          {p.due_this_week > 0 && (
                            <div className="shrink-0 w-14 text-right">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                {p.due_this_week} this wk
                              </span>
                            </div>
                          )}

                          {/* Ball-in-court bar */}
                          <BicBar
                            withSubmitter={p.with_submitter}
                            withDesigner={p.with_designer}
                            withCa={p.with_ca}
                          />

                          <ArrowRightIcon className="shrink-0 h-4 w-4 text-gray-300 dark:text-gray-600" />
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
              </div>

              {/* Due This Week — 2 cols */}
              <div className="lg:col-span-2">
                <Section
                  title="Due This Week"
                  subtitle={`Next 7 days · ${data.due_this_week.length} RFI${data.due_this_week.length !== 1 ? "s" : ""}`}
                >
                  {data.due_this_week.length === 0 ? (
                    <p className="px-5 py-8 text-sm text-center text-gray-400 dark:text-gray-500">
                      Nothing due this week.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {data.due_this_week.map((rfi) => {
                        const pm = PRIORITY_META[rfi.priority] ?? PRIORITY_META.medium;
                        return (
                          <li key={rfi.id}>
                            <button
                              type="button"
                              onClick={() => goToRfi(rfi)}
                              className="w-full flex items-start gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 text-left transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                    {rfi.rfi_number}
                                  </span>
                                  <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${pm.cls}`}>
                                    {pm.label}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate mt-0.5">
                                  {rfi.rfi_name}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                  {rfi.project_number} · Due {fmtDate(rfi.due_date)}
                                </p>
                              </div>
                              <DaysChip days={rfi.days_left} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Section>
              </div>
            </div>

            {/* ── In Your Court ─────────────────────────────────────────────── */}
            {data.in_your_court.length > 0 && (
              <Section
                title="In Your Court"
                subtitle={`${data.in_your_court.length} RFI${data.in_your_court.length !== 1 ? "s" : ""} waiting for your action`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-gray-100 dark:bg-gray-700">
                  {data.in_your_court.map((rfi) => {
                    const pm  = PRIORITY_META[rfi.priority]  ?? PRIORITY_META.medium;
                    const bic = BIC_LABEL[rfi.status]        ?? BIC_LABEL.open;
                    return (
                      <button
                        key={rfi.id}
                        type="button"
                        onClick={() => goToRfi(rfi)}
                        className="bg-white dark:bg-gray-800 p-4 text-left hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            {rfi.rfi_number}
                          </span>
                          <DaysChip days={rfi.days_left} />
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug mb-2">
                          {rfi.rfi_name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 truncate">
                          {rfi.project_number} · Due {fmtDate(rfi.due_date)}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${bic.cls}`}>
                            {bic.label}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${pm.cls}`}>
                            {pm.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Empty state — no open RFIs at all */}
            {data.stats.total_open === 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-16 text-center">
                <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
                <h3 className="mt-3 text-base font-semibold text-gray-700 dark:text-gray-300">
                  All clear!
                </h3>
                <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                  No open RFIs across any project.
                </p>
              </div>
            )}

            {/* Refresh + last-loaded hint */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={load}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Dashboard;
