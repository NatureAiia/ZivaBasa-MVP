export default function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`skeleton animate-shimmer rounded-md ${className}`} />;
}
