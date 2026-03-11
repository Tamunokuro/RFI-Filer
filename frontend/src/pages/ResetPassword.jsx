import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { LockClosedIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { ExclamationCircleIcon } from "@heroicons/react/20/solid";
import { toast } from "react-toastify";
import api from "../api";

const ResetPassword = () => {
  const { uid, token } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    password: "",
    confirm_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setError("");
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (formData.password !== formData.confirm_password) {
      const message = "Passwords do not match.";
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    try {
      const res = await api.post("/api/auth/reset-password/", {
        uid,
        token,
        password: formData.password,
        confirm_password: formData.confirm_password,
      });

      toast.success(res.data.detail);
      navigate("/login");
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.confirm_password?.[0] ||
        "Password reset failed.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-wrapper mt-10 max-w-md mx-auto p-6">
      <h1 className="text-3xl font-bold text-center text-blue-950 mb-6">
        Reset Password
      </h1>

      <div className="form-background"></div>
      <div className="form-decoration decoration-1"></div>
      <div className="form-decoration decoration-2"></div>

      <div className="form-container">
        <p className="text-sm text-gray-600 text-center mb-6">
          Choose a new password for your account.
        </p>

        {error && (
          <div className="flex justify-center mb-4">
            <p className="text-sm text-red-600 flex items-center gap-2 text-center">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 max-w-md mx-auto p-6">
          <div className="sm:col-span-4">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-900"
            >
              New password
            </label>

            <div className="mt-2">
              <div className="flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                <LockClosedIcon className="h-5 w-5 text-gray-400 mr-2" />
                <input
                  type="password"
                  name="password"
                  id="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  placeholder="Enter new password"
                  required
                />
              </div>
            </div>
          </div>

          <div className="sm:col-span-4 mt-4">
            <label
              htmlFor="confirm_password"
              className="block text-sm font-medium text-gray-900"
            >
              Confirm password
            </label>

            <div className="mt-2">
              <div className="flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                <LockClosedIcon className="h-5 w-5 text-gray-400 mr-2" />
                <input
                  type="password"
                  name="confirm_password"
                  id="confirm_password"
                  value={formData.confirm_password}
                  onChange={handleChange}
                  className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  placeholder="Re-enter new password"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex justify-center items-center w-full gap-2 mt-6 py-2 bg-blue-950 text-white rounded hover:bg-indigo-950 disabled:opacity-70"
          >
            {loading ? (
              <span className="flex items-center font-semibold">
                <span className="loading-spinner mr-2"></span>
                Resetting...
              </span>
            ) : (
              <span className="font-semibold">Reset Password</span>
            )}
          </button>

          <div className="mt-5 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
