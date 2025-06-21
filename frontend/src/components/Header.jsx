import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { PlusIcon, UserCircleIcon } from "@heroicons/react/20/solid";

const user = {
  name: localStorage.getItem("username"),
};

const Header = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
    window.location.reload();
  };

  // Close dropdown on outside click
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
        <button
          onClick={() => navigate("/create-rfi")}
          className="form-button max-w-xs bg-blue-900 hover:bg-indigo-950 text-white font-semibold py-2 px-4 rounded shadow flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Create New RFI
        </button>

        <div className="relative">
          <UserCircleIcon
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-8 h-8 text-blue-900 hover:text-indigo-950 cursor-pointer"
          />

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-neutral-50 rounded border border-slate-200 shadow-lg z-10 p-3">
              <div className="text-sm mb-2 border-b border-gray-200 pb-2">
                <p className="font-semibold text-gray-400">
                  Filer: {user.name}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="block w-full font-semibold text-left px-2 py-2 text-sm text-red-600 rounded transition duration-150 hover:bg-gray-100 "
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
