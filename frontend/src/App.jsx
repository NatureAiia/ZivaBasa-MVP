import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import LoginPage from "./pages/LoginPage";
import AuthGate from "./components/auth/AuthGate";
import Shell from "./components/layout/Shell";
import ChiedzaDashboard from "./pages/ChiedzaDashboard";
import InDevelopment from "./pages/InDevelopment";
import CostMonitoring from "./pages/CostMonitoring";
import SystemsLayout from "./pages/system/SystemsLayout";
import SettingsTab from "./pages/system/SettingsTab";
import UsersTab from "./pages/system/UsersTab";
import ModelsTab from "./pages/system/ModelsTab";
import ZivaBasaLayout from "./pages/zivabasa/ZivaBasaLayout";
import DashboardTab from "./pages/zivabasa/DashboardTab";
import ChatTab from "./pages/zivabasa/ChatTab";
import PredictTab from "./pages/zivabasa/PredictTab";
import HistoryTab from "./pages/zivabasa/HistoryTab";
import RosterTab from "./pages/zivabasa/RosterTab";
import EmployeeMirrorView from "./pages/zivabasa/EmployeeMirrorView";
import NationalEvidenceView from "./pages/zivabasa/NationalEvidenceView";
import MyOrganizationTab from "./pages/zivabasa/MyOrganizationTab";
import ReviewQueueTab from "./pages/zivabasa/ReviewQueueTab";
import EntityResolutionTab from "./pages/zivabasa/EntityResolutionTab";
import { MODELS } from "./components/layout/Sidebar";
import ChiedzaWidget from "./components/chat/ChiedzaWidget";


const OTHER_MODELS = MODELS.filter((m) => !m.live).map((m) => m.slug);

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/app"
          element={
            <AuthGate>
              <Shell />
            </AuthGate>
          }
        >
          <Route index element={<ChiedzaDashboard />} />

          <Route path="models/zivabasa" element={<ZivaBasaLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardTab />} />
            <Route path="chat" element={<ChatTab />} />
            <Route path="predict" element={<PredictTab />} />
            <Route path="history" element={<HistoryTab />} />
            <Route path="roster" element={<RosterTab />} />
            <Route path="my-view" element={<EmployeeMirrorView />} />
            <Route path="national-view" element={<NationalEvidenceView />} />
            <Route path="my-organization" element={<MyOrganizationTab />} />
            <Route path="review-queue" element={<ReviewQueueTab />} />
            <Route path="entity-resolution" element={<EntityResolutionTab />} />
          </Route>

          {OTHER_MODELS.map((slug) => (
            <Route key={slug} path={`models/${slug}`} element={<InDevelopment />} />
          ))}

          <Route path="cost-monitoring" element={<CostMonitoring />} />

          <Route path="systems" element={<SystemsLayout />}>
            <Route index element={<Navigate to="settings" replace />} />
            <Route path="settings" element={<SettingsTab />} />
            <Route path="users" element={<UsersTab />} />
            <Route path="models" element={<ModelsTab />} />
          </Route>
          {/* Old standalone /app/settings kept working as a redirect, not a dead link. */}
          <Route path="settings" element={<Navigate to="/app/systems/settings" replace />} />

          <Route path="*" element={<InDevelopment />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ChiedzaWidget />
    </>
  );
}
