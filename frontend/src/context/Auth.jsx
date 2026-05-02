import { createContext, useContext, useState, useEffect } from "react";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN);
    const storedUsername = localStorage.getItem("username");
    const storedDisplayName = localStorage.getItem("display_name");
    const storedMemberId = localStorage.getItem("member_id");
    const storedRole = localStorage.getItem("role");

    setIsAuthenticated(!!accessToken);
    setUsername(storedUsername || "");
    setDisplayName(storedDisplayName || "");
    setMemberId(storedMemberId || "");
    setRole(storedRole || "");
  }, []);

  const login = ({ access, refresh, username, displayName, memberId, role }) => {
    localStorage.setItem(ACCESS_TOKEN, access);
    localStorage.setItem(REFRESH_TOKEN, refresh);
    localStorage.setItem("username", username);
    localStorage.setItem("display_name", displayName || username);
    localStorage.setItem("member_id", memberId || "");
    localStorage.setItem("role", role || "");

    setIsAuthenticated(true);
    setUsername(username);
    setDisplayName(displayName || username);
    setMemberId(memberId || "");
    setRole(role || "");
  };

  const logout = (navigate) => {
    localStorage.removeItem(ACCESS_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
    localStorage.removeItem("username");
    localStorage.removeItem("display_name");
    localStorage.removeItem("member_id");
    localStorage.removeItem("role");

    setIsAuthenticated(false);
    setUsername("");
    setDisplayName("");
    setMemberId("");
    setRole("");

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
