/**
 * Analytics — response-time metrics and project health.
 * Clean layout: plain colored numbers, horizontal bar rows,
 * vertical bar chart with fixed pixel heights.
 */
import { useEffect, useState } from "react";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import LoadingIndicator from "../components/LoadingIndicator";

// ── Colour maps ───────────────────────────────────────────────────────────────

const PRIORITY_BAR = {
  low: "bg-green-500",
  medium: "bg-yellow-400",
  high: "bg-orange-500",
  critical: "bg-red-600",
};
const PRIORITY_TEXT = {
  low: "text-green-700 dark:text-green-400",
  medium: "text-yellow-700 dark:text-yellow-400",
  high: "text-orange-700 dark:text-orange-400",
  critical: "text-red-700 dark:text-red-400",
};

const STATUS_BAR = {
  open: "bg-slate-400",
  submitted: "bg-blue-400",
  under_review: "bg-amber-400",
  responded: "bg-purple-400",
  returned: "bg-rose-400",
  closed: "bg-green-500",
};

const STATUS_LABEL = {
  open: "Open",
  submitted: "Submitted",
  under_review: "Under Review",
  responded: "Responded",
  returned: "Returned",
  closed: "Closed",
};

// ── Sub-components ────────────────────────────────────────────────────────────

/** Simple KPI tile — large number, label, optional sub-text */
function KpiCard({
  label,
  value,
  sub,
  accent = "text-indigo-700 dark:text-indigo-300",
  bg = "bg-white dark:bg-gray-800",
}) {
  return (
    <div
      className={`${bg} rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex flex-col gap-1 min-w-0`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 truncate">
        {label}
      </p>
      <p className={`text-4xl font-extrabold leading-none mt-1 ${accent}`}>
        {value}
      </p>
      {sub && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
          {sub}
        </p>
      )}
    </div>
  );
}

/** Horizontal bar row used for project / trade / priority / status tables */
function BarRow({
  label,
  value,
  max,
  barClass = "bg-indigo-500",
  suffix = "",
  extra,
}) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span
        className="w-40 shrink-0 text-sm text-gray-700 dark:text-gray-300 truncate"
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          className={`${barClass} h-2.5 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-sm font-semibold text-gray-800 dark:text-gray-200 text-right tabular-nums">
        {value}
        {suffix}
        {extra && (
          <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">
            {extra}
          </span>
        )}
      </span>
    </div>
  );
}

/** Vertical bar chart for monthly opened/closed. Uses fixed px height so bars never escape. */
function MonthlyChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        No RFI activity in the last 12 months.
      </p>
    );
  }

  const CHART_H = 120; // px — fixed height of bar area
  const maxVal = Math.max(...data.flatMap((d) => [d.opened, d.closed]), 1);

  return (
    <div>
      {/* Bar area */}
      <div className="overflow-x-auto">
        <div className="flex items-end gap-1" style={{ height: CHART_H + 32 }}>
          {data.map((d) => {
            const openH = Math.round((d.opened / maxVal) * CHART_H);
            const closeH = Math.round((d.closed / maxVal) * CHART_H);
            const [yr, mo] = d.month.split("-");
            const label = new Date(Number(yr), Number(mo) - 1).toLocaleString(
              "default",
              { month: "short" }
            );
            return (
              <div
                key={d.month}
                className="flex-1 min-w-[24px] flex flex-col items-center gap-0"
              >
                {/* Bars */}
                <div
                  className="w-full flex items-end gap-px"
                  style={{ height: CHART_H }}
                >
                  <div
                    className="flex-1 bg-indigo-400 dark:bg-indigo-500 rounded-t"
                    style={{ height: openH || 0 }}
                    title={`Opened: ${d.opened}`}
                  />
                  <div
                    className="flex-1 bg-green-400 dark:bg-green-500 rounded-t"
                    style={{ height: closeH || 0 }}
                    title={`Closed: ${d.closed}`}
                  />
                </div>
                {/* Month label — plain text, no rotation */}
                <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-none">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-5 mt-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-indigo-400 dark:bg-indigo-500" />
          Opened
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-green-400 dark:bg-green-500" />
          Closed
        </span>
      </div>
    </div>
  );
}

/** Card wrapper for a section inside the 2-column grid */
function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col gap-4 min-w-0">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/api/analytics/")
      .then((r) => setData(r.data))
      .catch(() => setError("Failed to load analytics. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  // Derived summary values
  const totalRfis = data
    ? data.status_breakdown.reduce((s, r) => s + r.count, 0)
    : 0;
  const totalClosed = data
    ? data.status_breakdown.find((s) => s.status === "closed")?.count ?? 0
    : 0;
  const totalActive = data ? data.active_count ?? 0 : 0;

  const overdueRatePct = data ? Math.round((data.overdue_rate ?? 0) * 100) : 0;
  const avgDays =
    data?.overall_avg_days != null ? `${data.overall_avg_days}d` : "—";

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 space-y-8">
      <Header />
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Analytics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Response times and project health
          </p>
        </div>

        {loading && <LoadingIndicator />}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-5 py-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── KPI row ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard
                label="Avg. Response Time"
                value={avgDays}
                sub={`across ${data.total_responded ?? 0} responded RFIs`}
                accent="text-indigo-700 dark:text-indigo-300"
              />
              <KpiCard
                label="Total RFIs"
                value={totalRfis}
                sub={`${totalActive} active · ${totalClosed} closed`}
                accent="text-blue-700 dark:text-blue-300"
              />
              <KpiCard
                label="Overdue"
                value={data.overdue_count ?? 0}
                sub={`${overdueRatePct}% of active RFIs`}
                accent={
                  overdueRatePct > 20
                    ? "text-red-700 dark:text-red-400"
                    : "text-green-700 dark:text-green-400"
                }
              />
              <KpiCard
                label="Closed RFIs"
                value={totalClosed}
                sub="total resolved"
                accent="text-green-700 dark:text-green-300"
              />
            </div>

            {/* ── Monthly chart ─────────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-5">
                Monthly Activity — last 12 months
              </h2>
              <MonthlyChart data={data.monthly_counts} />
            </div>

            {/* ── 2-col grid ────────────────────────────────────────────── */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Avg response days by project */}
              <Section title="Avg. Response Days · by Project">
                {data.avg_days_by_project.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No responded RFIs yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.avg_days_by_project.map((r) => (
                      <BarRow
                        key={r.project_number}
                        label={`${r.project_number}`}
                        value={r.avg_days}
                        max={Math.max(
                          ...data.avg_days_by_project.map((x) => x.avg_days),
                          1
                        )}
                        barClass="bg-indigo-500"
                        suffix="d"
                        extra={`(${r.count})`}
                      />
                    ))}
                    <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                      Numbers in parentheses = RFI count
                    </p>
                  </div>
                )}
              </Section>

              {/* Avg response days by trade */}
              <Section title="Avg. Response Days · by Trade">
                {data.avg_days_by_trade.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No responded RFIs yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.avg_days_by_trade.map((r) => (
                      <BarRow
                        key={r.trade}
                        label={r.trade}
                        value={r.avg_days}
                        max={Math.max(
                          ...data.avg_days_by_trade.map((x) => x.avg_days),
                          1
                        )}
                        barClass="bg-teal-500"
                        suffix="d"
                        extra={`(${r.count})`}
                      />
                    ))}
                  </div>
                )}
              </Section>

              {/* RFIs by priority */}
              <Section title="All RFIs by Priority">
                {data.priority_breakdown.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No RFIs yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.priority_breakdown.map((r) => (
                      <BarRow
                        key={r.priority}
                        label={
                          r.priority.charAt(0).toUpperCase() +
                          r.priority.slice(1)
                        }
                        value={r.count}
                        max={Math.max(
                          ...data.priority_breakdown.map((x) => x.count),
                          1
                        )}
                        barClass={PRIORITY_BAR[r.priority] ?? "bg-gray-400"}
                      />
                    ))}
                  </div>
                )}
              </Section>

              {/* RFIs by status */}
              <Section title="All RFIs by Status">
                {data.status_breakdown.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No RFIs yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.status_breakdown.map((r) => (
                      <BarRow
                        key={r.status}
                        label={STATUS_LABEL[r.status] ?? r.status}
                        value={r.count}
                        max={Math.max(
                          ...data.status_breakdown.map((x) => x.count),
                          1
                        )}
                        barClass={STATUS_BAR[r.status] ?? "bg-gray-400"}
                      />
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
