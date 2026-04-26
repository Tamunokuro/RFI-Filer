import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api"; // Axios instance with token headers

const UpdateRfiForm = () => {
  const { pk } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    project_name: "",
    project_number: "",
    project_manager: "",
    assigned_to: [], // keep IDs as an array
    assigned_to_names: "", // <- derived display string
    trade: "",
    rfi_name: "",
    rfi_number: "",
    subject: "",
    received_date: "",
    due_date: "",
    question: "",
    proposed_solution: "",
    status: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch existing RFI data
  useEffect(() => {
    const fetchRfi = async () => {
      try {
        const { data } = await api.get(`/api/rfis/${pk}/`); // no slug in URL
        const names = Array.isArray(data.assigned_to_detail)
          ? data.assigned_to_detail.map((m) => m.name).join(", ")
          : "";

        setFormData((prev) => ({
          ...prev,
          project_name: data.project_name ?? "",
          project_number: data.project_number ?? "",
          project_manager:
            data.project_manager_name ?? prev.project_manager ?? "",
          assigned_to: Array.isArray(data.assigned_to) ? data.assigned_to : [],
          assigned_to_names: names,
          trade: data.trade ?? "",
          rfi_name: data.rfi_name ?? "",
          rfi_number: data.rfi_number ?? "",
          subject: data.subject ?? "",
          received_date: data.received_date ?? "",
          due_date: data.due_date ?? "",
          question: data.question ?? "",
          proposed_solution: data.proposed_solution ?? "",
          status: data.status ?? "",
        }));
      } catch (err) {
        setError("Failed to load RFI data.");
      }
    };
    fetchRfi();
  }, [pk]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // If you later switch Assigned To to a multi-select, handle arrays here.
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Send only fields the API expects; do not send *_names display-only fields
    const payload = {
      trade: formData.trade,
      rfi_name: formData.rfi_name,
      rfi_number: formData.rfi_number,
      assigned_to: formData.assigned_to, // remains array of IDs
      received_date: formData.received_date,
      due_date: formData.due_date,
      question: formData.question,
      proposed_solution: formData.proposed_solution,
    };

    try {
      await api.patch(`/api/rfis/${pk}/`, payload);
      navigate("/");
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
              readOnly
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
              disabled
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">
              Assigned To
            </label>
            <input
              type="text"
              name="assigned_to_names"
              value={formData.assigned_to_names}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              readOnly
            />
            {/* If you want to *edit* assignees here, replace the above with a multi-select
                bound to formData.assigned_to (array of IDs), just like the Create form. */}
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
              readOnly
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

          <div>
            <label className="block font-medium text-gray-700">Question</label>
            <textarea
              name="question"
              rows={3}
              value={formData.question}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              placeholder="Describe the question or issue being raised..."
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">
              Proposed Solution
            </label>
            <textarea
              name="proposed_solution"
              rows={3}
              value={formData.proposed_solution}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              placeholder="Suggest a possible solution or approach..."
            />
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
