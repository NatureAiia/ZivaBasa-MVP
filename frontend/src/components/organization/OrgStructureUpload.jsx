import { useRef } from "react";
import { Upload } from "lucide-react";
import { addSource } from "../../lib/sourcesStore";

const ACCEPT = "image/*,.svg,image/svg+xml,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function kindOf(file) {
  if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) return "svg";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "docx";
}

const ALLOWED_KINDS = new Set(["svg", "image", "pdf", "docx"]);

/*
  Pure file-picker — just the trigger button. Lets someone attach an existing org chart
  (image/PDF/Word/SVG) as a visual reference; the parent (MyOrganizationTab) owns the preview
  display since the preview card is too large to sit inline next to other header buttons.
  Deliberately NOT auto-extracted into structured role data — no vision/OCR pipeline wired up
  for that yet, flagged as a real next step rather than silently promised here. The file is
  also logged as a Source, same as any Predict upload, so it shows up in one place.
*/
export default function OrgStructureUpload({ onAttach }) {
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    const kind = kindOf(f);
    if (!ALLOWED_KINDS.has(kind)) return;
    const url = URL.createObjectURL(f);
    addSource({ name: f.name, kind: kind === "docx" ? "text" : kind, size: f.size });
    onAttach?.({ name: f.name, size: f.size, kind, url });
    inputRef.current.value = ""; // allow re-selecting the same filename later
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 bg-surface2 border border-border rounded-xl px-3.5 py-2 text-xs font-medium text-ink-muted hover:text-ink hover:border-gold/40 transition-colors"
      >
        <Upload size={13} /> Add organizational structure
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </>
  );
}
