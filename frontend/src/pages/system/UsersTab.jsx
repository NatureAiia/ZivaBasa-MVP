import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users as UsersIcon, Loader2, ShieldAlert } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import EmptyState from "../../components/common/EmptyState";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { useAuth } from "../../lib/authStore";
import { listAllProfiles, promoteUserRole } from "../../lib/profileStore";

const ROLE_TONE = { superadmin: "red", admin: "gold", viewer: "neutral" };
const ROLES = ["viewer", "admin", "superadmin"];

/*
  Systems -> Users. The schema has always documented "an existing admin grants Admin access"
  (see schema.sql's profiles comment) but no UI ever existed for it — this is that missing
  piece, built on the "admins can view all profiles" RLS policy + the promote_user_role() RPC
  (both added alongside this page; see schema.sql). Role changes are only offered to a
  superadmin viewer — the RPC itself re-checks this server-side regardless of what this UI shows.

  No email column exists on `profiles` (see schema.sql) — auth.users isn't queryable from the
  client SDK, so rows are identified by full_name (falling back to a truncated user id), not
  email. A real deployment wanting email visibility here would need a backend endpoint reading
  auth.users with the service role key, not attempted in this pass.
*/
export default function UsersTab() {
  const { role: myRole } = useAuth();
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const load = () => {
    setError(null);
    listAllProfiles()
      .then(setProfiles)
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const changeRole = async (userId, newRole) => {
    setUpdatingId(userId);
    setError(null);
    try {
      await promoteUserRole(userId, newRole);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdatingId(null);
    }
  };

  if (myRole !== "admin" && myRole !== "superadmin") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={ShieldAlert}
          title="Admin access required"
          description="This page is only visible to admin/superadmin accounts."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <UsersIcon size={20} className="text-gold" /> Users
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              {myRole === "superadmin"
                ? "Manage roles for everyone in your organization."
                : "Viewing everyone's role. Only a superadmin can change roles."}
            </p>
          </div>

          {error && (
            <div className="text-xs text-red bg-red/10 border border-red/25 rounded-xl px-3 py-2.5">{error}</div>
          )}

          {profiles === null ? (
            <div className="flex items-center gap-2 text-xs text-ink-faint py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : profiles.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No users found" description="No profile rows are visible to your account." />
          ) : (
            <Card animated={false} className="!p-0 overflow-hidden">
              <div className="flex flex-col divide-y divide-border">
                {profiles.map((p) => (
                  <motion.div key={p.user_id} variants={fadeUpItem} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink truncate">
                        {p.full_name || `User ${p.user_id.slice(0, 8)}`}
                      </div>
                      <div className="text-[11px] text-ink-faint truncate">
                        {[p.job_title, p.organization].filter(Boolean).join(" · ") || "No details on file"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={ROLE_TONE[p.role] || "neutral"}>{p.role}</Badge>
                      {myRole === "superadmin" && (
                        <select
                          value={p.role}
                          disabled={updatingId === p.user_id}
                          onChange={(e) => changeRole(p.user_id, e.target.value)}
                          className="text-xs bg-surface2 border border-border rounded-lg px-2 py-1.5 text-ink outline-none focus:border-gold/50 disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}
