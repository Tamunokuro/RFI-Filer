import { createContext, useContext, useState, useEffect } from "react";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [memberId, setMemberId] = useState("");

  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN);
    const storedUsername = localStorage.getItem("username");
    const storedDisplayName = localStorage.getItem("display_name");
    const storedMemberId = localStorage.getItem("member_id");

    setIsAuthenticated(!!accessToken);
    setUsername(storedUsername || "");
    setDisplayName(storedDisplayName || "");
    setMemberId(storedMemberId || "");
  }, []);

  const login = ({ access, refresh, username, displayName, memberId }) => {
    localStorage.setItem(ACCESS_TOKEN, access);
    localStorage.setItem(REFRESH_TOKEN, refresh);
    localStorage.setItem("username", username);
    localStorage.setItem("display_name", displayName || username);
    localStorage.setItem("member_id", memberId || "");

    setIsAuthenticated(true);
    setUsername(username);
    setDisplayName(displayName || username);
    setMemberId(memberId || "");
  };

  const logout = (navigate) => {
    localStorage.removeItem(ACCESS_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
    localStorage.removeItem("username");
    localStorage.removeItem("display_name");
    localStorage.removeItem("member_id");

    setIsAuthenticated(false);
    setUsername("");
    setDisplayName("");
    setMemberId("");

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
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
