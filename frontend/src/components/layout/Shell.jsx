import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import GlitterWrap from "../effects/GlitterWrap";

export default function Shell() {
  return (
    <div className="flex h-screen bg-bg text-ink theme-transition relative">
      {/* Background animation, fixed behind everything. pointer-events-none so it never
          blocks clicks; tuned way down (low brightness, small size, muted trail) so it reads
          as ambient texture behind cards/text rather than competing with content — cards sit
          on opaque bg-surface so text inside them is unaffected either way. */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.35]">
        <GlitterWrap
          particleCount={160}
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

      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col relative z-10">
        <Outlet />
      </main>
    </div>
  );
}
