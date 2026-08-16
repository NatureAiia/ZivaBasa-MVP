import { useScrollTracking } from "../../lib/scrollTracking";

export default function ScrollProgressBar() {
  const { progress } = useScrollTracking();

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-gold origin-left transition-transform duration-100 ease-linear"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
