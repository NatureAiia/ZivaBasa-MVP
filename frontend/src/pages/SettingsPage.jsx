import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Save, Settings as SettingsIcon, Upload, User, Wifi, WifiOff } from "lucide-react";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Badge from "../components/common/Badge";
import { staggerContainer, fadeUpItem } from "../lib/motion";
import { useAuth } from "../lib/authStore";
import { useTheme } from "../lib/theme";
import { useLowBandwidth } from "../lib/lowBandwidthStore";
import { updateProfile, uploadAvatar } from "../lib/profileStore";
import { api, setApiBase } from "../lib/api";

/*
  Settings — one place for the two things that were previously scattered: personal profile
  (Postgres `profiles` table, editable subset — full_name/organization/job_title/phone/
  department/avatar; `role` stays admin-only, unchanged) and app-level settings (theme,
  low-bandwidth mode, API base URL — all three existed before this page, just without a home:
  theme lived in the sidebar footer, low-bandwidth mode only appeared inside the ZivaBasa
  model's header, and the API base URL had a working setter function with no UI at all).
*/
export default function SettingsPage() {
  const { user, profile, refreshProfile, configured } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { lowBandwidth, toggle: toggleLowBandwidth } = useLowBandwidth();

  const [form, setForm] = useState({ fullName: "", organization: "", jobTitle: "", phone: "", department: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const fileInputRef = useRef(null);

  const [apiBase, setApiBaseField] = useState(api.base());
  const [apiTestState, setApiTestState] = useState(null); // null | "testing" | "ok" | "error"

  useEffect(() => {
    if (!profile) return;
    setForm({
      fullName: profile.full_name || "",
      organization: profile.organization || "",
      jobTitle: profile.job_title || "",
      phone: profile.phone || "",
      department: profile.department || "",
    });
  }, [profile]);

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const saveProfile = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateProfile(form);
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await uploadAvatar(file);
      await refreshProfile();
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarUploading(false);
      e.target.value = ""; // allow re-selecting the same file later
    }
  };

  const saveApiBase = () => {
    setApiBase(apiBase);
    setApiTestState(null);
  };

  const testApiConnection = async () => {
    setApiTestState("testing");
    try {
      await api.health();
      setApiTestState("ok");
    } catch {
      setApiTestState("error");
    }
  };

  if (!configured) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card animated={false} className="max-w-md text-center">
          <p className="text-sm text-ink-muted">
            Settings requires Supabase to be configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — profile data
            lives there. App-level settings below don't need it, but sign in isn't available to reach this page
            without it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-2xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <SettingsIcon size={20} className="text-gold" /> Settings
            </h1>
            <p className="text-xs text-ink-muted mt-1">Your profile and app-wide preferences.</p>
          </div>

          {/* Personal profile */}
          <Card variants={fadeUpItem} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <User size={15} className="text-teal" />
              <h2 className="text-sm font-semibold text-ink">Personal Profile</h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface2 border border-border overflow-hidden flex items-center justify-center shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Your avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={24} className="text-ink-faint" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="flex items-center gap-1.5 text-xs font-medium bg-surface2 border border-border rounded-lg px-3 py-1.5 hover:border-gold/40 transition-colors disabled:opacity-50 w-fit"
                >
                  {avatarUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {avatarUploading ? "Uploading…" : "Change photo"}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                {avatarError && <p className="text-[11px] text-red">{avatarError}</p>}
                <span className="text-[11px] text-ink-faint">{user?.email}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full name" value={form.fullName} onChange={(v) => updateField("fullName", v)} />
              <Field label="Job title" value={form.jobTitle} onChange={(v) => updateField("jobTitle", v)} />
              <Field label="Organization" value={form.organization} onChange={(v) => updateField("organization", v)} />
              <Field label="Department" value={form.department} onChange={(v) => updateField("department", v)} />
              <Field label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} className="sm:col-span-2" />
            </div>

            <div className="flex items-center gap-2">
              <Badge tone={profile?.role === "admin" ? "gold" : "neutral"}>
                {profile?.role === "admin" ? "Admin" : "Viewer"} role
              </Badge>
              <span className="text-[11px] text-ink-faint">
                Role changes require manual admin action — not editable here.
              </span>
            </div>

            {saveError && <p className="text-xs text-red">{saveError}</p>}

            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={saveProfile} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Saving…" : "Save profile"}
              </Button>
              {saved && <span className="text-xs text-teal">Saved.</span>}
            </div>
          </Card>

          {/* App settings */}
          <Card animated={false} className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-ink">App Settings</h2>

            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-xs font-medium text-ink block">Theme</span>
                <span className="text-[11px] text-ink-faint">Light or dark interface.</span>
              </div>
              <button
                onClick={toggleTheme}
                className="text-xs font-medium bg-surface2 border border-border rounded-lg px-3 py-1.5 hover:border-gold/40 transition-colors capitalize"
              >
                {theme}
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-xs font-medium text-ink block">Low-bandwidth mode</span>
                <span className="text-[11px] text-ink-faint">
                  Text-first views, animations off — for slow or unreliable connections.
                </span>
              </div>
              <button
                onClick={toggleLowBandwidth}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors ${
                  lowBandwidth ? "bg-teal/10 border-teal/30 text-teal" : "bg-surface2 border-border text-ink-muted"
                }`}
              >
                {lowBandwidth ? <WifiOff size={12} /> : <Wifi size={12} />}
                {lowBandwidth ? "On" : "Off"}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div>
                <span className="text-xs font-medium text-ink block">API base URL</span>
                <span className="text-[11px] text-ink-faint">Where the frontend sends backend requests.</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={apiBase}
                  onChange={(e) => setApiBaseField(e.target.value)}
                  className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-ink outline-none focus:border-gold/50 transition-colors"
                />
                <button
                  onClick={saveApiBase}
                  className="text-xs font-medium bg-surface2 border border-border rounded-lg px-3 py-2 hover:border-gold/40 transition-colors shrink-0"
                >
                  Save
                </button>
                <button
                  onClick={testApiConnection}
                  disabled={apiTestState === "testing"}
                  className="text-xs font-medium bg-surface2 border border-border rounded-lg px-3 py-2 hover:border-gold/40 transition-colors shrink-0 disabled:opacity-50"
                >
                  {apiTestState === "testing" ? "Testing…" : "Test connection"}
                </button>
              </div>
              {apiTestState === "ok" && <span className="text-[11px] text-teal">Connected.</span>}
              {apiTestState === "error" && (
                <span className="text-[11px] text-red">Couldn't reach the API at this address.</span>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className = "" }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[11px] text-ink-faint">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-gold/50 transition-colors"
      />
    </div>
  );
}
