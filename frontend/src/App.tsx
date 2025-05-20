import React from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import Login from "./components/Login";
import CreateRfiForm from "./components/CreateRfiForm";
import RfiList from "./components/RfiList";
import ProtectedRoute from "./components/ProtectedRoute";

const App: React.FC = () => {
  return (
    <Router>
      <div className="app-container min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/create-rfi"
            element={
              <ProtectedRoute>
                <CreateRfiForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rfi-list"
            element={
              <ProtectedRoute>
                <RfiList />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
