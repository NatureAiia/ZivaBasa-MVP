import { AlertTriangle } from "lucide-react";
import Card from "../common/Card";

export default function ConfigMissingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-bg text-ink px-4">
      <Card className="max-w-md flex flex-col gap-3" animated={false}>
        <div className="flex items-center gap-2 text-red">
          <AlertTriangle size={18} />
          <h1 className="font-display font-semibold">Supabase not configured</h1>
        </div>
        <p className="text-sm text-ink-muted">
          Set <code className="text-ink bg-surface2 rounded px-1">VITE_SUPABASE_URL</code> and{" "}
          <code className="text-ink bg-surface2 rounded px-1">VITE_SUPABASE_ANON_KEY</code> in{" "}
          <code className="text-ink bg-surface2 rounded px-1">frontend/.env</code> (copy from{" "}
          <code className="text-ink bg-surface2 rounded px-1">.env.example</code>), then restart
          the dev server.
        </p>
      </Card>
    </div>
  );
}
