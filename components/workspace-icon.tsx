import type { ReactNode } from "react";

const paths: Record<string, string> = {
  design: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5ZM14.5 5.5l3 3",
  enact: "M9 3h6M10 3v6L4.3 18.4A1.7 1.7 0 0 0 5.7 21h12.6a1.7 1.7 0 0 0 1.4-2.6L14 9V3M7.5 14h9",
  reflect: "M4 5h16v11H9l-5 4V5Zm4 5h8m-8 3h5",
  task: "M8 4H5v17h14V4h-3M9 3h6v4H9V3Zm0 9h6m-6 4h6",
  diagram: "M3 4h18v16H3V4Zm0 12 5-5 4 4 2-2 7 6M16 8h.01",
  question: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-12-2a3 3 0 1 1 4 2.8c-.7.3-1 .7-1 1.2m0 3h.01",
  entries: "M4 4h16v4H4V4Zm0 8h7v8H4v-8Zm11 0h5m-5 4h5m-5 4h5",
  link: "M10 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1m2 6a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  lock: "M6 10h12v10H6V10Zm2 0V7a4 4 0 0 1 8 0v3m-4 4v2",
};
type IconName = "design" | "enact" | "reflect" | "task" | "diagram" | "question" | "entries" | "link" | "lock";
export function partIcon(part: number): IconName { return part === 1 ? "design" : part === 2 ? "enact" : "reflect"; }

export function WorkspaceIcon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return <svg className={`shrink-0 ${className}`} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function WorkspaceHeading({ icon, as: Heading = "h3", children }: { icon: IconName; as?: "h3" | "h4"; children: ReactNode }) {
  return <Heading className={`flex items-center gap-2.5 font-semibold tracking-tight text-blue-950 ${Heading === "h3" ? "text-lg" : "text-sm"}`}>
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700"><WorkspaceIcon name={icon} /></span>
    {children}
  </Heading>;
}
