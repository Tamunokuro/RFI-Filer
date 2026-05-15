import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import toast from "../toast";

import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/Auth";
import "../styles/Forms.css";

const SSO_ERROR_MESSAGES = {
  google_not_configured:    "Google login is not configured on this server yet.",
  microsoft_not_configured: "Microsoft login is not configured on this server yet.",
  google_no_code:           "Google login was cancelled or failed. Please try again.",
  microsoft_no_code:        "Microsoft login was cancelled or failed. Please try again.",
  google_token_exchange:    "Could not complete Google sign-in. Please try again.",
  microsoft_token_exchange: "Could not complete Microsoft sign-in. Please try again.",
  google_userinfo:          "Could not retrieve your Google profile. Please try again.",
  microsoft_userinfo:       "Could not retrieve your Microsoft profile. Please try again.",
  member_create_failed:     "Your account was authenticated but profile setup failed. Please contact support.",
  me_fetch_failed:          "Sign-in succeeded but session could not be started. Please try again.",
  no_email:                 "Your provider did not share an email address. Please check your account privacy settings.",
};

const FEATURES = [
  "Real-time RFI status tracking",
  "Team collaboration & threaded comments",
  "Audit-ready documentation",
  "Due-date reminders & notifications",
];

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const ssoError = searchParams.get("sso_error");
    if (ssoError) {
      const msg = SSO_ERROR_MESSAGES[ssoError] ?? `Sign-in error: ${ssoError}`;
      toast.error(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [formData, setFormData] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post("/api/token/", formData);
      const { access, refresh } = response.data;

      localStorage.setItem(ACCESS_TOKEN, access);
      localStorage.setItem(REFRESH_TOKEN, refresh);

      const meResponse = await api.get("/api/me/", {
        headers: { Authorization: `Bearer ${access}` },
      });
      const user = meResponse.data;

      login({
        access,
        refresh,
        username: user.username,
        displayName: user.member?.name || user.username,
        memberId: user.member?.id || "",
        role: user.member?.role || "",
        isAdmin: user.member?.is_admin || false,
      });

      toast.success("Login successful.");
      navigate("/");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left: branding panel ──────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between bg-blue-950 lg:w-5/12 xl:w-[42%] px-12 py-14 relative overflow-hidden">
        {/* Subtle background circles */}
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
            Manage RFIs.<br />Close loops.<br />Deliver projects.
          </h2>
          <p className="mt-4 text-blue-200/80 text-sm leading-relaxed max-w-xs">
            A purpose-built platform for construction teams to track, respond to,
            and close requests for information — from submission to resolution.
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

      {/* ── Right: form panel ─────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col justify-center items-center bg-white dark:bg-gray-900 px-6 sm:px-10 py-12 overflow-hidden">
        {/* Subtle background circles */}
        <div className="absolute -top-28 -right-28 h-72 w-72 rounded-full bg-indigo-100/60 dark:bg-indigo-900/20 pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-100/50 dark:bg-blue-900/15 pointer-events-none" />

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="h-8 w-8 rounded-xl bg-blue-950 flex items-center justify-center">
            <span className="text-white font-bold text-xs">RF</span>
          </div>
          <span className="text-blue-950 dark:text-indigo-200 font-bold text-lg">RFI Filer</span>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Username
              </label>
              <div className="flex items-center rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition">
                <span className="text-sm text-gray-400 dark:text-gray-500 shrink-0 select-none mr-0.5">
                  Filer/
                </span>
                <input
                  type="text"
                  name="username"
                  id="username"
                  onChange={handleChange}
                  value={formData.username}
                  className="block w-full py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none bg-transparent"
                  placeholder="janesmith"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="flex items-center rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  id="password"
                  onChange={handleChange}
                  value={formData.password}
                  className="block w-full py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none bg-transparent"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="ml-2 shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword
                    ? <EyeSlashIcon className="h-4 w-4" />
                    : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-950 hover:bg-indigo-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <span className="loading-spinner mr-1" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRightIcon className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              or continue with
            </span>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
          </div>

          {/* Google SSO */}
          <a
            href={`${import.meta.env.VITE_API_URL}/api/auth/start/google/`}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>

          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
