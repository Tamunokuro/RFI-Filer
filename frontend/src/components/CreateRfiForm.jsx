import useCreateRfi from "../hooks/useCreateRfi";
import DateInput from "./DateSelector";

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
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8">
        <h2 className="text-3xl font-bold text-left text-indigo-950 mb-8">
          Create New RFI
        </h2>

        {error && (
          <p className="text-center text-red-600 font-medium mb-4">{error}</p>
        )}
        {success && (
          <p className="text-center text-green-600 font-medium mb-4">
            RFI created successfully!
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project */}
          <div>
            <label
              htmlFor="project"
              className="block text-sm/6 font-medium text-gray-900"
            >
              Project
            </label>
            <select
              id="project"
              name="project"
              value={formData.project}
              onChange={handleChange}
              required
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            >
              <option value="">Select Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_number} - {project.project_name}
                </option>
              ))}
            </select>
          </div>

          {/* Text Inputs */}
          {[
            { name: "project_number", label: "Project Number" },
            { name: "project_name", label: "Project Name" },
            { name: "rfi_name", label: "RFI Name" },
            { name: "project_manager", label: "Project Manager" },
            { name: "rfi_number", label: "RFI Number" },
            // { name: "client_rfi_number", label: "Client RFI Number" },
            { name: "assigned_to", label: "Assigned To" },
          ].map(({ name, label }) => (
            <div key={name}>
              <label
                htmlFor={name}
                className="block text-sm/6 font-medium text-gray-900"
              >
                {label}
              </label>
              <input
                type="text"
                name={name}
                id={name}
                value={formData[name]}
                onChange={handleChange}
                readOnly={
                  name === "project_number" ||
                  name === "project_name" ||
                  name === "project_manager"
                }
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                required={name !== "client_rfi_number"}
              />
            </div>
          ))}

          {/* Discipline */}
          <div>
            <label
              htmlFor="trade"
              className="block text-sm/6 font-medium text-gray-900 text-sm font-medium text-gray-700"
            >
              Discipline
            </label>
            <select
              name="trade"
              id="trade"
              value={formData.trade}
              onChange={handleChange}
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="M">Mechanical</option>
              <option value="E">Electrical</option>
              <option value="C">Civil</option>
              <option value="S">Structural</option>
              <option value="P">Architectural</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label
              htmlFor="subject"
              className="block text-sm font-medium text-gray-700"
            >
              Subject
            </label>
            <textarea
              id="subject"
              name="subject"
              rows={3}
              value={formData.subject}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
              placeholder="Enter the subject"
            ></textarea>
          </div>

          {/* Status */}
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-gray-700"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
            >
              <option value="">Select Status</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Dates */}
          <div className="flex justify-between space-x-4">
            <DateInput
              label="Received Date"
              name="received_date"
              value={formData.received_date}
              onChange={handleChange}
              required
            />

            <DateInput
              label="Due Date"
              name="due_date"
              value={formData.due_date}
              onChange={handleChange}
              required
            />
          </div>

          {/* Remarks */}
          <div>
            <label
              htmlFor="remarks"
              className="block text-sm font-medium text-gray-700"
            >
              Remarks
            </label>
            <textarea
              id="remarks"
              name="remarks"
              rows={3}
              value={formData.remarks}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
              placeholder="Any additional notes..."
            ></textarea>
          </div>

          {/* Attachments */}
          <div>
            <label
              htmlFor="attachments"
              className="block text-sm font-medium text-gray-700"
            >
              Attachments
            </label>
            <input
              type="file"
              id="attachments"
              name="attachments"
              multiple
              onChange={(e) => {
                setFormData({ ...formData, attachments: e.target.files });
              }}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 text-white bg-blue-900 rounded-md hover:bg-indigo-950 disabled:opacity-50 font-semibold"
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
