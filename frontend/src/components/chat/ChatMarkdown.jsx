import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/*
  Renders assistant chat replies as real markdown (headings, bold, lists, code, tables, links)
  instead of showing literal "##"/"**" characters — same idea as how a Claude.ai/Claude Code
  conversation renders. Styled with this app's own tokens (text-ink, text-gold, etc.) rather
  than a generic typography plugin, since Tailwind's @tailwindcss/typography isn't installed
  here and pulling it in for one component isn't worth the extra dependency.
*/
const COMPONENTS = {
  h1: ({ children }) => <h1 className="text-sm font-semibold text-ink mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold text-ink mt-3 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-ink mt-2.5 mb-1 first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 flex flex-col gap-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 flex flex-col gap-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-gold underline hover:brightness-110">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gold/40 pl-3 text-ink-faint italic my-2">{children}</blockquote>
  ),
  hr: () => <hr className="border-border my-3" />,
  // react-markdown v9+ dropped the old `inline` prop on `code` — a fenced block gets a
  // `language-*` className (only when a language is given) and/or embedded newlines; an inline
  // code span never has either, so that combination is what distinguishes the two here.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className || "") || String(children).includes("\n");
    if (isBlock) {
      return (
        <pre className="bg-surface2/80 border border-border rounded-lg p-2.5 overflow-x-auto mb-2 last:mb-0">
          <code className="font-mono text-xs">{children}</code>
        </pre>
      );
    }
    return <code className="bg-surface2/80 rounded px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
  },
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 last:mb-0">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold text-ink">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
};

export default function ChatMarkdown({ text }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
