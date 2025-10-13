import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN } from "../constants";

import Footer from "./Footer";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  ChatBubbleLeftRightIcon,
  FolderIcon,
} from "@heroicons/react/20/solid";

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

const ProjectList = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [openProjectIds, setOpenProjectIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const toggleRFIs = (projectId) => {
    setOpenProjectIds((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchProjects = async () => {
      try {
        const response = await api.get("/api/projects/");
        if (Array.isArray(response.data)) {
          setProjects(response.data);
        } else if (
          response.data &&
          response.data.message === "There are no projects"
        ) {
          setError("No projects found. Please create a project first.");
          setProjects([]);
        } else {
          setError("Invalid response format from server.");
        }
      } catch (err) {
        if (err.response?.status === 401) {
          setError("Authentication failed. Please log in again.");
          navigate("/login");
        } else {
          setError(err.response?.data?.message || "Failed to load projects");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [navigate]);

  const filteredProjects = projects.filter((project) =>
    `${project.project_name} ${project.project_number} ${
      project.project_manager_name || ""
    }`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto p-4">
        {/* Header with title and chat icon */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-indigo-900">Project List</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-gray-600 hover:text-indigo-700"
              title="Go to RFI List"
            >
              <ChatBubbleLeftRightIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="py-5 mb-6">
          <div className="relative max-w-md mx-auto">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search using project name, number, or manager..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <p>Loading projects...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : filteredProjects.length > 0 ? (
          <ul className="space-y-4">
            {filteredProjects.map((project) => (
              <li
                key={project.id}
                className="border border-gray-200 rounded p-4 bg-white"
              >
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleRFIs(project.id)}
                >
                  <div>
                    <h3 className="text-lg font-semibold">
                      {project.project_number} - {project.project_name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Project Manager: {project.project_manager_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      RFIs: {project.rfi_count || 0}
                    </p>
                  </div>
                  <div>
                    {openProjectIds[project.id] ? (
                      <ChevronUpIcon className="w-5 h-5 text-gray-700" />
                    ) : (
                      <ChevronDownIcon className="w-5 h-5 text-gray-700" />
                    )}
                  </div>
                </div>

                {openProjectIds[project.id] && (
                  <div className="mt-3 bg-gray-50 p-3 rounded">
                    {project.rfis?.length > 0 ? (
                      <ul className="space-y-2">
                        {project.rfis.map((rfi) => (
                          <li
                            key={rfi.id}
                            className={`p-2 border rounded shadow-sm ${
                              isOverdue(rfi.due_date)
                                ? "bg-red-100 text-red-800 border-red-300"
                                : "bg-white text-gray-800 border-gray-200"
                            }`}
                          >
                            <p className="font-semibold">{rfi.rfi_name}</p>
                            <p className="text-sm">
                              RFI Number: {rfi.rfi_number}
                            </p>
                            <p className="text-sm">
                              Assigned To:{" "}
                              {Array.isArray(rfi.assigned_to_detail) &&
                              rfi.assigned_to_detail.length
                                ? rfi.assigned_to_detail
                                    .map((m) => m.name)
                                    .join(", ")
                                : "—"}
                            </p>
                            <p className="text-sm">Due: {rfi.due_date}</p>
                            {isOverdue(rfi.due_date) && (
                              <p className="text-xs font-medium text-red-600">
                                ⚠️ Overdue
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500 italic">No RFIs found.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-center italic">No Projects Found.</p>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default ProjectList;
