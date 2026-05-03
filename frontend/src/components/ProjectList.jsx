import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN } from "../constants";

import Footer from "./Footer";
import AssigneeAvatars from "./AssigneeAvatars";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  PlusIcon,
} from "@heroicons/react/20/solid";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { useAuth, canCreateProject } from "../context/Auth";
import ProjectFormModal from "./ProjectFormModal";

const isOverdue = (rfi) => {
  if (!rfi.due_date || rfi.status === "closed") return false;
  return new Date(rfi.due_date) < new Date();
};

const ProjectList = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const canCreate = canCreateProject(role);
  const [projects, setProjects] = useState([]);
  const [openProjectIds, setOpenProjectIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const toggleRFIs = (projectId) => {
    setOpenProjectIds((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const fetchProjects = async () => {
    try {
      const response = await api.get("/api/projects/");
      if (Array.isArray(response.data)) {
        setProjects(response.data);
        setError("");
      } else if (
        response.data &&
        response.data.message === "There are no projects"
      ) {
        setProjects([]);
        setError("");
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

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      navigate("/login");
      return;
    }
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const filteredProjects = projects.filter((project) =>
    `${project.project_name} ${project.project_number} ${
      project.project_manager_name || ""
    }`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950">
      <div className="container mx-auto p-4">
        {/* Header with title and chat icon */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">Project List</h1>
          <div className="flex items-center gap-3">
            {canCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <PlusIcon className="w-4 h-4" />
                New project
              </button>
            )}
            <button
              onClick={() => navigate("/")}
              className="text-gray-600 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              title="Go to RFI List"
            >
              <ClipboardDocumentListIcon className="w-6 h-6" />
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
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading projects...</p>
        ) : error ? (
          <p className="text-red-500 dark:text-red-400">{error}</p>
        ) : filteredProjects.length > 0 ? (
          <ul className="space-y-4">
            {filteredProjects.map((project) => (
              <li
                key={project.id}
                className="border border-gray-200 dark:border-gray-700 rounded p-4 bg-white dark:bg-gray-800"
              >
                <div className="flex justify-between items-center gap-3">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => toggleRFIs(project.id)}
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {project.project_number} - {project.project_name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Project Manager: {project.project_manager_name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      RFIs: {project.rfi_count || 0}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/projects/${project.id}`);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-indigo-300 dark:border-indigo-600 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                      title="Open project view"
                    >
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRFIs(project.id)}
                      className="text-gray-700 dark:text-gray-300 p-1"
                      aria-label={openProjectIds[project.id] ? "Collapse" : "Expand"}
                    >
                      {openProjectIds[project.id] ? (
                        <ChevronUpIcon className="w-5 h-5" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {openProjectIds[project.id] && (
                  <div className="mt-3 bg-gray-50 dark:bg-gray-900 p-3 rounded">
                    {project.rfis?.length > 0 ? (
                      <ul className="space-y-2">
                        {project.rfis.map((rfi) => (
                          <li key={rfi.id}>
                            <button
                              type="button"
                              onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}`)}
                              className={`w-full text-left p-2 border rounded shadow-sm transition ${
                                isOverdue(rfi)
                                  ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/40"
                                  : rfi.status === "closed"
                                  ? "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                              }`}
                            >
                              <p className="font-semibold">{rfi.rfi_name}</p>
                              <p className="text-sm">
                                RFI Number: {rfi.rfi_number}
                              </p>
                              <div className="flex items-center gap-2 text-sm mt-0.5">
                                <span className="text-gray-600 dark:text-gray-400 shrink-0">Designers / CAs:</span>
                                <AssigneeAvatars
                                  members={[
                                    ...(rfi.designers_detail || []),
                                    ...(rfi.contract_administrators_detail || []),
                                  ]}
                                  size="sm"
                                />
                              </div>
                              <p className="text-sm">Due: {rfi.due_date}</p>
                              {rfi.status === "closed" ? (
                                <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                  ✓ Closed
                                </p>
                              ) : isOverdue(rfi) ? (
                                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                                  ⚠️ Overdue
                                </p>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500 dark:text-gray-400 italic">No RFIs found.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 italic mb-3">No projects found.</p>
            {canCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <PlusIcon className="w-4 h-4" />
                Create your first project
              </button>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <ProjectFormModal
          onClose={() => setShowCreate(false)}
          onSaved={(p) => {
            setShowCreate(false);
            fetchProjects();
            // Navigate to the new project so the user can immediately add members.
            if (p?.id) navigate(`/projects/${p.id}`);
          }}
        />
      )}

      <Footer />
    </div>
  );
};

export default ProjectList;
