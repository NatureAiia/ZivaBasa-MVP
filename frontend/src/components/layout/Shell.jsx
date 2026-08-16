import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import Sidebar from "./Sidebar";
import GlitterWrap from "../effects/GlitterWrap";
import ClickEffects from "../effects/ClickEffects";
import ClarityRing from "../common/ClarityRing";
import ThemeToggle from "./ThemeToggle";
import CommandPalette from "../common/CommandPalette";
import { useAuth } from "../../lib/authStore";

export default function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-bg text-ink theme-transition relative">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <CommandPalette />

      {/* Click Effects — fires on empty space only (buttons/links/inputs are excluded inside
          the component itself). Fixed, full-screen, very high z-index so it renders above
          everything; the component sets pointerEvents:"none" on its own root so it never
          blocks a real click underneath it. */}
      <div className="fixed inset-0 z-[100] pointer-events-none">
        <ClickEffects interactionMode="sniper" color="#E8A33D" duration={0.35} strokeWidth={2} effectSize={70} />
      </div>

      {/* Mobile top bar — only shown below md, since the sidebar is off-canvas there */}
      <div className="md:hidden flex items-center justify-between h-16 px-4 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <ClarityRing mode="static" size={28} strokeWidth={4} color="gold" />
          <span className="font-display text-base font-bold text-ink">ChiedzaAI</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            className="text-ink-faint hover:text-red p-1.5"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={20} />
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            className="text-ink-faint hover:text-ink p-1.5"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <main id="main-content" tabIndex={-1} className="flex-1 overflow-hidden flex flex-col relative outline-none">
        {/* Background animation lives ONLY here (the main content area), not behind the
            sidebar — sidebar stays a solid, undistracted surface. */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.35]">
          <GlitterWrap
            particleCount={140}
            color1="#E8A33D"
            color2="#2FBF9F"
            color3="#6C7CFF"
            speed={2}
            density={70}
            starSize={6}
            focalDepth={13}
            turbulence={2}
            brightness={45}
            glitterIntensity={2}
            trailAmount={96}
            reverse={false}
          />
        </div>
        <div className="relative z-10 flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
