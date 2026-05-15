import { useState } from "react";
import { Link } from "react-router-dom";
import { EnvelopeIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/20/solid";
import toast from "../toast";
import api from "../api";
import "../styles/Forms.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const res = await api.post("/api/auth/forgot-password/", { email });
      setInfo(res.data.detail);
      toast.success(res.data.detail);
    } catch (err) {
      const message =
        err.response?.data?.email?.[0] || "Unable to process request.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
    <div className="form-wrapper mt-10 max-w-md mx-auto p-6">
      <h1 className="text-3xl font-bold text-center text-blue-950 dark:text-indigo-200 mb-6">
        Forgot Password
      </h1>

      <div className="form-background"></div>
      <div className="form-decoration decoration-1"></div>
      <div className="form-decoration decoration-2"></div>

      <div className="form-container">
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
          Enter the email linked to your account and we’ll send you a password
          reset link.
        </p>

        {info && (
          <div className="flex justify-center mb-4">
            <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2 text-center">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              {info}
            </p>
          </div>
        )}

        {error && (
          <div className="flex justify-center mb-4">
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2 text-center">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500 dark:text-red-400" />
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 max-w-md mx-auto p-6">
          <div className="sm:col-span-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              Email address
            </label>

            <div className="mt-2">
              <div className="flex items-center rounded-md bg-white dark:bg-gray-700 px-3 outline outline-1 outline-gray-300 dark:outline-gray-600 focus-within:outline-2 focus-within:outline-indigo-500">
                <EnvelopeIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2" />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => {
                    setError("");
                    setInfo("");
                    setEmail(e.target.value);
                  }}
                  className="block w-full py-2 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none bg-transparent"
                  placeholder="you@example.com"
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
                Sending link...
              </span>
            ) : (
              <span className="font-semibold">Send Reset Link</span>
            )}
          </button>

          <div className="mt-5 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400 hover:underline"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
    </div>
  );
};

export default ForgotPassword;
