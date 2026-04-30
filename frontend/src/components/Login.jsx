import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import toast from "../toast";

import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/Auth";
import "../styles/Forms.css";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post("/api/token/", formData);
      const access = response.data.access;
      const refresh = response.data.refresh;

      localStorage.setItem(ACCESS_TOKEN, access);
      localStorage.setItem(REFRESH_TOKEN, refresh);

      const meResponse = await api.get("/api/me/", {
        headers: {
          Authorization: `Bearer ${access}`,
        },
      });

      const user = meResponse.data;

      login({
        access,
        refresh,
        username: user.username,
        displayName: user.member?.name || user.username,
        memberId: user.member?.id || "",
        role: user.member?.role || "",
      });

      toast.success("Login successful.");
      navigate("/");
    } catch (err) {
      console.error(err);

      const message =
        err.response?.data?.detail || "Invalid username or password";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
    <div className="form-wrapper mt-10 max-w-md mx-auto p-6">
      <h1 className="text-3xl font-bold text-center text-blue-950 dark:text-indigo-200 mb-6">
        Welcome back!
      </h1>

      <div className="form-background"></div>
      <div className="form-decoration decoration-1"></div>
      <div className="form-decoration decoration-2"></div>

      <div className="form-container">
        <form onSubmit={handleSubmit} className="mt-10 max-w-md mx-auto p-6">
          <div className="sm:col-span-4">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              Username
            </label>

            <div className="mt-2">
              <div className="flex items-center rounded-md bg-white dark:bg-gray-700 pl-3 outline-1 outline-gray-300 dark:outline-gray-600 focus-within:outline-2 focus-within:outline-indigo-600">
                <div className="shrink-0 text-base text-gray-500 dark:text-gray-400 select-none">
                  Filer/
                </div>

                <input
                  type="text"
                  name="username"
                  id="username"
                  onChange={handleChange}
                  value={formData.username}
                  className="block min-w-0 grow py-1.5 pr-3 pl-1 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none bg-transparent"
                  placeholder="janesmith"
                  required
                />
              </div>
            </div>
          </div>

          <div className="sm:col-span-4 mt-4">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              Password
            </label>

            <div className="mt-2">
              <div className="flex items-center rounded-md bg-white dark:bg-gray-700 pl-3 pr-2 outline-1 outline-gray-300 dark:outline-gray-600 focus-within:outline-2 focus-within:outline-indigo-600">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  id="password"
                  onChange={handleChange}
                  value={formData.password}
                  className="block min-w-0 grow py-1.5 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none bg-transparent"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="ml-2 shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 text-sm">
            <Link
              to="/forgot-password"
              className="text-blue-700 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex justify-center items-center w-full gap-2 mt-6 py-2 bg-blue-950 text-white rounded hover:bg-indigo-950"
          >
            {loading ? (
              <span className="flex items-center font-semibold">
                <span className="loading-spinner mr-2"></span>
                Logging in...
              </span>
            ) : (
              <span className="font-semibold">Login</span>
            )}

            <ArrowRightIcon className="w-6 h-6" />
          </button>

          <p className="mt-4 text-sm text-center dark:text-gray-300">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="text-blue-700 hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
    </div>
  );
};

export default Login;
