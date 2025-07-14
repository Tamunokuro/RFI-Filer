import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN } from "../constants";

import Header from "./Header";
import Footer from "./Footer";
import RFiDeleteButton from "./DeleteButton";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";

const RfiList = () => {
  const navigate = useNavigate();
  const [rfis, setRfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchRfis = async () => {
      try {
        const response = await api.get("/api/rfis/");
        setRfis(response.data);
      } catch (err) {
        console.error("Error fetching RFIs:", err);
        setError("Failed to load RFIs. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchRfis();
  }, [navigate]);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedRfis = [...rfis].sort((a, b) => {
    if (!sortConfig.key) return 0;
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === "asc" ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === "asc" ? 1 : -1;
    }
    return 0;
  });

  const filteredRfis = sortedRfis.filter((rfi) =>
    Object.values(rfi).some(
      (value) =>
        value &&
        value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "↑" : "↓";
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="form-wrapper flex flex-col min-h-screen">
      <div className="form-background"></div>
      <div className="form-decoration decoration-1"></div>
      <div className="form-decoration decoration-2"></div>
      <div className="form-container max-w-7xl mx-auto">
        <Header />

        <div className="py-5 mb-6">
          <div className="relative max-w-md mx-auto">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search RFIs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="opy-3 w-full overflow-x-auto lg:overflow-visible">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th
                  className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("project_number")}
                >
                  Project Number {getSortIcon("project_number")}
                </th>
                <th
                  className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("rfi_number")}
                >
                  RFI Number {getSortIcon("rfi_number")}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("rfi_name")}
                >
                  RFI Name {getSortIcon("rfi_name")}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("project_name")}
                >
                  Project {getSortIcon("project_name")}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("trade")}
                >
                  Trade {getSortIcon("trade")}
                </th>
                <th
                  className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("received_date")}
                >
                  Received {getSortIcon("received_date")}
                </th>
                <th
                  className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("due_date")}
                >
                  Due Date {getSortIcon("due_date")}
                </th>
                <th
                  className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("assigned_to")}
                >
                  Assigned To {getSortIcon("assigned_to")}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort("status")}
                >
                  Status {getSortIcon("status")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRfis.map((rfi) => (
                <tr
                  key={rfi.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}/edit`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {rfi.project_number}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {rfi.rfi_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {rfi.rfi_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {rfi.project_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {rfi.trade}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(rfi.received_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(rfi.due_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {rfi.assigned_to}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
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
                    className="px-4 py-4 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()} // prevent row click navigation
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

        {filteredRfis.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No RFIs found matching your search criteria.
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default RfiList;
