import type { PartInfo } from "./types";
import { partIcon, WorkspaceIcon } from "@/components/workspace-icon";

type Tab = number | "class";

export function visibleStudentTab(parts: PartInfo[], selected: Tab): Tab {
  return selected === "class" || parts.some((p) => p.part === selected) ? selected : parts[0]?.part ?? "class";
}

export function WorkspaceNav({ parts, tab, onTab }: { parts: PartInfo[]; tab: Tab; onTab: (tab: Tab) => void }) {
  return <nav className="border-b border-blue-200 bg-white" aria-label="Parts">
    <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
      {parts.map((p) => (
        <button key={p.part} type="button" aria-current={tab === p.part ? "page" : undefined} onClick={() => onTab(p.part)} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-semibold sm:px-4 ${tab === p.part ? "border-blue-700 bg-blue-50 text-blue-900" : "border-transparent text-slate-600 hover:bg-blue-50 hover:text-blue-900"}`}>
          <WorkspaceIcon name={p.locked ? "lock" : partIcon(p.part)} className="h-3.5 w-3.5" />
          {p.submission?.status === "submitted" && <span aria-label="Submitted">✓</span>}
          Part {p.part}
          <span className="ml-1 hidden font-normal sm:inline">· {p.title.split(": ")[1]}</span>
        </button>
      ))}
      <button type="button" aria-current={tab === "class" ? "page" : undefined} onClick={() => onTab("class")} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-semibold sm:px-4 ${tab === "class" ? "border-blue-700 bg-blue-50 text-blue-900" : "border-transparent text-slate-600 hover:bg-blue-50 hover:text-blue-900"}`}>
        <WorkspaceIcon name="board" className="h-3.5 w-3.5" />Class board
      </button>
    </div>
  </nav>;
}
