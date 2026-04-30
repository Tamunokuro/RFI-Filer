import { useAuth } from "../context/Auth";
import { useNavigate, Link } from "react-router-dom";
import { PlusIcon, UserCircleIcon } from "@heroicons/react/20/solid";
import { FolderOpenIcon, ClipboardDocumentListIcon, SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import { useState, useEffect, useRef } from "react";
import NotificationBell from "./NotificationBell";
import { useTheme } from "../context/Theme";

const Header = ({ title }) => {
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { isAuthenticated, username, displayName, memberId, logout } =
    useAuth();

  const shownName = displayName || username || "";

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    setDropdownOpen(false);
    logout(navigate);
  };

  const iconBtn =
    "hover:bg-blue-100 dark:hover:bg-gray-700 text-blue-800 dark:text-blue-300 p-2 rounded-full border border-blue-200 dark:border-gray-600 shadow-sm transition duration-150";

  return (
    <div className="flex justify-between items-center my-5 relative">
      <h2 className="form-title font-bold text-3xl text-indigo-950 dark:text-indigo-200">
        {title || "RFI Filer"}
      </h2>

      <div className="flex items-center gap-4 relative" ref={dropdownRef}>
        {isAuthenticated && (
          <>
            <button onClick={() => navigate("/")} className={iconBtn} title="RFI List">
              <ClipboardDocumentListIcon className="w-6 h-6" />
            </button>

            {/* Notification bell — self-contained: polls badge, opens panel */}
            <NotificationBell />

            <button onClick={() => navigate("/projects")} className={iconBtn} title="View Projects">
              <FolderOpenIcon className="w-6 h-6" />
            </button>

            {/* Day / Night toggle */}
            <button
              onClick={toggleTheme}
              className={iconBtn}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark"
                ? <SunIcon className="w-6 h-6" />
                : <MoonIcon className="w-6 h-6" />}
            </button>

            <button
              onClick={() => navigate("/create-rfi")}
              className="form-button max-w-xs bg-gradient-to-r from-blue-800 to-indigo-900 hover:from-blue-900 hover:to-indigo-950 text-white font-semibold py-2 px-4 rounded-lg shadow-md flex items-center gap-2 transition duration-150"
            >
              <PlusIcon className="w-5 h-5" />
              Create New RFI
            </button>
          </>
        )}

        <div className="relative">
          <UserCircleIcon
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="w-8 h-8 text-blue-900 dark:text-blue-300 hover:text-indigo-950 dark:hover:text-indigo-200 cursor-pointer"
          />

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-neutral-50 dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 shadow-lg z-10 p-3">
              <div className="text-sm mb-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                <p className="font-semibold text-gray-400 dark:text-gray-500">
                  {isAuthenticated ? `Filer: ${shownName}` : "Not logged in"}
                </p>
              </div>

              {isAuthenticated ? (
                <div className="space-y-1">
                  <Link
                    to={`/members/${memberId}`}
                    onClick={() => setDropdownOpen(false)}
                    className="block w-full font-semibold text-left px-2 py-2 text-sm text-blue-700 dark:text-blue-400 rounded transition duration-150 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Profile
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="block w-full font-semibold text-left px-2 py-2 text-sm text-red-600 dark:text-red-400 rounded transition duration-150 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate("/login");
                  }}
                  className="block w-full font-semibold text-left px-2 py-2 text-sm text-blue-700 dark:text-blue-400 rounded transition duration-150 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Login
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
