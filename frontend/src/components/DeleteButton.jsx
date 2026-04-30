import React, { useState } from "react";
import api from "../api";
import { TrashIcon } from "@heroicons/react/24/solid";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

const RFiDeleteButton = ({
  pk,
  rfiSlug,
  rfiName,
  projectName,
  projectNumber,
  rfiNumber,
  onDelete,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setLoading(true);
    setError("");

    try {
      await api.delete(`/api/rfis/${pk}/`);
      setShowModal(false);
      if (onDelete) {
        onDelete(pk);
      }
    } catch (err) {
      console.error("Failed to delete RFI:", err);
      setError("Failed to delete RFI. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 font-semibold px-3 py-1.5 rounded"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Confirm Deletion
              </h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              Are you sure you want to delete the following RFI?
            </p>
            <ul className="text-sm text-gray-800 dark:text-gray-200 space-y-1 mb-4">
              <li>
                <span className="font-medium">RFI Name:</span> {rfiName}
              </li>
              <li>
                <span className="font-medium">RFI Number:</span> {rfiNumber}
              </li>
              <li>
                <span className="font-medium">Project Name:</span> {projectName}
              </li>
              <li>
                <span className="font-medium">Project Number:</span>{" "}
                {projectNumber}
              </li>
            </ul>

            {error && <p className="text-red-600 dark:text-red-400 text-sm mb-2">{error}</p>}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RFiDeleteButton;
