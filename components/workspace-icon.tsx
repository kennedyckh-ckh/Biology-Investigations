import type { ReactNode } from "react";

const paths = {
  design: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5ZM14.5 5.5l3 3",
  enact: "M9 3h6M10 3v6L4.3 18.4A1.7 1.7 0 0 0 5.7 21h12.6a1.7 1.7 0 0 0 1.4-2.6L14 9V3M7.5 14h9",
  reflect: "M4 5h16v11H9l-5 4V5Zm4 5h8m-8 3h5",
  task: "M8 4H5v17h14V4h-3M9 3h6v4H9V3Zm0 9h6m-6 4h6",
  diagram: "M3 4h18v16H3V4Zm0 12 5-5 4 4 2-2 7 6M16 8h.01",
  question: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-12-2a3 3 0 1 1 4 2.8c-.7.3-1 .7-1 1.2m0 3h.01",
  entries: "M4 4h16v4H4V4Zm0 8h7v8H4v-8Zm11 0h5m-5 4h5m-5 4h5",
  link: "M10 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1m2 6a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  lock: "M6 10h12v10H6V10Zm2 0V7a4 4 0 0 1 8 0v3m-4 4v2",
  board: "M3 4h18v13H3V4Zm4 5h10m-10 4h6m-1 4v4m-4 0h8",
  monitor: "M3 4h18v13H3V4Zm3 7h3l2-4 2 7 2-3h3m-8 6v4m-4 0h12",
  settings: "M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4",
  groups: "M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-8a4 4 0 0 1 0 8",
  share: "M15 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm3-5 4-4m-4 8 4 4",
  analysis: "M3 4v16h18M7 16v-4m5 4V8m5 8V5",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4",
  upload: "M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  arrow: "M4 12h15m-6-6 6 6-6 6",
} as const;
export type IconName = keyof typeof paths;
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
