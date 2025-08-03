import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import CreateRfiForm from "./components/CreateRfiForm";
import Login from "./components/Login";
import RfiList from "./components/RfiList";
import UpdateRfiForm from "./components/UpdateRfiForm";
import ProjectList from "./components/ProjectList";

import { ACCESS_TOKEN } from "./constants";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem(ACCESS_TOKEN);
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
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
        <Route
          path="/projects"
          element={
            <PrivateRoute>
              <ProjectList />
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
