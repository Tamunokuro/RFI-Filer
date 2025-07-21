import { createContext, useContext, useState, useEffect} from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const filerName = localStorage.getItem("username");
    setIsAuthenticated(!!token);
    setUsername(filerName || "");
  }, []);

  const login = (token, name) => {
    localStorage.setItem("access_token", token);
    localStorage.setItem("username", name);
    setIsAuthenticated(true);
    setUsername(name);
  };

  const logout = (navigate) => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    setUsername("");
    setIsAuthenticated(false);
    if (navigate) {
      navigate("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
