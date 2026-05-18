import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import toast from "../toast";
import { useAuth } from "../context/Auth";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import {
  UserIcon,
  EnvelopeIcon,
  BuildingOffice2Icon,
  PhoneIcon,
  BriefcaseIcon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import LoadingIndicator from "./LoadingIndicator";
import "../styles/Forms.css";

const roleOptions = [
  "Project Designer",
  "Sub Consultant",
  "Client",
  "Contractor",
  "Contract Administrator",
  "Project Manager",
];

const disciplineOptions = [
  "Electrical",
  "Mechanical",
  "Civil",
  "Structural",
  "Architectural",
];

const FEATURES = [
  "Real-time RFI status tracking",
  "Team collaboration & threaded comments",
  "Audit-ready documentation",
  "Due-date reminders & notifications",
];

/* ── Shared field wrapper ─────────────────────────────────────────────────── */
const Field = ({ label, children, colSpan2 = false }) => (
  <div className={colSpan2 ? "md:col-span-2" : ""}>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

const inputBase =
  "flex items-center rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition";

const inputText =
  "block w-full py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none bg-transparent";

const iconClass = "h-4 w-4 text-gray-400 dark:text-gray-500 mr-2.5 shrink-0";

/* ── Form component ───────────────────────────────────────────────────────── */
const Form = ({ route, method }) => {
  const isLogin = method === "login";
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState(
    isLogin
      ? { username: "", password: "" }
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    setError("");
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const showBackendErrors = (errors) => {
    if (!errors) { toast.error("Something went wrong."); setError("Something went wrong."); return; }
    if (typeof errors === "string") { toast.error(errors); setError(errors); return; }
    if (errors.detail) { toast.error(errors.detail); setError(errors.detail); return; }
    const messages = [];
    Object.entries(errors).forEach(([field, value]) => {
      if (Array.isArray(value)) value.forEach((msg) => messages.push(`${field}: ${msg}`));
      else if (typeof value === "string") messages.push(`${field}: ${value}`);
    });
    if (messages.length > 0) { setError(messages[0]); messages.forEach((msg) => toast.error(msg)); }
    else { toast.error("Please check your input."); setError("Please check your input."); }
  };

  const handleLogin = async () => {
    const response = await api.post(route, { username: formData.username, password: formData.password });
    const { access, refresh } = response.data;
    localStorage.setItem(ACCESS_TOKEN, access);
    localStorage.setItem(REFRESH_TOKEN, refresh);
    const meResponse = await api.get("/api/me/", { headers: { Authorization: `Bearer ${access}` } });
    const user = meResponse.data;
    login({
      access, refresh,
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
      if (isLogin) await handleLogin();
      else await handleRegister();
    } catch (err) {
      const backendErrors = err.response?.data;
      if (isLogin) {
        const message = backendErrors?.detail || "Invalid username or password.";
        setError(message);
        toast.error(message);
      } else {
        showBackendErrors(backendErrors);
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Register layout ──────────────────────────────────────────────────── */
  if (!isLogin) {
    return (
      <div className="h-screen flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left: branding panel ─────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col justify-between bg-blue-950 lg:w-[38%] px-12 py-14 relative overflow-hidden flex-shrink-0">
          {/* Decorative circles */}
          <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-800/30" />
          <div className="absolute bottom-10 right-0 h-48 w-48 rounded-full bg-blue-800/20" />

          {/* Logo */}
          <div className="relative z-10">
            <div className="flex items-center gap-2.5 mb-12">
              <div className="h-9 w-9 rounded-xl bg-indigo-500 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm tracking-tight">RF</span>
              </div>
              <span className="text-white font-bold text-xl tracking-tight">RFI Filer</span>
            </div>

            <h2 className="text-3xl font-bold text-white leading-snug">
              One platform<br />for your entire<br />RFI workflow.
            </h2>
            <p className="mt-4 text-blue-200/80 text-sm leading-relaxed max-w-xs">
              Join construction teams who use RFI Filer to collaborate,
              track, and resolve project requests from submission to resolution.
            </p>
          </div>

          {/* Feature list */}
          <div className="relative z-10 space-y-3">
            {FEATURES.map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <svg className="h-3 w-3 text-indigo-300" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-blue-100 text-sm">{feat}</span>
              </div>
            ))}
          </div>

          <p className="relative z-10 text-xs text-blue-400/70">
            © {new Date().getFullYear()} RFI Filer. All rights reserved.
          </p>
        </div>

        {/* ── Right: form panel ────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-900 flex flex-col justify-center items-center px-6 sm:px-10 py-5">
          {/* Subtle background circles */}
          <div className="absolute -top-28 -right-28 h-80 w-80 rounded-full bg-indigo-100/60 dark:bg-indigo-900/20 pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-blue-100/50 dark:bg-blue-900/15 pointer-events-none" />

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="h-8 w-8 rounded-xl bg-blue-950 flex items-center justify-center">
              <span className="text-white font-bold text-xs">RF</span>
            </div>
            <span className="text-blue-950 dark:text-indigo-200 font-bold text-lg">RFI Filer</span>
          </div>

          <div className="w-full max-w-xl">
            {/* Heading */}
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Fill in your details to get started
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-6 flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
                <ExclamationCircleIcon className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  {/* Username */}
                  <Field label="Username">
                    <div className={inputBase}>
                      <UserIcon className={iconClass} />
                      <input
                        type="text" name="username" id="username"
                        value={formData.username} onChange={handleChange}
                        className={inputText} placeholder="janesmith" required
                      />
                    </div>
                  </Field>

                  {/* Full name */}
                  <Field label="Full name">
                    <div className={inputBase}>
                      <UserIcon className={iconClass} />
                      <input
                        type="text" name="name" id="name"
                        value={formData.name} onChange={handleChange}
                        className={inputText} placeholder="Jane Smith" required
                      />
                    </div>
                  </Field>

                  {/* Email */}
                  <Field label="Email">
                    <div className={inputBase}>
                      <EnvelopeIcon className={iconClass} />
                      <input
                        type="email" name="email" id="email"
                        value={formData.email} onChange={handleChange}
                        className={inputText} placeholder="you@example.com" required
                      />
                    </div>
                  </Field>

                  {/* Company */}
                  <Field label="Company">
                    <div className={inputBase}>
                      <BuildingOffice2Icon className={iconClass} />
                      <input
                        type="text" name="company" id="company"
                        value={formData.company} onChange={handleChange}
                        className={inputText} placeholder="Your company"
                      />
                    </div>
                  </Field>

                  {/* Role */}
                  <Field label="Role">
                    <div className={inputBase}>
                      <BriefcaseIcon className={iconClass} />
                      <select
                        name="role" id="role"
                        value={formData.role} onChange={handleChange}
                        className={`${inputText} cursor-pointer`} required
                      >
                        <option value="">Select role</option>
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </Field>

                  {/* Discipline */}
                  <Field label="Discipline">
                    <div className={inputBase}>
                      <WrenchScrewdriverIcon className={iconClass} />
                      <select
                        name="discipline" id="discipline"
                        value={formData.discipline} onChange={handleChange}
                        className={`${inputText} cursor-pointer`}
                      >
                        <option value="">Select discipline (optional)</option>
                        {disciplineOptions.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </Field>

                  {/* Phone */}
                  <Field label="Phone">
                    <div className={inputBase}>
                      <PhoneIcon className={iconClass} />
                      <input
                        type="text" name="phone" id="phone"
                        value={formData.phone} onChange={handleChange}
                        className={inputText} placeholder="431-000-0000"
                      />
                    </div>
                  </Field>

                  {/* Password */}
                  <Field label="Password">
                    <div className={inputBase}>
                      <LockClosedIcon className={iconClass} />
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password" id="password"
                        value={formData.password} onChange={handleChange}
                        className={inputText} placeholder="Create a password" required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="ml-2 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword
                          ? <EyeSlashIcon className="h-4 w-4" />
                          : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>

                  {/* Confirm password — spans full width */}
                  <Field label="Confirm password" colSpan2>
                    <div className={inputBase}>
                      <LockClosedIcon className={iconClass} />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirm_password" id="confirm_password"
                        value={formData.confirm_password} onChange={handleChange}
                        className={inputText} placeholder="Re-enter password" required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="ml-2 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword
                          ? <EyeSlashIcon className="h-4 w-4" />
                          : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-blue-950 hover:bg-indigo-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {loading ? "Creating account..." : (
                    <>
                      Create account
                      <ArrowRightIcon className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Google SSO */}
                <div className="mt-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      or sign up with
                    </span>
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                  </div>
                  <a
                    href={`${import.meta.env.VITE_API_URL}/api/auth/start/google/`}
                    className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign up with Google
                  </a>
                </div>

                <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
                  Already have an account?{" "}
                  <Link
                    to="/login"
                    className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                  >
                    Sign in
                  </Link>
                </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── Login layout (fallback — /login now uses Login.jsx directly) ─────── */
  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-blue-950 via-indigo-600 to-indigo-400" />
        <div className="p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Welcome back</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username">
              <div className={inputBase}>
                <UserIcon className={iconClass} />
                <input
                  type="text" name="username" value={formData.username}
                  onChange={handleChange} className={inputText}
                  placeholder="janesmith" required
                />
              </div>
            </Field>
            <Field label="Password">
              <div className={inputBase}>
                <LockClosedIcon className={iconClass} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password" value={formData.password}
                  onChange={handleChange} className={inputText}
                  placeholder="••••••••" required
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="ml-2 shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none">
                  {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {loading && <LoadingIndicator />}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-950 hover:bg-indigo-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors">
              {loading ? "Signing in..." : <><span>Sign in</span><ArrowRightIcon className="w-4 h-4" /></>}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            <Link to="/forgot-password" className="text-indigo-600 dark:text-indigo-400 hover:underline">Forgot password?</Link>
            {" · "}
            <Link to="/register" className="text-indigo-600 dark:text-indigo-400 hover:underline">Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Form;
