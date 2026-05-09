import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN } from "../constants";
import toast from "../toast";

const useCreateRfi = () => {
  const navigate = useNavigate();

  const initialForm = {
    project: "",
    project_number: "",        // display only
    project_name: "",          // display only
    project_manager: "",       // display only
    sla_days: 14,              // mirrors selected project's SLA — drives auto due-date
    priority: "medium",
    trade: "M",
    rfi_name: "",
    rfi_number: "",
    designers: [],             // array of Member IDs
    contract_administrators: [], // array of Member IDs
    received_date: "",
    due_date: "",
    question: "",
    proposed_solution: "",
    // Drawing & spec references (all optional)
    drawing_number:    "",
    drawing_revision:  "",
    drawing_title:     "",
    spec_section:      "",
    spec_section_title: "",
    attachments: null,         // FileList or Array from <input type="file" multiple>
  };

  const [formData, setFormData] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);

  // Load projects
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchProjects = async () => {
      try {
        const res = await api.get("/api/projects/");
        if (Array.isArray(res.data)) {
          setProjects(res.data);
        } else {
          setError("Invalid response format from server.");
          setProjects([]);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          setError("Authentication failed. Please log in again.");
          navigate("/login");
        } else {
          setError(err.response?.data?.message || "Failed to load projects");
        }
      }
    };

    fetchProjects();
  }, [navigate]);

  // When a project is chosen: fill display fields, fetch members + next RFI number
  const handleProjectSelect = async (e) => {
    const value = e.target.value;
    const projectId = value ? Number(value) : "";

    const proj = projects.find((p) => p.id === projectId);

    const sla = proj?.sla_days ?? 14;
    setFormData((prev) => {
      // If received_date is already filled, recompute due date with the new SLA
      let due = prev.due_date;
      if (prev.received_date) {
        const d = new Date(prev.received_date + "T00:00:00");
        d.setDate(d.getDate() + sla);
        due = d.toISOString().slice(0, 10);
      }
      return {
        ...prev,
        project: projectId,
        project_number: proj?.project_number || "",
        project_name:   proj?.project_name   || "",
        project_manager: proj?.project_manager_name || "",
        sla_days: sla,
        due_date: due,
        rfi_number: "", // clear while fetching suggestion
        designers: [],
        contract_administrators: [],
      };
    });

    setProjectMembers([]);

    if (projectId) {
      try {
        const [membersRes, nextRfiRes] = await Promise.all([
          api.get(`/api/projects/${projectId}/members/`),
          api.get(`/api/projects/${projectId}/next-rfi-number/`),
        ]);
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
        setFormData((prev) => ({
          ...prev,
          rfi_number: nextRfiRes.data.next_rfi_number ?? "",
        }));
      } catch {
        setProjectMembers([]);
      }
    }
  };

  // Generic field handler + multi-select support
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "project") {
      // If you decide not to use handleProjectSelect on the select element,
      // we still support project change here (no member fetch in this path).
      const proj = projects.find((p) => p.id.toString() === value);
      setFormData((prev) => ({
        ...prev,
        project: value ? Number(value) : "",
        project_number: proj?.project_number || "",
        project_name:   proj?.project_name   || "",
        project_manager: proj?.project_manager_name || "",
        sla_days: proj?.sla_days ?? 14,
        designers: [],
        contract_administrators: [],
      }));
      return;
    }

    // Auto-fill due date from SLA whenever received date changes
    if (name === "received_date" && value) {
      setFormData((prev) => {
        const sla = prev.sla_days ?? 14;
        const d = new Date(value + "T00:00:00");
        d.setDate(d.getDate() + sla);
        return { ...prev, received_date: value, due_date: d.toISOString().slice(0, 10) };
      });
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Client-side validation
  const validateForm = () => {
    const errors = [];
    if (!formData.project) errors.push("Project is required");
    if (!formData.rfi_name) errors.push("RFI name is required");
    if (!formData.rfi_number) errors.push("RFI number is required");
    // project_manager is display-only; don't require it
    if (!formData.designers || formData.designers.length === 0)
      errors.push("At least one Designer is required");
    if (!formData.received_date) errors.push("Received date is required");
    if (!formData.due_date) errors.push("Due date is required");
    if (!formData.question || !formData.question.trim())
      errors.push("Question is required");
    if (!formData.proposed_solution || !formData.proposed_solution.trim())
      errors.push("Proposed solution is required");

    if (formData.received_date && formData.due_date) {
      const received = new Date(formData.received_date);
      const due = new Date(formData.due_date);
      if (due < received) errors.push("Due date must be after received date");
    }
    return errors;
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      // Fire one toast per error so they are itemised and always shown,
      // even if the same errors appear on a repeated submit attempt.
      validationErrors.forEach((msg) => toast.error(msg));
      setError(validationErrors.join(" · "));
      setLoading(false);
      return;
    }

    // Send only what the backend expects
    const payload = {
      project: formData.project,
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
      const { data: rfi } = await api.post("/api/rfis/", payload, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN)}`,
        },
      });

      const files = formData.attachments
        ? Array.from(formData.attachments)
        : [];
      if (files.length > 0 && rfi?.id) {
        const fd = new FormData();
        files.forEach((f) => fd.append("file", f));
        try {
          await api.post(`/api/rfis/${rfi.id}/attachments/`, fd);
        } catch (uploadErr) {
          const detail =
            uploadErr.response?.data?.detail ||
            "RFI created but some attachments failed to upload.";
          toast.error(detail);
          setError(detail);
        }
      }

      toast.success("RFI created successfully!");
      setSuccess(true);
      setFormData(initialForm);
      setProjectMembers([]);
      navigate("/rfis");
    } catch (err) {
      if (err.response) {
        // Flatten all field-level errors from the backend into individual toasts
        const messages = Object.entries(err.response.data || {}).flatMap(
          ([field, errs]) =>
            Array.isArray(errs)
              ? errs.map((e) => `${field}: ${e}`)
              : [`${field}: ${String(errs)}`]
        );
        if (messages.length > 0) {
          messages.forEach((msg) => toast.error(msg));
          setError(messages.join(" · "));
        } else {
          const fallback = "Failed to create RFI. Please check your input.";
          toast.error(fallback);
          setError(fallback);
        }
      } else {
        const msg = "Network error. Please check your connection.";
        toast.error(msg);
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Called by AssigneePicker components
  const handleDesignerChange = (newIds) => {
    setFormData((prev) => ({ ...prev, designers: newIds }));
  };

  const handleContractAdminChange = (newIds) => {
    setFormData((prev) => ({ ...prev, contract_administrators: newIds }));
  };

  return {
    formData,
    setFormData,
    error,
    success,
    loading,
    projects,
    projectMembers,
    handleChange,
    handleProjectSelect,
    handleDesignerChange,
    handleContractAdminChange,
    handleSubmit,
  };
};

export default useCreateRfi;
