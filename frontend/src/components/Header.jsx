import { useAuth } from "../context/Auth";
import { useNavigate } from "react-router-dom";
import { PlusIcon, UserCircleIcon } from "@heroicons/react/20/solid";
import { FolderIcon } from "@heroicons/react/24/outline";

import { useState, useEffect, useRef } from "react";

const Header = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { isAuthenticated, username, logout } = useAuth();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex justify-between items-center my-5 relative">
      <h2 className="form-title font-bold text-3xl text-indigo-950">
        RFI List
      </h2>

      <div className="flex items-center gap-4 relative" ref={dropdownRef}>
        {isAuthenticated && (
          <>
            <button
              onClick={() => navigate("/projects")}
              className="hover:bg-blue-200 text-blue-900 p-2 rounded-full"
            >
              <FolderIcon className="w-6 h-6" />
            </button>

            <button
              onClick={() => navigate("/create-rfi")}
              className="form-button max-w-xs bg-blue-900 hover:bg-indigo-950 text-white font-semibold py-2 px-4 rounded shadow flex items-center gap-2"
            >
              <PlusIcon className="w-5 h-5" />
              Create New RFI
            </button>
          </>
        )}

        <div className="relative">
          <UserCircleIcon
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-8 h-8 text-blue-900 hover:text-indigo-950 cursor-pointer"
          />

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-neutral-50 rounded border border-slate-200 shadow-lg z-10 p-3">
              <div className="text-sm mb-2 border-b border-gray-200 pb-2">
                <p className="font-semibold text-gray-400">
                  {isAuthenticated ? `Filer: ${username}` : "Not logged in"}
                </p>
              </div>
              {isAuthenticated ? (
                <button
                  onClick={() => logout(navigate)}
                  className="block w-full font-semibold text-left px-2 py-2 text-sm text-red-600 rounded transition duration-150 hover:bg-gray-100"
                >
                  Logout
                </button>
              ) : (
                <button
                  onClick={() => navigate("/login")}
                  className="block w-full font-semibold text-left px-2 py-2 text-sm text-blue-700 rounded transition duration-150 hover:bg-gray-100"
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
