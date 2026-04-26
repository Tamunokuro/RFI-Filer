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
  "Contract Administrator",
  "Project Manager",
];

export const canSubmitOfficialResponse = (role) =>
  OFFICIAL_RESPONDER_ROLES.includes(role);
