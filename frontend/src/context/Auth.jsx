import { createContext, useContext, useState, useEffect } from "react";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN);
    const storedUsername = localStorage.getItem("username");
    const storedDisplayName = localStorage.getItem("display_name");

    setIsAuthenticated(!!accessToken);
    setUsername(storedUsername || "");
    setDisplayName(storedDisplayName || "");
  }, []);

  const login = ({ access, refresh, username, displayName }) => {
    localStorage.setItem(ACCESS_TOKEN, access);
    localStorage.setItem(REFRESH_TOKEN, refresh);
    localStorage.setItem("username", username);
    localStorage.setItem("display_name", displayName || username);

    setIsAuthenticated(true);
    setUsername(username);
    setDisplayName(displayName || username);
  };

  const logout = (navigate) => {
    localStorage.removeItem(ACCESS_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
    localStorage.removeItem("username");
    localStorage.removeItem("display_name");

    setIsAuthenticated(false);
    setUsername("");
    setDisplayName("");

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
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
