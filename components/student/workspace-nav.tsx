import type { PartInfo } from "./types";

type Tab = number | "class";

export function visibleStudentTab(parts: PartInfo[], selected: Tab): Tab {
  return selected === "class" || parts.some((p) => p.part === selected) ? selected : parts[0]?.part ?? "class";
}

export function WorkspaceNav({ parts, tab, onTab }: { parts: PartInfo[]; tab: Tab; onTab: (tab: Tab) => void }) {
  return <nav className="border-b border-slate-200 bg-white" aria-label="Parts">
    <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
      {parts.map((p) => (
        <button key={p.part} type="button" aria-current={tab === p.part ? "page" : undefined} onClick={() => onTab(p.part)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === p.part ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          {p.locked ? "🔒 " : p.submission?.status === "submitted" ? "✓ " : ""}
          Part {p.part}
          <span className="ml-1 hidden font-normal sm:inline">· {p.title.split(": ")[1]}</span>
        </button>
      ))}
      <button type="button" aria-current={tab === "class" ? "page" : undefined} onClick={() => onTab("class")} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === "class" ? "border-violet-600 text-violet-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
        📣 Class board
      </button>
    </div>
  </nav>;
}
