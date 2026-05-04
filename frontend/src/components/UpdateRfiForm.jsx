import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import AssigneePicker from "./AssigneePicker";

const UpdateRfiForm = () => {
  const { pk } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    project: "",
    project_name: "",
    project_number: "",
    project_manager: "",
    designers: [],
    contract_administrators: [],
    priority: "medium",
    trade: "",
    rfi_name: "",
    rfi_number: "",
    received_date: "",
    due_date: "",
    question: "",
    proposed_solution: "",
    status: "",
  });

  const [projectMembers, setProjectMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch existing RFI data then load project members
  useEffect(() => {
    const fetchRfi = async () => {
      try {
        const { data } = await api.get(`/api/rfis/${pk}/`);

        const designerIds = Array.isArray(data.designers) ? data.designers : [];
        const caIds = Array.isArray(data.contract_administrators)
          ? data.contract_administrators
          : [];

        setFormData((prev) => ({
          ...prev,
          project: data.project ?? "",
          project_name: data.project_name ?? "",
          project_number: data.project_number ?? "",
          project_manager: data.project_manager_name ?? "",
          designers: designerIds,
          contract_administrators: caIds,
          priority: data.priority ?? "medium",
          trade: data.trade ?? "",
          rfi_name: data.rfi_name ?? "",
          rfi_number: data.rfi_number ?? "",
          received_date: data.received_date ?? "",
          due_date: data.due_date ?? "",
          question: data.question ?? "",
          proposed_solution: data.proposed_solution ?? "",
          status: data.status ?? "",
          // Drawing & spec references
          drawing_number:    data.drawing_number    ?? "",
          drawing_revision:  data.drawing_revision  ?? "",
          drawing_title:     data.drawing_title     ?? "",
          spec_section:      data.spec_section      ?? "",
          spec_section_title: data.spec_section_title ?? "",
        }));

        // Load project members so the pickers can show names
        if (data.project) {
          const membersRes = await api.get(`/api/projects/${data.project}/members/`);
          // Normalize ProjectMembership objects → { id, name, role } for AssigneePicker
          const rawMembers = Array.isArray(membersRes.data) ? membersRes.data : [];
          setProjectMembers(
            rawMembers.map((m) => ({
              id:         m.member?.id   ?? m.member_id,
              name:       m.member?.name ?? "",
              role:       m.role,
              discipline: m.discipline   ?? "",
            }))
          );
        }
      } catch {
        setError("Failed to load RFI data.");
      }
    };

    fetchRfi();
  }, [pk]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      priority: formData.priority,
      trade: formData.trade,
      rfi_name: formData.rfi_name,
      rfi_number: formData.rfi_number,
      designers: formData.designers,
      contract_administrators: formData.contract_administrators,
      received_date: formData.received_date,
      due_date: formData.due_date,
      question: formData.question,
      proposed_solution: formData.proposed_solution,
      drawing_number:    formData.drawing_number    || "",
      drawing_revision:  formData.drawing_revision  || "",
      drawing_title:     formData.drawing_title     || "",
      spec_section:      formData.spec_section      || "",
      spec_section_title: formData.spec_section_title || "",
    };

    try {
      await api.patch(`/api/rfis/${pk}/`, payload);
      navigate("/");
    } catch {
      setError("Update failed. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const designerMembers = projectMembers.filter(
    (m) => m.role === "Project Designer"
  );
  const contractAdminMembers = projectMembers.filter(
    (m) => m.role === "Contract Administrator"
  );

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8 shadow">
        <h2 className="text-2xl font-bold text-indigo-950 dark:text-indigo-200 mb-6">Update RFI</h2>

        {error && <p className="text-red-500 dark:text-red-400 mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Read-only project info */}
          {[
            { label: "Project Name",    name: "project_name",    ro: true },
            { label: "Project Number",  name: "project_number",  ro: true },
            { label: "Project Manager", name: "project_manager", ro: true },
          ].map(({ label, name, ro }) => (
            <div key={name}>
              <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">{label}</label>
              <input
                type="text"
                name={name}
                value={formData[name]}
                readOnly={ro}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              />
            </div>
          ))}

          {/* RFI Name */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">RFI Name</label>
            <input
              type="text"
              name="rfi_name"
              value={formData.rfi_name}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Trade / Discipline */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">Trade / Discipline</label>
            <select
              name="trade"
              value={formData.trade}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">— Select trade —</option>
              <option value="M">Mechanical</option>
              <option value="E">Electrical</option>
              <option value="C">Civil</option>
              <option value="S">Structural</option>
              <option value="P">Architectural</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">Priority</label>
            <select
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="low">🟢 Low</option>
              <option value="medium">🔵 Medium</option>
              <option value="high">🟠 High</option>
              <option value="critical">🔴 Critical</option>
            </select>
          </div>

          {/* RFI Number — locked */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">RFI Number</label>
            <input
              type="text"
              name="rfi_number"
              value={formData.rfi_number}
              disabled
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Designers */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm mb-1">
              Designers
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              Project Designers responsible for answering this RFI.
            </p>
            <AssigneePicker
              members={designerMembers}
              value={formData.designers}
              onChange={(ids) => setFormData((p) => ({ ...p, designers: ids }))}
              emptyMessage="No Project Designers in this project"
            />
          </div>

          {/* Contract Administrators */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm mb-1">
              Contract Administrators
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              Contract Administrators overseeing timelines and compliance.
            </p>
            <AssigneePicker
              members={contractAdminMembers}
              value={formData.contract_administrators}
              onChange={(ids) =>
                setFormData((p) => ({ ...p, contract_administrators: ids }))
              }
              emptyMessage="No Contract Administrators in this project"
            />
          </div>

          {/* Dates */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">Received Date</label>
              <input
                type="date"
                name="received_date"
                value={formData.received_date}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="flex-1">
              <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">Due Date</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          {/* Question */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">Question</label>
            <textarea
              name="question"
              rows={3}
              value={formData.question}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              placeholder="Describe the question or issue being raised…"
            />
          </div>

          {/* Proposed Solution */}
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 text-sm">Proposed Solution</label>
            <textarea
              name="proposed_solution"
              rows={3}
              value={formData.proposed_solution}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              placeholder="Suggest a possible solution or approach…"
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
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Spec row */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Specification</p>
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Section Number</label>
                  <input
                    type="text"
                    name="spec_section"
                    value={formData.spec_section}
                    onChange={handleChange}
                    placeholder="e.g. 03 30 00"
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-6 text-white bg-gradient-to-r from-blue-800 to-indigo-900 hover:from-blue-900 hover:to-indigo-950 rounded-md disabled:opacity-50 font-semibold transition duration-150"
          >
            {loading ? "Updating…" : "Update RFI"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UpdateRfiForm;
