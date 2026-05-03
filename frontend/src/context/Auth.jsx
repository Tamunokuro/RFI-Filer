import { createContext, useContext, useState, useEffect } from "react";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN);
    const storedUsername = localStorage.getItem("username");
    const storedDisplayName = localStorage.getItem("display_name");
    const storedMemberId = localStorage.getItem("member_id");
    const storedRole = localStorage.getItem("role");
    const storedIsAdmin = localStorage.getItem("is_admin") === "true";

    setIsAuthenticated(!!accessToken);
    setUsername(storedUsername || "");
    setDisplayName(storedDisplayName || "");
    setMemberId(storedMemberId || "");
    setRole(storedRole || "");
    setIsAdmin(storedIsAdmin);
  }, []);

  const login = ({ access, refresh, username, displayName, memberId, role, isAdmin = false }) => {
    localStorage.setItem(ACCESS_TOKEN, access);
    localStorage.setItem(REFRESH_TOKEN, refresh);
    localStorage.setItem("username", username);
    localStorage.setItem("display_name", displayName || username);
    localStorage.setItem("member_id", memberId || "");
    localStorage.setItem("role", role || "");
    localStorage.setItem("is_admin", String(isAdmin));

    setIsAuthenticated(true);
    setUsername(username);
    setDisplayName(displayName || username);
    setMemberId(memberId || "");
    setRole(role || "");
    setIsAdmin(!!isAdmin);
  };

  const logout = (navigate) => {
    localStorage.removeItem(ACCESS_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
    localStorage.removeItem("username");
    localStorage.removeItem("display_name");
    localStorage.removeItem("member_id");
    localStorage.removeItem("role");
    localStorage.removeItem("is_admin");

    setIsAuthenticated(false);
    setUsername("");
    setDisplayName("");
    setMemberId("");
    setRole("");
    setIsAdmin(false);

    if (navigate) {
      navigate("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        username,
        displayName,
        memberId,
        role,
        isAdmin,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const OFFICIAL_RESPONDER_ROLES = [
  "Project Designer",
  "Sub Consultant",
  "Contract Administrator",
  "Project Manager",
];

/** Roles that belong to the "design / technical team" side of the workflow. */
export const DESIGNER_ROLES = ["Project Designer", "Sub Consultant"];

/** Roles that belong to the "requester" side of the workflow. */
export const REQUESTER_ROLES = [
  "Contractor",
  "Contract Administrator",
  "Project Manager",
  "Client",
];

export const canSubmitOfficialResponse = (role) =>
  OFFICIAL_RESPONDER_ROLES.includes(role);

/**
 * Returns true when a designer-role user is allowed to submit a *revised*
 * official response (i.e. the RFI is already in "responded" status).
 */
export const canReviseOfficialResponse = (role) =>
  DESIGNER_ROLES.includes(role);

/**
 * Returns true when the current user may edit the RFI's content fields.
 *
 * Rules:
 *  - Closed RFIs are never editable.
 *  - Designer roles can only edit while the RFI is still "open" (draft).
 *  - Requester roles can edit when "open" (draft) or "under_review" (tracked revision).
 *  - All other roles follow the same rule as requester roles.
 */
export const canEditRfi = (role, rfiStatus) => {
  if (rfiStatus === "closed") return false;
  if (DESIGNER_ROLES.includes(role)) return rfiStatus === "open";
  return rfiStatus === "open" || rfiStatus === "under_review";
};

/** Roles permitted to create new projects. */
export const PROJECT_EDITOR_ROLES = ["Project Manager", "Contract Administrator"];

/**
 * Returns true when the user may create a new project.
 * Note: backend additionally allows admins (is_admin=True) — a flag we don't
 * currently store client-side, so this check is just a UI hint.  The
 * authoritative check happens server-side.
 */
export const canCreateProject = (role) =>
  PROJECT_EDITOR_ROLES.includes(role);
