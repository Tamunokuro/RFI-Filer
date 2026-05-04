import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN } from "../constants";
import Footer from "./Footer";
import RFiDeleteButton from "./DeleteButton";
import {
  MagnifyingGlassIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/20/solid";
import Header from "./Header";
import { exportRfisToExcel } from "../utils/exportRfisToExcel";
import AssigneeAvatars from "./AssigneeAvatars";

const UNREAD_POLL_MS = 30000;

const formatUnreadCount = (count) => {
  if (!count || count <= 0) return null;
  return count > 999 ? "999+" : count;
};

const RfiList = () => {
  const navigate = useNavigate();
  const [rfis, setRfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [next, setNext] = useState(null);
  const [prev, setPrev] = useState(null);
  const [count, setCount] = useState(0);
  const [unreadMap, setUnreadMap] = useState({});
  const [exporting, setExporting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchRfis = async () => {
      setFetching(true);
      try {
        const response = await api.get("/api/rfis/", {
          params: {
            page,
            search: searchTerm,
            status: "open,submitted,under_review,responded",
          },
        });
        setRfis(response.data.results);
        setNext(response.data.next);
        setPrev(response.data.previous);
        setCount(response.data.count);
      } catch (err) {
        console.error("Error fetching RFIs:", err);
        setError("Failed to load RFIs. Please try again later.");
      } finally {
        setLoading(false);
        setFetching(false);
      }
    };

    fetchRfis();
  }, [navigate, page, searchTerm]);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) return;

    const fetchUnread = async () => {
      try {
        const { data } = await api.get("/api/rfis/unread-summary/");
        setUnreadMap(data || {});
      } catch (err) {
        console.error("Error fetching unread summary:", err);
      }
    };

    fetchUnread();
    const id = setInterval(fetchUnread, UNREAD_POLL_MS);

    return () => clearInterval(id);
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch all pages so the export contains every matching RFI, not just
      // the current page.
      const allRfis = [];
      let pg = 1;
      let hasNext = true;
      while (hasNext) {
        const res = await api.get("/api/rfis/", {
          params: {
            page: pg,
            search: searchTerm,
            status: "open,submitted,under_review,responded",
          },
        });
        allRfis.push(...res.data.results);
        hasNext = !!res.data.next;
        pg++;
      }
      const dateStr = new Date().toISOString().slice(0, 10);
      await exportRfisToExcel(allRfis, `rfi-list-${dateStr}.xlsx`);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString();
  };

  // Priority badge colours
  const PRIORITY_DISPLAY = {
    low:      { label: "Low",      cls: "bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300" },
    medium:   { label: "Medium",   cls: "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300" },
    high:     { label: "High",     cls: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300" },
    critical: { label: "Critical", cls: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300" },
  };

  const renderPriority = (rfi) => {
    const display = PRIORITY_DISPLAY[rfi.priority] ?? PRIORITY_DISPLAY.medium;
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${display.cls}`}>
        {display.label}
      </span>
    );
  };

  // Status label + colour for each workflow state.
  // For "open" RFIs, urgency (overdue) takes visual priority over the label.
  const STATUS_DISPLAY = {
    open: { label: "Open", cls: "bg-green-100 text-green-800 text-center" },
    submitted: {
      label: "Submitted",
      cls: "bg-blue-100 text-blue-800 text-center",
    },
    under_review: {
      label: "Under Review",
      cls: "bg-amber-100 text-amber-800 w-full text-center justify-center",
    },
    responded: { label: "Responded", cls: "bg-purple-100 text-purple-800" },
    closed: { label: "Closed", cls: "bg-gray-100 text-gray-700" },
  };

  const renderStatus = (rfi) => {
    const overdue =
      rfi.status === "open" && new Date(rfi.due_date) < new Date();
    const display = STATUS_DISPLAY[rfi.status] ?? {
      label: rfi.status,
      cls: "bg-gray-100 text-gray-700",
    };

    return (
      <span
        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
          overdue ? "bg-red-100 text-red-800" : display.cls
        }`}
        data-testid={`rfi-status-${rfi.id}`}
      >
        {overdue ? "Overdue" : display.label}
      </span>
    );
  };

  const renderMessageIndicator = (rfiId) => {
    const unread = Number(unreadMap[String(rfiId)] || 0);
    const unreadLabel = formatUnreadCount(unread);

    return (
      <span
        className="relative inline-flex items-center justify-center"
        title={
          unread > 0
            ? `${unread} unread message${unread === 1 ? "" : "s"}`
            : "No unread messages"
        }
        aria-label={
          unread > 0
            ? `${unread} unread message${unread === 1 ? "" : "s"}`
            : "No unread messages"
        }
        data-testid={`rfi-message-icon-${rfiId}`}
      >
        <ChatBubbleOvalLeftEllipsisIcon
          className={`h-5 w-5 ${
            unread > 0 ? "text-indigo-700" : "text-gray-400"
          }`}
        />

        {unreadLabel && (
          <span
            className="absolute -right-2.5 -top-2 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-white"
            data-testid={`rfi-unread-${rfiId}`}
          >
            {unreadLabel}
          </span>
        )}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
          <Header title="RFI List" />
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            Loading RFIs...
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <Header title="RFI List" />

        {error && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Search bar */}
        <div className="py-5 mb-2">
          <div className="relative max-w-md mx-auto">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search RFIs..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Export button — right-aligned below search */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleExport}
            disabled={exporting || rfis.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-800 to-indigo-900 hover:from-blue-900 hover:to-indigo-950 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition duration-150"
            title="Export all matching RFIs to Excel"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
        </div>

        {/* Table — always scroll horizontally so it never escapes the max-w-7xl
            container (which would push the footer out of alignment) */}
        <div
          className={`py-3 w-full overflow-x-auto transition-opacity duration-150 ${
            fetching ? "opacity-40 pointer-events-none" : "opacity-100"
          }`}
        >
          <table className="w-full min-w-[64rem] table-fixed">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="w-[11%] px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Project</th>
                <th className="w-[6%]  px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">RFI #</th>
                <th className="w-[4%]  px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Msgs</th>
                <th className="w-[17%] px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">RFI Name</th>
                <th className="w-[6%]  px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trade</th>
                <th className="w-[7%]  px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Due</th>
                <th className="w-[11%] px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Designers</th>
                <th className="w-[11%] px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">CAs</th>
                <th className="w-[8%]  px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="w-[8%]  px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Priority</th>
                <th className="w-[5%]  px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Del</th>
              </tr>
            </thead>

            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {rfis.map((rfi) => (
                <tr
                  key={rfi.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}`)}
                >
                  {/* Project number + name stacked */}
                  <td className="px-3 py-3">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {rfi.project_number}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">
                      {rfi.project_name}
                    </span>
                  </td>

                  <td className="px-3 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {rfi.rfi_number}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {renderMessageIndicator(rfi.id)}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300 truncate max-w-0">
                    {rfi.rfi_name}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {rfi.trade}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(rfi.due_date)}
                  </td>

                  <td className="px-3 py-3">
                    <AssigneeAvatars members={rfi.designers_detail || []} />
                  </td>

                  <td className="px-3 py-3">
                    <AssigneeAvatars
                      members={rfi.contract_administrators_detail || []}
                    />
                  </td>

                  <td className="px-3 py-3">{renderStatus(rfi)}</td>

                  <td className="px-3 py-3">{renderPriority(rfi)}</td>

                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RFiDeleteButton
                      pk={rfi.id}
                      rfiSlug={rfi.slug}
                      rfiName={rfi.rfi_name}
                      projectName={rfi.project_name}
                      projectNumber={rfi.project_number}
                      rfiNumber={rfi.rfi_number}
                      onDelete={(deletedId) => {
                        setRfis((prev) =>
                          prev.filter((r) => r.id !== deletedId)
                        );
                        setCount((c) => Math.max(c - 1, 0));
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {rfis.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No RFIs found matching your search criteria.
          </div>
        )}

        {/* Pagination — only shown when there is more than one page */}
        {count > pageSize && (
          <div className="flex items-center justify-center gap-4 my-6">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={!prev || fetching}
              className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition duration-150 ${
                prev && !fetching
                  ? "bg-gradient-to-r from-blue-800 to-indigo-900 hover:from-blue-900 hover:to-indigo-950 text-white shadow-md"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              }`}
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Prev
            </button>

            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Page{" "}
              <span className="font-bold text-gray-800 dark:text-gray-200">
                {page}
              </span>{" "}
              of{" "}
              <span className="font-bold text-gray-800 dark:text-gray-200">
                {Math.ceil(count / pageSize)}
              </span>
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                ({count} results)
              </span>
            </span>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!next || fetching}
              className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition duration-150 ${
                next && !fetching
                  ? "bg-gradient-to-r from-blue-800 to-indigo-900 hover:from-blue-900 hover:to-indigo-950 text-white shadow-md"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              }`}
            >
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default RfiList;
