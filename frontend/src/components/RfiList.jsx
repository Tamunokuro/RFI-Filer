import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN } from "../constants";
import Footer from "./Footer";
import RFiDeleteButton from "./DeleteButton";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import Header from "./Header";

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
  const pageSize = 10;

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchRfis = async () => {
      try {
        const response = await api.get("/api/rfis/", {
          params: { page, search: searchTerm },
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
      }
    };

    fetchRfis();
  }, [navigate, page, searchTerm]);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (dueDate) => {
    if (!dueDate) return "bg-gray-100";
    const today = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "bg-red-100 text-red-800";
    if (diffDays <= 3) return "bg-yellow-100 text-yellow-800";
    return "bg-green-100 text-green-800";
  };

  return (
    <div className="form-wrapper flex flex-col min-h-screen p-4">
      <div className="form-container max-w-7xl mx-auto">
        <Header title="RFI List" />

        {/* Search bar */}
        <div className="py-5 mb-6">
          <div className="relative max-w-md mx-auto">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search RFIs..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Table */}
        <div className="opy-3 w-full overflow-x-auto lg:overflow-visible">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Project Number", "RFI Number", "RFI Name", "Project", "Trade", "Received", "Due Date", "Assigned To", "Status", "Actions"].map((heading, index) => (
                  <th
                    key={index}
                    className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rfis.map((rfi) => (
                <tr
                  key={rfi.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}/edit`)}
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {rfi.project_number}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {rfi.rfi_number}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {rfi.rfi_name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {rfi.project_name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {rfi.trade}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(rfi.received_date)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(rfi.due_date)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {rfi.assigned_to}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                        rfi.due_date
                      )}`}
                    >
                      {new Date(rfi.due_date) < new Date()
                        ? "Overdue"
                        : "Active"}
                    </span>
                  </td>
                  <td
                    className="px-4 py-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RFiDeleteButton
                      pk={rfi.id}
                      rfiSlug={rfi.slug}
                      rfiName={rfi.rfi_name}
                      projectName={rfi.project_name}
                      projectNumber={rfi.project_number}
                      rfiNumber={rfi.rfi_number}
                      onDelete={(deletedId) =>
                        setRfis((prev) =>
                          prev.filter((rfi) => rfi.id !== deletedId)
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {rfis.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No RFIs found matching your search criteria.
          </div>
        )}

        {/* Pagination */}
        {count > 0 && (
          <div className="flex flex-col items-center gap-2 my-6">
            <div className="flex gap-4">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={!prev}
                className={`px-3 py-1 rounded ${
                  prev
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-300 text-gray-600 cursor-not-allowed"
                }`}
              >
                Prev
              </button>

              <span className="px-3 py-1 text-sm font-medium text-gray-700">
                Page {page}
                {count > pageSize && ` of ${Math.ceil(count / pageSize)}`} (
                {count} results)
              </span>

              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!next}
                className={`px-3 py-1 rounded ${
                  next
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-300 text-gray-600 cursor-not-allowed"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default RfiList;