export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 gap-3">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-surface2 flex items-center justify-center text-ink-faint mb-1">
          <Icon size={20} />
        </div>
      )}
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="text-xs text-ink-muted max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
