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
import RfiDetail from "./components/RfiDetail";
import ProjectList from "./components/ProjectList";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import MemberDetail from "./pages/MemberDetail";
import EmailInbox from "./pages/EmailInbox";

import Toaster from "./components/Toaster";
import { ThemeProvider } from "./context/Theme";

import { ACCESS_TOKEN } from "./constants";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem(ACCESS_TOKEN);
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ThemeProvider>
    <Router>
      <Toaster />

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
        <Route
          path="/rfi/:pk/:slug"
          element={
            <PrivateRoute>
              <RfiDetail />
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
        <Route
          path="/email-inbox"
          element={
            <PrivateRoute>
              <EmailInbox />
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
    </ThemeProvider>
  );
}

export default App;
