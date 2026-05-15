import useCreateRfi from "../hooks/useCreateRfi";
import DateInput from "./DateSelector";
import AssigneePicker from "./AssigneePicker";

const CreateRfiForm = () => {
  const {
    formData,
    setFormData,
    loading,
    projects,
    projectMembers,
    closedRfis,
    handleChange,
    handleProjectSelect,
    handleParentRfiChange,
    handleDesignerChange,
    handleContractAdminChange,
    handleSubmit,
  } = useCreateRfi();

  // Filter project members by role for each picker
  const designerMembers = projectMembers.filter(
    (m) => m.role === "Project Designer"
  );
  const contractAdminMembers = projectMembers.filter(
    (m) => m.role === "Contract Administrator"
  );

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8">
        <h2 className="text-3xl font-bold text-left text-indigo-950 dark:text-indigo-200 mb-8">
          Create New RFI
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project */}
          <div>
            <label
              htmlFor="project"
              className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100"
            >
              Project
            </label>
            <select
              id="project"
              name="project"
              value={formData.project}
              onChange={handleProjectSelect}
              required
              className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            >
              <option value="">Select Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_number} - {project.project_name}
                </option>
              ))}
            </select>
          </div>

          {/* Display + text fields */}
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
                className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100"
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
                required
                className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
              {name === "rfi_number" && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Auto-suggested from existing RFIs — you can edit it if needed.
                </p>
              )}
            </div>
          ))}

          {/* Supersedes (parent RFI) — shown only when closed RFIs exist for this project */}
          {closedRfis.length > 0 && (
            <div>
              <label
                htmlFor="parent_rfi"
                className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100"
              >
                Supersedes <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                Select a previously closed RFI that this revision supersedes.
                The RFI number will be updated to a .1, .2, etc. suffix.
              </p>
              <select
                id="parent_rfi"
                name="parent_rfi"
                value={formData.parent_rfi}
                onChange={e => handleParentRfiChange(e.target.value)}
                className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              >
                <option value="">— None (new RFI) —</option>
                {closedRfis.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.rfi_number}: {r.rfi_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Designers */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              Designers
              <span className="ml-1 text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              Project Designers responsible for answering this RFI.
            </p>
            <AssigneePicker
              members={designerMembers}
              value={formData.designers || []}
              onChange={handleDesignerChange}
              emptyMessage="No Project Designers in this project"
            />
          </div>

          {/* Contract Administrators */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              Contract Administrators
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              Contract Administrators overseeing timelines and compliance.
            </p>
            <AssigneePicker
              members={contractAdminMembers}
              value={formData.contract_administrators || []}
              onChange={handleContractAdminChange}
              emptyMessage="No Contract Administrators in this project"
            />
          </div>

          {/* Discipline / Trade */}
          <div>
            <label
              htmlFor="trade"
              className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100"
            >
              Discipline
            </label>
            <select
              name="trade"
              id="trade"
              value={formData.trade}
              onChange={handleChange}
              className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            >
              <option value="M">Mechanical</option>
              <option value="E">Electrical</option>
              <option value="C">Civil</option>
              <option value="S">Structural</option>
              <option value="P">Architectural</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label
              htmlFor="priority"
              className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100"
            >
              Priority
            </label>
            <select
              name="priority"
              id="priority"
              value={formData.priority}
              onChange={handleChange}
              className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-base text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            >
              <option value="low">🟢 Low</option>
              <option value="medium">🔵 Medium</option>
              <option value="high">🟠 High</option>
              <option value="critical">🔴 Critical</option>
            </select>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              How urgently does this RFI need a response?
            </p>
          </div>

          {/* Dates */}
          <div className="flex gap-4">
            <DateInput
              label="Received Date"
              name="received_date"
              value={formData.received_date}
              onChange={handleChange}
              required
            />

            <div className="flex-1">
              <DateInput
                label="Due Date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                required
              />
              {formData.project && (
                <p className="mt-1 text-xs text-indigo-500 dark:text-indigo-400">
                  ⏱ Auto-set: {formData.sla_days ?? 14} days from received
                  {!formData.received_date && " (select a received date first)"}
                </p>
              )}
            </div>
          </div>

          {/* Question */}
          <div>
            <label
              htmlFor="question"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Question
              <span className="ml-1 text-red-500">*</span>
            </label>
            <textarea
              id="question"
              name="question"
              rows={3}
              value={formData.question}
              onChange={handleChange}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
              placeholder="Describe the question or issue being raised..."
            />
          </div>

          {/* Proposed Solution */}
          <div>
            <label
              htmlFor="proposed_solution"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Proposed Solution
              <span className="ml-1 text-red-500">*</span>
            </label>
            <textarea
              id="proposed_solution"
              name="proposed_solution"
              rows={3}
              value={formData.proposed_solution}
              onChange={handleChange}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 pl-3 py-2"
              placeholder="Suggest a possible solution or approach..."
            />
          </div>

          {/* ── Drawing & Spec Reference ─────────────────────────────── */}
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide">
                References <span className="ml-1 text-xs font-normal text-gray-400 normal-case">(optional)</span>
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Link this RFI to a specific drawing or specification section.
              </p>
            </div>

            {/* Drawing row */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Drawing</p>
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Drawing Number</label>
                  <input
                    type="text"
                    name="drawing_number"
                    value={formData.drawing_number}
                    onChange={handleChange}
                    placeholder="e.g. A-101"
                    className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Revision</label>
                  <input
                    type="text"
                    name="drawing_revision"
                    value={formData.drawing_revision}
                    onChange={handleChange}
                    placeholder="e.g. Rev B"
                    className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Drawing Title</label>
                  <input
                    type="text"
                    name="drawing_title"
                    value={formData.drawing_title}
                    onChange={handleChange}
                    placeholder="e.g. Ground Floor Plan"
                    className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                  />
                </div>
              </div>
            </div>

            {/* Spec row */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Specification</p>
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Section Number
                  </label>
                  <input
                    type="text"
                    name="spec_section"
                    value={formData.spec_section}
                    onChange={handleChange}
                    placeholder="e.g. 03 30 00"
                    className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Section Title</label>
                  <input
                    type="text"
                    name="spec_section_title"
                    value={formData.spec_section_title}
                    onChange={handleChange}
                    placeholder="e.g. Cast-in-Place Concrete"
                    className="block w-full rounded-md bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label
              htmlFor="attachments"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Attachments
            </label>
            <input
              type="file"
              id="attachments"
              name="attachments"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xls,.xlsx,.csv,.mp4,.mov,.webm,application/pdf,image/*,video/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFormData((prev) => ({
                  ...prev,
                  attachments: event.target.files,
                }));
              }}
              className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/40 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/60"
            />

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Allowed: PDF, images, Excel, CSV, video (MP4/MOV/WebM). Max 50 MB
              each.
            </p>

            {formData.attachments && formData.attachments.length > 0 && (
              <ul className="mt-2 text-xs text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
                {Array.from(formData.attachments).map((file) => (
                  <li key={`${file.name}-${file.size}`}>
                    {file.name}{" "}
                    <span className="text-gray-400 dark:text-gray-500">
                      ({Math.round(file.size / 1024)} KB)
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
