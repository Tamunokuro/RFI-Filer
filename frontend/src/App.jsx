import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import CreateRfiForm from "./components/CreateRfiForm";
import Login from "./components/Login";
import Register from "./components/Register";
import RfiList from "./components/RfiList";
import UpdateRfiForm from "./components/UpdateRfiForm";
import ProjectList from "./components/ProjectList";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import MemberDetail from "./pages/MemberDetail";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { ACCESS_TOKEN } from "./constants";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem(ACCESS_TOKEN);
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <ToastContainer position="top-right" autoClose={3000} />

      <Routes>
        <Route
          path="/"
          element={
            <PrivateRoute>
              <RfiList />
            </PrivateRoute>
          }
        />
        <Route
          path="/create-rfi"
          element={
            <PrivateRoute>
              <CreateRfiForm />
            </PrivateRoute>
          }
        />
        <Route path="/rfi/:pk/:slug/edit" element={<UpdateRfiForm />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
        <Route
          path="/projects"
          element={
            <PrivateRoute>
              <ProjectList />
            </PrivateRoute>
          }
        />
        <Route
          path="/members/:id"
          element={
            <PrivateRoute>
              <MemberDetail />
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
