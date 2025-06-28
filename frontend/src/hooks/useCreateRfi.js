import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN } from "../constants";

const useCreateRfi = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    project: "",
    project_number: "",
    project_name: "",
    trade: "M",
    rfi_name: "",
    rfi_number: "",
    project_manager: "",
    assigned_to: "",
    received_date: "",
    due_date: "",
    remarks: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN);
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchProjects = async () => {
      try {
        const response = await api.get("/api/projects/");
        if (response.data && Array.isArray(response.data)) {
          setProjects(response.data);
        } else if (
          response.data &&
          response.data.message === "There are no projects"
        ) {
          setError("No projects found. Please create a project first.");
          setProjects([]);
        } else {
          setError("Invalid response format from server");
        }
      } catch (err) {
        if (err.response) {
          if (err.response.status === 401) {
            setError("Authentication failed. Please log in again.");
            navigate("/login");
          } else {
            setError(err.response.data?.message || "Failed to load projects");
          }
        } else {
          setError("Network error. Please check your connection.");
        }
      }
    };

    fetchProjects();
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const validateForm = () => {
    const errors = [];

    if (!formData.project) errors.push("Project is required");
    // if (!formData.project_number) errors.push("Project number is required");
    // if (!formData.project_name) errors.push("Project name is required");
    if (!formData.rfi_name) errors.push("RFI name is required");
    if (!formData.rfi_number) errors.push("RFI number is required");
    if (!formData.project_manager) errors.push("Project manager is required");
    if (!formData.assigned_to) errors.push("Assigned to is required");
    if (!formData.received_date) errors.push("Received date is required");
    if (!formData.due_date) errors.push("Due date is required");

    // Validate dates
    if (formData.received_date && formData.due_date) {
      const received = new Date(formData.received_date);
      const due = new Date(formData.due_date);
      if (due < received) {
        errors.push("Due date must be after received date");
      }
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(". "));
      setLoading(false);
      return;
    }

    try {
      await api.post("/api/rfis-create/", formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN)}`,
        },
      });
      setSuccess(true);
      setFormData({
        project: "",
        project_number: "",
        project_name: "",
        trade: "M",
        rfi_name: "",
        rfi_number: "",
        project_manager: "",
        assigned_to: "",
        received_date: "",
        due_date: "",
        remarks: "",
      });
      navigate("/"); // Redirect to the home page
    } catch (err) {
      if (err.response) {
        const errorMessages = Object.entries(err.response.data)
          .map(
            ([field, errors]) =>
              `${field}: ${Array.isArray(errors) ? errors.join(", ") : errors}`
          )
          .join(". ");
        setError(
          errorMessages || "Failed to create RFI. Please check your input."
        );
      } else {
        setError("Network error. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    formData,
    error,
    success,
    loading,
    projects,
    handleChange,
    handleSubmit,
  };
};

export default useCreateRfi;
