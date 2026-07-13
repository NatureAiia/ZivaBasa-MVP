import { Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/layout/Shell";
import ChiedzaDashboard from "./pages/ChiedzaDashboard";
import InDevelopment from "./pages/InDevelopment";
import ZivaBasaLayout from "./pages/zivabasa/ZivaBasaLayout";
import DashboardTab from "./pages/zivabasa/DashboardTab";
import ChatTab from "./pages/zivabasa/ChatTab";
import PredictTab from "./pages/zivabasa/PredictTab";
import HistoryTab from "./pages/zivabasa/HistoryTab";

const OTHER_MODELS = ["ziva-bank", "ziva-dataops", "ziva-business", "ziva-upskill"];

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
        </Route>

        {OTHER_MODELS.map((slug) => (
          <Route key={slug} path={`models/${slug}`} element={<InDevelopment />} />
        ))}

        <Route path="cost-monitoring" element={<InDevelopment />} />
        <Route path="*" element={<InDevelopment />} />
      </Route>
    </Routes>
  );
}
