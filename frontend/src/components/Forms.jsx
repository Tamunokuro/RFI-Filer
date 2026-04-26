import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import toast from "../toast";
import { useAuth } from "../context/Auth";
import {
  ArrowRightIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/20/solid";
import {
  UserIcon,
  EnvelopeIcon,
  BuildingOffice2Icon,
  PhoneIcon,
  BriefcaseIcon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import "../styles/Forms.css";
import LoadingIndicator from "./LoadingIndicator";

const roleOptions = [
  "Project Designer",
  "Sub Consultant",
  "Client",
  "Contractor",
  "Contract Administrator",
  "Project Manager",
];

const disciplineOptions = [
  "",
  "Electrical",
  "Mechanical",
  "Civil",
  "Structural",
  "Architectural",
];

const Form = ({ route, method }) => {
  const isLogin = method === "login";
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState(
    isLogin
      ? {
          username: "",
          password: "",
        }
      : {
          username: "",
          email: "",
          password: "",
          confirm_password: "",
          name: "",
          company: "",
          discipline: "",
          role: "",
          phone: "",
        }
  );

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const title = isLogin ? "Welcome back!" : "Create your account";
  const buttonText = isLogin ? "Login" : "Register";

  const handleChange = (e) => {
    setError("");
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const showBackendErrors = (errors) => {
    if (!errors) {
      const msg = "Something went wrong.";
      setError(msg);
      toast.error(msg);
      return;
    }

    if (typeof errors === "string") {
      setError(errors);
      toast.error(errors);
      return;
    }

    if (errors.detail) {
      setError(errors.detail);
      toast.error(errors.detail);
      return;
    }

    const messages = [];

    Object.entries(errors).forEach(([field, value]) => {
      if (Array.isArray(value)) {
        value.forEach((msg) => messages.push(`${field}: ${msg}`));
      } else if (typeof value === "string") {
        messages.push(`${field}: ${value}`);
      }
    });

    if (messages.length > 0) {
      setError(messages[0]);
      messages.forEach((msg) => toast.error(msg));
    } else {
      const msg = "Please check your input.";
      setError(msg);
      toast.error(msg);
    }
  };

  const handleLogin = async () => {
    const response = await api.post(route, {
      username: formData.username,
      password: formData.password,
    });

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
  };

  const handleRegister = async () => {
    if (formData.password !== formData.confirm_password) {
      const msg = "Passwords do not match.";
      setError(msg);
      toast.error(msg);
      return;
    }

    await api.post(route, formData);
    toast.success("Account created successfully. Please log in.");
    navigate("/login");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        await handleLogin();
      } else {
        await handleRegister();
      }
    } catch (err) {
      const backendErrors = err.response?.data;

      if (isLogin) {
        const message =
          backendErrors?.detail || "Invalid username or password.";
        setError(message);
        toast.error(message);
      } else {
        showBackendErrors(backendErrors);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`form-wrapper mt-10 mx-auto p-6 ${
        isLogin ? "max-w-md" : "max-w-2xl"
      }`}
    >
      <h1 className="text-3xl font-bold text-center text-blue-950 mb-6">
        {title}
      </h1>

      <div className="form-background"></div>
      <div className="form-decoration decoration-1"></div>
      <div className="form-decoration decoration-2"></div>

      <div className="form-container">
        {error && (
          <div className="flex justify-center mb-4">
            <p className="text-sm text-red-600 flex items-center gap-2 text-center">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              {error}
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`mt-6 mx-auto p-6 ${isLogin ? "max-w-md" : "max-w-2xl"}`}
        >
          <div
            className={
              isLogin ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"
            }
          >
            <div className={isLogin ? "" : ""}>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-900"
              >
                Username
              </label>
              <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                  placeholder="janesmith"
                  required
                />
              </div>
            </div>

            {!isLogin && (
              <>
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Full name
                  </label>
                  <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                    <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                      placeholder="Jane Smith"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Email
                  </label>
                  <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                    <EnvelopeIcon className="h-5 w-5 text-gray-400 mr-2" />
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="company"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Company
                  </label>
                  <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                    <BuildingOffice2Icon className="h-5 w-5 text-gray-400 mr-2" />
                    <input
                      type="text"
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleChange}
                      className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                      placeholder="Your company"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="role"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Role
                  </label>
                  <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                    <BriefcaseIcon className="h-5 w-5 text-gray-400 mr-2" />
                    <select
                      id="role"
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      className="block w-full py-2 text-base text-gray-900 bg-transparent focus:outline-none"
                      required
                    >
                      <option value="">Select role</option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="discipline"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Discipline
                  </label>
                  <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                    <WrenchScrewdriverIcon className="h-5 w-5 text-gray-400 mr-2" />
                    <select
                      id="discipline"
                      name="discipline"
                      value={formData.discipline}
                      onChange={handleChange}
                      className="block w-full py-2 text-base text-gray-900 bg-transparent focus:outline-none"
                    >
                      <option value="">Select discipline</option>
                      {disciplineOptions
                        .filter((d) => d !== "")
                        .map((discipline) => (
                          <option key={discipline} value={discipline}>
                            {discipline}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Phone
                  </label>
                  <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                    <PhoneIcon className="h-5 w-5 text-gray-400 mr-2" />
                    <input
                      type="text"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                      placeholder="431-000-0000"
                    />
                  </div>
                </div>
              </>
            )}

            <div className={!isLogin ? "" : ""}>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-900"
              >
                Password
              </label>
              <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                <LockClosedIcon className="h-5 w-5 text-gray-400 mr-2" />
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            {!isLogin && (
              <div className="md:col-span-2">
                <label
                  htmlFor="confirm_password"
                  className="block text-sm font-medium text-gray-900"
                >
                  Confirm password
                </label>
                <div className="mt-2 flex items-center rounded-md bg-white px-3 outline outline-1 outline-gray-300 focus-within:outline-2 focus-within:outline-indigo-600">
                  <LockClosedIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <input
                    type="password"
                    id="confirm_password"
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleChange}
                    className="block w-full py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent"
                    placeholder="Re-enter password"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          {loading && <LoadingIndicator />}

          <button
            className="flex justify-center items-center w-full gap-2 mt-6 py-2 bg-blue-950 text-white rounded hover:bg-indigo-950 disabled:opacity-70"
            type="submit"
            disabled={loading}
          >
            <span className="font-semibold">
              {loading
                ? isLogin
                  ? "Logging in..."
                  : "Creating account..."
                : buttonText}
            </span>
            {!loading && <ArrowRightIcon className="w-6 h-6" />}
          </button>

          <div className="mt-4 text-sm text-center">
            {isLogin ? (
              <>
                <p>
                  <Link
                    to="/forgot-password"
                    className="text-blue-700 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </p>
                <p className="mt-2">
                  Don&apos;t have an account?{" "}
                  <Link
                    to="/register"
                    className="text-blue-700 hover:underline"
                  >
                    Register
                  </Link>
                </p>
              </>
            ) : (
              <p>
                Already have an account?{" "}
                <Link to="/login" className="text-blue-700 hover:underline">
                  Login
                </Link>
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Form;
