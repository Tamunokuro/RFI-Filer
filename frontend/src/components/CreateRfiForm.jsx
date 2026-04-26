import useCreateRfi from "../hooks/useCreateRfi";
import DateInput from "./DateSelector";

const CreateRfiForm = () => {
  const {
    formData,
    setFormData, // <-- new
    error,
    success,
    loading,
    projects,
    projectMembers, // <-- new
    handleChange,
    handleProjectSelect, // <-- new
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
              onChange={handleProjectSelect} // <-- use custom handler
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

          {/* Display + text fields (read-only where appropriate) */}
          {[
            { name: "project_number", label: "Project Number", ro: true },
            { name: "project_name", label: "Project Name", ro: true },
            { name: "rfi_name", label: "RFI Name" },
            { name: "project_manager", label: "Project Manager", ro: true },
            { name: "rfi_number", label: "RFI Number" },
          ].map(({ name, label, ro }) => (
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
                value={formData[name] ?? ""}
                onChange={handleChange}
                readOnly={!!ro}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
          ))}

          {/* Assigned To (multi-select fed by project members) */}
          <div>
            <label
              htmlFor="assigned_to"
              className="block text-sm font-medium text-gray-900"
            >
              Assigned To
            </label>
            <select
              id="assigned_to"
              name="assigned_to"
              multiple
              value={formData.assigned_to || []} // array of IDs
              onChange={handleChange} // hook handles multi-select
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            >
              {projectMembers.length === 0 && (
                <option disabled>No members found for this project</option>
              )}
              {projectMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.role ? ` — ${m.role}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Hold Ctrl/Cmd to select multiple.
            </p>
          </div>

          {/* Discipline / Trade */}
          <div>
            <label
              htmlFor="trade"
              className="block text-sm/6 font-medium text-gray-900"
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

          {/* Question */}
          <div>
            <label
              htmlFor="question"
              className="block text-sm font-medium text-gray-700"
            >
              Question
            </label>
            <textarea
              id="question"
              name="question"
              rows={3}
              value={formData.question}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
              placeholder="Describe the question or issue being raised..."
            />
          </div>

          {/* Proposed Solution */}
          <div>
            <label
              htmlFor="proposed_solution"
              className="block text-sm font-medium text-gray-700"
            >
              Proposed Solution
            </label>
            <textarea
              id="proposed_solution"
              name="proposed_solution"
              rows={3}
              value={formData.proposed_solution}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
              placeholder="Suggest a possible solution or approach..."
            />
          </div>

          {/* Attachments (optional) */}
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
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xls,.xlsx,.csv,.mp4,.mov,.webm,application/pdf,image/*,video/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFormData((prev) => ({
                  ...prev,
                  attachments: e.target.files,
                }));
              }}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              Allowed: PDF, images, Excel, CSV, video (MP4/MOV/WebM). Max 50 MB each.
            </p>
            {formData.attachments && formData.attachments.length > 0 && (
              <ul className="mt-2 text-xs text-gray-700 list-disc list-inside space-y-0.5">
                {Array.from(formData.attachments).map((f) => (
                  <li key={f.name + f.size}>
                    {f.name}{" "}
                    <span className="text-gray-400">
                      ({Math.round(f.size / 1024)} KB)
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
