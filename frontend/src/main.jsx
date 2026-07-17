import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { AuthProvider } from "./lib/authStore";
import AuthGate from "./components/auth/AuthGate";
import App from "./App.jsx";
import "./index.css";

console.log("Vite Env Check:", import.meta.env.VITE_SUPABASE_URL);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
