import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api"; // Axios instance with token headers

const UpdateRfiForm = () => {
  const { pk, slug } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    project_name: "",
    project_number: "",
    project_manager: "",
    assigned_to: "",
    trade: "",
    rfi_name: "",
    rfi_number: "",
    subject: "",
    received_date: "",
    due_date: "",
    remarks: "",
    status: "",
    // Add all other necessary fields
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch existing RFI data
  useEffect(() => {
    const fetchRfi = async () => {
      try {
        const response = await api.get(`/api/rfis/${pk}/${slug}/`);
        setFormData(response.data);
      } catch (err) {
        setError("Failed to load RFI data.");
      }
    };
    fetchRfi();
  }, [pk, slug]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.patch(`/api/rfis/${pk}/${slug}/`, formData);
      navigate("/"); // Redirect to RFI list page
    } catch (err) {
      setError("Update failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8">
        <h2 className="text-2xl font-bold text-indigo-950 mb-6">Update RFI</h2>

        {error && <p className="text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-medium text-gray-700">
              Project Name
            </label>
            <input
              type="text"
              name="project_name"
              value={formData.project_name}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">RFI Name</label>
            <input
              type="text"
              name="rfi_name"
              value={formData.rfi_name}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">
              RFI Number
            </label>
            <input
              type="text"
              name="rfi_number"
              value={formData.rfi_number}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              disabled // RFI number should not be editable
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">
              Assigned To
            </label>
            <input
              type="text"
              name="assigned_to"
              value={formData.assigned_to}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">
              Project Manager
            </label>
            <input
              type="text"
              name="project_manager"
              value={formData.project_manager}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </div>

          <div className="flex justify-between space-x-4">
            <div>
              <label className="block font-medium text-gray-700">
                Received Date
              </label>
              <input
                type="date"
                name="received_date"
                value={formData.received_date}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700">
                Due Date
              </label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-700 text-white px-4 py-2 rounded hover:bg-indigo-800"
          >
            {loading ? "Updating..." : "Update RFI"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UpdateRfiForm;
