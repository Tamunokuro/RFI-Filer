import { useState, useEffect } from "react";
import api from "../api"; // Ensure this is your Axios instance
import "../styles/Home.css"; // Optional: Add styles for the form
import useCreateRfi from "../hooks/useCreateRfi";
import { useNavigate } from "react-router-dom";
import { ACCESS_TOKEN } from "../constants";

const CreateRfiForm = () => {
  const {
    formData,
    error,
    success,
    loading,
    projects,
    handleChange,
    handleSubmit,
  } = useCreateRfi();

  return (
    <div className="w-full max-w-xs">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Create New RFI
        </h2>

        {/* {error && (
          <div className="mb-4 flex items-start bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <svg
              className="w-5 h-5 mr-2 mt-1 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z"
              />
            </svg>
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-start bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            <svg
              className="w-5 h-5 mr-2 mt-1 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p>RFI created successfully!</p>
          </div>
        )} */}

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">
              Project Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Project */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Project
                </label>
                <select
                  name="project"
                  value={formData.project}
                  onChange={handleChange}
                  required
                  className="mb-4 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select Project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_number} - {project.project_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Number */}
              <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Project Number
                  </label>
                  <input
                    type="text"
                    name="project_number"
                    value={formData.project_number}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                    placeholder="Project Number"
                    required
                  />
                </div>
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Project Name
                </label>
                <input
                  type="text"
                  name="project_name"
                  value={formData.project_name}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="Project Name"
                  required
                />
              </div>

              {/* Trade / Discipline */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Discipline
                </label>
                <select
                  name="trade"
                  value={formData.trade}
                  onChange={handleChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                >
                  <option value="M">Mechanical</option>
                  <option value="E">Electrical</option>
                  <option value="C">Civil</option>
                </select>
              </div>

              {/* RFI Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  RFI Name
                </label>
                <input
                  type="text"
                  name="rfi_name"
                  value={formData.rfi_name}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="RFI Name"
                  required
                />
              </div>

              {/* RFI Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  RFI Number
                </label>
                <input
                  type="text"
                  name="rfi_number"
                  value={formData.rfi_number}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="RFI Number"
                  required
                />
              </div>

              {/* Client RFI Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Client RFI Number
                </label>
                <input
                  type="text"
                  name="client_rfi_number"
                  value={formData.client_rfi_number || ""}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="Client RFI Number"
                />
              </div>

              {/* Subject */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Subject
                </label>
                <textarea
                  name="subject"
                  value={formData.subject || ""}
                  onChange={handleChange}
                  rows={3}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="Subject"
                ></textarea>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status || ""}
                  onChange={handleChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                >
                  <option value="">Select Status</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              {/* Project Manager */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Project Manager
                </label>
                <input
                  type="text"
                  name="project_manager"
                  value={formData.project_manager}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="Project Manager"
                  required
                />
              </div>

              {/* Assigned To */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Assigned To
                </label>
                <input
                  type="text"
                  name="assigned_to"
                  value={formData.assigned_to}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="Assigned To"
                  required
                />
              </div>

              {/* Received Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Received Date
                </label>
                <input
                  type="date"
                  name="received_date"
                  value={formData.received_date}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  required
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Due Date
                </label>
                <input
                  type="date"
                  name="due_date"
                  value={formData.due_date}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  required
                />
              </div>

              {/* Remarks */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Remarks
                </label>
                <textarea
                  name="remarks"
                  value={formData.remarks}
                  onChange={handleChange}
                  rows={3}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                  placeholder="Remarks"
                ></textarea>
              </div>

              {/* File Upload */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Attachments
                </label>
                <input
                  type="file"
                  name="attachments"
                  multiple
                  onChange={(e) => {
                    setFormData({ ...formData, attachments: e.target.files });
                  }}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Create RFI"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRfiForm;
