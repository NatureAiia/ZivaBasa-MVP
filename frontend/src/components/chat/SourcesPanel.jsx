import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Image, File, X } from "lucide-react";
import { fadeUpItem } from "../../lib/motion";

const ICONS = { pdf: FileText, image: Image, text: File };

function kindOf(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "text";
}

export default function SourcesPanel() {
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (fileList) => {
    const next = Array.from(fileList).map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}`,
      name: f.name,
      kind: kindOf(f),
      size: f.size,
    }));
    setFiles((f) => [...next, ...f]);
  };

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
        <p className="text-[10px] text-ink-faint">Stored locally in this session — not yet sent to a backend</p>
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
          {files.map((f) => {
            const Icon = ICONS[f.kind];
            return (
              <motion.div
                key={f.id}
                variants={fadeUpItem}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-2 text-xs"
              >
                <Icon size={14} className="text-ink-faint shrink-0" />
                <span className="flex-1 truncate text-ink">{f.name}</span>
                <button
                  onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                  className="text-ink-faint hover:text-red transition-colors"
                  aria-label={`Remove ${f.name}`}
                >
                  <X size={12} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {files.length === 0 && (
          <p className="text-[11px] text-ink-faint text-center py-2">No sources added yet</p>
        )}
      </div>
    </div>
  );
}
