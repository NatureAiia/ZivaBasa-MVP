import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { AuthProvider } from "./lib/authStore";
import { LowBandwidthProvider } from "./lib/lowBandwidthStore";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <LowBandwidthProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </LowBandwidthProvider>
    </ThemeProvider>
  </StrictMode>
);
