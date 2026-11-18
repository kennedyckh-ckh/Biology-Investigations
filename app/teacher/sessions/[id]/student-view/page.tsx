"use client";
import { use, useState } from "react";
import { usePoll } from "@/lib/client/api";
import { ErrorBox, Header, Spinner } from "@/components/ui";
import { ClassBoard } from "@/components/student/class-board";
import { GroupEntryHeading, StudentPartInstructions } from "@/components/student/part-view";
import { visibleStudentTab, WorkspaceNav } from "@/components/student/workspace-nav";
import type { PartInfo } from "@/components/student/types";

type Preview = { title: string; archived: boolean; entryTags: string[]; parts: PartInfo[] };

export default function StudentPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const returnUrl = `/teacher/sessions/${encodeURIComponent(id)}`;
  const endpoint = `${returnUrl}/student-view`;
  const { data, error, loading, refresh } = usePoll<Preview>(endpoint, 5000);
  const [selectedTab, setTab] = useState<number | "class">(1);
  if (loading && !data) return <Spinner label="Opening student preview…" />;
  if (!data || error?.status === 401 || error?.status === 403 || error?.status === 404) return (
    <main className="mx-auto max-w-lg space-y-3 p-6">
      <ErrorBox message={error?.message || "Could not open student preview."} onRetry={refresh} />
      <a className="btn-ghost" href={returnUrl}>Back to teacher session</a>
    </main>
  );
  const tab = visibleStudentTab(data.parts, selectedTab);
  const part = data.parts.find((p) => p.part === tab);
  return <div className="min-h-screen">
    <Header title={data.title} sub="Student view · Read-only preview" right={<a className="btn-ghost btn-sm" href={returnUrl}>Back to teacher session</a>} />
    <div className="border-b border-blue-100 bg-blue-50 px-4 py-2.5 text-center text-sm text-blue-950">
      Preview the instructions, released hints and Class board. This view does not join a group or create student work.
    </div>
    {data.archived && <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">This session is archived.</div>}
    <WorkspaceNav parts={data.parts} tab={tab} onTab={setTab} />
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {error && <ErrorBox message="Could not refresh this preview." onRetry={refresh} />}
      {part && <StudentPartInstructions key={part.part} info={part} />}
      {part && !part.locked && <>
        <GroupEntryHeading key={part.part} info={part} />
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-blue-950">Entry tags available to students</h3>
          <p className="text-sm text-slate-600">Group entries, drafting and submissions aren’t shown in this preview.</p>
          <ul className="mt-3 flex flex-wrap gap-2">{data.entryTags.map((tag) => <li key={tag} className="badge bg-blue-50 text-blue-900">{tag}</li>)}</ul>
        </section>
      </>}
      {tab === "class" && <ClassBoard previewEndpoint={`${endpoint}/class`} />}
    </main>
  </div>;
}
