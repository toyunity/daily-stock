import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Pending from "./pages/Pending";
import Onboarding from "./pages/Onboarding";
import TodayReport from "./pages/TodayReport";
import Archive from "./pages/Archive";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pending" element={<Pending />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<TodayReport />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/reports" element={<Archive />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Admin />} />
      </Route>
    </Routes>
  );
}
