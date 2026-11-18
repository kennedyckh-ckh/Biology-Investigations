import type { TableData } from "@/components/ui";
import type { DesignTagHint, InstructionFile } from "@/lib/constants";

export interface Entry {
  id: number;
  part: number;
  studentId: number;
  author: { name: string; class: string; classNo: string };
  tag: string | null;
  body: string;
  hasImage: boolean;
  table: TableData | null;
  createdAt: number;
  updatedAt: number;
  mine?: boolean;
}
export interface Submission {
  status: "draft" | "submitted" | "revising";
  revision: number;
  submittedAt: number | null;
}
export interface PartInfo {
  part: number;
  title: string;
  locked: boolean;
  instructions?: string;
  webLink?: string;
  attachment?: InstructionFile | null;
  designTagHints?: DesignTagHint[];
  questions?: { id: number; text: string }[];
  submission?: Submission;
  entryCount?: number;
}
export interface StateResp {
  student: { id: number; name: string; class: string; classNo: string };
  session: { title: string; archived: boolean };
  group: { id: number; name: string; members: { id: number; name: string; class: string; classNo: string; me: boolean; online: boolean }[] };
  parts: PartInfo[];
  entryTags: string[];
  serverTime: number;
}
export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";
