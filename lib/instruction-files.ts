import { randomUUID } from "node:crypto";
import { createWriteStream, createReadStream, mkdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { UPLOAD_DIR, get, num, type Row } from "./db";
import { LIMITS, type InstructionFile } from "./constants";
import { bad, HttpError, notFound } from "./router";

const DIR = path.join(UPLOAD_DIR, "instructions");
const tooLarge = () => new HttpError(413, "too_large", "Instruction files must be 500 MB or smaller.");
export const uploadsInProgress = new Set<string>();

export function attachmentRow(sid: number, part: number) {
  return get("SELECT * FROM instruction_attachments WHERE session_id=? AND part=?", sid, part);
}

export function attachmentInfo(sid: number, part: number, teacher = false): InstructionFile | null {
  const row = attachmentRow(sid, part);
  const prefix = teacher ? `/api/teacher/sessions/${sid}` : "/api/student";
  return row ? { name: String(row.name), size: num(row.size), url: `${prefix}/parts/${part}/attachment` } : null;
}

export function removeInstructionFile(storageName: string) {
  try {
    unlinkSync(path.join(DIR, storageName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not remove instruction file", error);
  }
}

export async function receiveInstructionFile(req: Request) {
  const declaredSize = Number(req.headers.get("content-length"));
  if (declaredSize > LIMITS.instructionFileBytes) throw tooLarge();
  let name: string;
  try {
    name = decodeURIComponent(req.headers.get("x-instruction-filename") ?? "")
      .replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
  } catch {
    throw bad("Invalid filename.");
  }
  if (!name || name.length > 255) throw bad("Choose a file with a name of up to 255 characters.");
  if (!req.body) throw bad("Choose a file to upload.");
  const storageName = randomUUID();
  const input = Readable.fromWeb(req.body as unknown as NodeReadableStream<Uint8Array>);
  let size = 0;
  try {
    mkdirSync(DIR, { recursive: true });
    await pipeline(input, async function* (source) {
      for await (const chunk of source) {
        size += chunk.length;
        if (size > LIMITS.instructionFileBytes) throw tooLarge();
        yield chunk;
      }
    }, createWriteStream(path.join(DIR, storageName), { flags: "wx" }));
    if (!size || (declaredSize > 0 && size !== declaredSize)) throw bad("The file is empty or the upload was incomplete.");
    return { storageName, name, size };
  } catch (error) {
    removeInstructionFile(storageName);
    if ((error as NodeJS.ErrnoException).code === "ENOSPC") {
      throw new HttpError(507, "storage_full", "There is not enough storage for this file.");
    }
    throw error;
  }
}

export function downloadInstructionFile(row: Row | undefined) {
  if (!row) throw notFound("No instruction file is attached.");
  const file = path.join(DIR, String(row.storage_name));
  const size = statSync(file, { throwIfNoEntry: false })?.size;
  if (size !== num(row.size)) throw notFound("The instruction file is unavailable.");
  const name = String(row.name);
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(Readable.toWeb(createReadStream(file)) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
