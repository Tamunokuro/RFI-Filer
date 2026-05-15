/**
 * SSOCallback — handles the redirect from the Django SSO callback.
 *
 * Django redirects here with:
 *   ?access=<jwt-access-token>&refresh=<jwt-refresh-token>&provider=google|microsoft
 *
 * On error:
 *   /login?sso_error=<reason>
 */
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import { useAuth } from "../context/Auth";
import api from "../api";

export default function SSOCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const done = useRef(false); // prevent double-fire in React StrictMode

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const access  = searchParams.get("access");
    const refresh = searchParams.get("refresh");

    if (!access || !refresh) {
      navigate("/login?sso_error=missing_tokens");
      return;
    }

    // Store tokens
    localStorage.setItem(ACCESS_TOKEN,  access);
    localStorage.setItem(REFRESH_TOKEN, refresh);

    // Fetch /me/ to populate auth context (same flow as normal login)
    api.get("/api/me/", { headers: { Authorization: `Bearer ${access}` } })
      .then(({ data }) => {
        login({
          access,
          refresh,
          username:    data.username,
          displayName: data.member?.name || data.username,
          memberId:    data.member?.id   || "",
          role:        data.member?.role || "",
        });
        navigate("/");
      })
      .catch(() => {
        navigate("/login?sso_error=me_fetch_failed");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <svg className="mx-auto h-10 w-10 animate-spin text-indigo-500"
             fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-sm text-gray-600 dark:text-gray-400">Completing sign-in…</p>
      </div>
    </div>
  );
}
