import { Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/layout/Shell";
import ChiedzaDashboard from "./pages/ChiedzaDashboard";
import InDevelopment from "./pages/InDevelopment";
import CostMonitoring from "./pages/CostMonitoring";
import ZivaBasaLayout from "./pages/zivabasa/ZivaBasaLayout";
import DashboardTab from "./pages/zivabasa/DashboardTab";
import ChatTab from "./pages/zivabasa/ChatTab";
import PredictTab from "./pages/zivabasa/PredictTab";
import HistoryTab from "./pages/zivabasa/HistoryTab";
import RosterTab from "./pages/zivabasa/RosterTab";
import { MODELS } from "./components/layout/Sidebar";

const OTHER_MODELS = MODELS.filter((m) => !m.live).map((m) => m.slug);

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<ChiedzaDashboard />} />

        <Route path="models/zivabasa" element={<ZivaBasaLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardTab />} />
          <Route path="chat" element={<ChatTab />} />
          <Route path="predict" element={<PredictTab />} />
          <Route path="history" element={<HistoryTab />} />
          <Route path="roster" element={<RosterTab />} />
        </Route>

        {OTHER_MODELS.map((slug) => (
          <Route key={slug} path={`models/${slug}`} element={<InDevelopment />} />
        ))}

        <Route path="cost-monitoring" element={<CostMonitoring />} />
        <Route path="*" element={<InDevelopment />} />
      </Route>
    </Routes>
  );
}
