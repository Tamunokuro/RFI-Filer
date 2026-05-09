import { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import CreateRfiForm from "./components/CreateRfiForm";
import Login from "./components/Login";
import Register from "./components/Register";
import RfiList from "./components/RfiList";
import UpdateRfiForm from "./components/UpdateRfiForm";
import RfiDetail from "./components/RfiDetail";
import ProjectList from "./components/ProjectList";
import ProjectDetail from "./components/ProjectDetail";
import ContractChanges from "./components/ContractChanges";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import MemberDetail from "./pages/MemberDetail";
import TeamDirectory from "./pages/TeamDirectory";
import EmailInbox from "./pages/EmailInbox";
import Dashboard from "./pages/Dashboard";

import Toaster from "./components/Toaster";
import SessionWarningModal from "./components/SessionWarningModal";
import SplashScreen from "./components/SplashScreen";
import { ThemeProvider } from "./context/Theme";
import { useAuth } from "./context/Auth";
import { useIdleLogout } from "./hooks/useIdleLogout";

import { ACCESS_TOKEN } from "./constants";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem(ACCESS_TOKEN);
  return token ? children : <Navigate to="/login" />;
};

/**
 * AppShell
 * --------
 * Mounted inside <Router> so that useNavigate (used by useIdleLogout) is
 * available. Owns the idle-logout timer and the session-warning modal.
 */
function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { showWarning, extendSession } = useIdleLogout();

  return (
    <>
      <Toaster />

      {/* Session-expiry warning — appears 5 min before the 30-min cutoff */}
      <SessionWarningModal
        open={showWarning}
        onContinue={extendSession}
        onLogout={() => logout(navigate)}
      />

      <Routes>
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/rfis"
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
          path="/projects/:pk"
          element={
            <PrivateRoute>
              <ProjectDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/contract-changes"
          element={
            <PrivateRoute>
              <ContractChanges />
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
          path="/team"
          element={
            <PrivateRoute>
              <TeamDirectory />
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
    </>
  );
}

function App() {
  // showSplash resets to true on every cold page load.
  // Navigating within the SPA does NOT re-mount App, so the splash
  // only appears once per page load — exactly like Teams / native apps.
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ThemeProvider>
      {/* Splash lives outside <Router> so it has no routing overhead,
          but inside <ThemeProvider> so dark mode applies correctly. */}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      <Router>
        <AppShell />
      </Router>
    </ThemeProvider>
  );
}

export default App;
