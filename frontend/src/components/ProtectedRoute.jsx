import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api from "../api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";
import { useEffect, useState } from "react";

const ProtectedRoute = ({ children }) => {
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    auth().catch((error) => {
      setAuthUser(false);
    });
  }, []);

  const refreshToken = async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN);
    try {
      const res = await api.post("/api/token/refresh/", {
        refresh: refreshToken,
      });
      if (res.status === 200) {
        const { access } = res.data;
        localStorage.setItem(ACCESS_TOKEN, access);
        setAuthUser(true);
      }
    } catch (error) {
      console.error(error);
      setAuthUser(false);
    }
  };

  const auth = async () => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN);
    if (!accessToken) {
      setAuthUser(false);
      return;
    }
    const decoded = jwtDecode(accessToken);
    const tokenExpiration = decoded.exp;
    const currentTime = Date.now() / 1000;

    if (tokenExpiration < currentTime) {
      await refreshToken();
    } else {
      setAuthUser(true);
    }
  };

  if (authUser === null) {
    return <div>Loading....</div>;
  }
  return authUser ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;
