import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Image, File, Table2, X } from "lucide-react";
import { fadeUpItem } from "../../lib/motion";
import { getSources, addSource, removeSource } from "../../lib/sourcesStore";
import { TASK_SHORT_LABELS } from "../../lib/api";

const ICONS = { pdf: FileText, image: Image, text: File, csv: Table2 };

function kindOf(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (file.name.endsWith(".csv") || file.type === "text/csv") return "csv";
  return "text";
}

export default function SourcesPanel() {
  const [sources, setSources] = useState(getSources);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (fileList) => {
    let next = sources;
    for (const f of Array.from(fileList)) {
      next = addSource({ name: f.name, kind: kindOf(f), size: f.size });
    }
    setSources(next);
  };

  const remove = (id) => setSources(removeSource(id));

  return (
    <div className="p-4 flex flex-col gap-3 h-full overflow-y-auto">
      <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Sources</h3>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-gold bg-gold/5" : "border-border hover:border-ink-faint"
        }`}
      >
        <Upload size={18} className="text-ink-faint" />
        <p className="text-xs text-ink-muted">Drop images, PDFs, or text</p>
        <p className="text-[10px] text-ink-faint">Saved here for reference — data files you upload on Predict show up here too</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {sources.map((s) => {
            const Icon = ICONS[s.kind] || File;
            return (
              <motion.div
                key={s.id}
                variants={fadeUpItem}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-2 text-xs"
              >
                <Icon size={14} className="text-ink-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-ink">{s.name}</span>
                  {s.task && (
                    <span className="block text-[10px] text-ink-faint">
                      Predict upload · {TASK_SHORT_LABELS[s.task] || s.task}
                      {s.rowCount != null && ` · ${s.rowCount} rows`}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => remove(s.id)}
                  className="text-ink-faint hover:text-red transition-colors shrink-0"
                  aria-label={`Remove ${s.name}`}
                >
                  <X size={12} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {sources.length === 0 && (
          <p className="text-[11px] text-ink-faint text-center py-2">No sources yet</p>
        )}
      </div>
    </div>
  );
}
