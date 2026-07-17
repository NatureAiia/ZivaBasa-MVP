import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/authStore";
import ClarityRing from "../common/ClarityRing";
import ConfigMissingScreen from "./ConfigMissingScreen";

// Guards everything under /app — redirects to the dedicated /login route rather than
// rendering a login form inline, so there's exactly one sign-in surface in the app.
export default function AuthGate({ children }) {
  const { configured, loading, signedIn } = useAuth();

  if (!configured) return <ConfigMissingScreen />;
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <ClarityRing mode="loading" size={36} strokeWidth={4} color="gold" />
      </div>
    );
  }
  if (!signedIn) return <Navigate to="/login" replace />;
  return children;
}
