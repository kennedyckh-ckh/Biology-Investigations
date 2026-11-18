import { randomUUID } from "node:crypto";
import { closeSync, createWriteStream, createReadStream, mkdirSync, openSync, readSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { UPLOAD_DIR, all, get, num, type Row } from "./db";
import { LIMITS, type InstructionFile } from "./constants";
import { bad, HttpError, notFound } from "./router";

const DIR = path.join(UPLOAD_DIR, "instructions");
const tooLarge = () => new HttpError(413, "too_large", "Instruction files must be 500 MB or smaller.");
export const uploadsInProgress = new Set<string>();
const previewMimeCache = new Map<string, string | null>();

function previewMime(storageName: string) {
  if (previewMimeCache.has(storageName)) return previewMimeCache.get(storageName) ?? null;
  const head = Buffer.alloc(16);
  let n: number;
  try {
    const fd = openSync(path.join(DIR, storageName), "r");
    try { n = readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
  } catch {
    // Don’t cache an inaccessible file: it may reappear after restoring storage.
    return null;
  }
  const png = n >= 16 && head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && head.toString("latin1", 12, 16) === "IHDR";
  const jpeg = n >= 4 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const webp = n >= 16 && head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(head.toString("latin1", 12, 16));
  const gif = n >= 13 && ["GIF87a", "GIF89a"].includes(head.toString("latin1", 0, 6));
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : gif ? "image/gif" : null;
  if (previewMimeCache.size >= 512) previewMimeCache.clear();
  previewMimeCache.set(storageName, mime);
  return mime;
}

export function attachmentRow(sid: number, part: number, taskId?: string) {
  return taskId === undefined
    ? get("SELECT * FROM instruction_attachments WHERE session_id=? AND part=?", sid, part)
    : get("SELECT * FROM task_instruction_attachments WHERE session_id=? AND part=? AND task_id=?", sid, part, taskId);
}

export function attachmentInfo(sid: number, part: number, prefix = "/api/student", taskId?: string): InstructionFile | null {
  const row = attachmentRow(sid, part, taskId);
  if (!row) return null;
  return fileInfo(row, part, prefix, taskId);
}

export function taskAttachmentInfo(sid: number, part: number, prefix: string) {
  return new Map(all("SELECT * FROM task_instruction_attachments WHERE session_id=? AND part=?", sid, part)
    .map((row) => [String(row.task_id), fileInfo(row, part, prefix, String(row.task_id))]));
}

function fileInfo(row: Row, part: number, prefix: string, taskId?: string): InstructionFile {
  const url = `${prefix}/parts/${part}${taskId ? `/tasks/${encodeURIComponent(taskId)}` : ""}/attachment`;
  const storageName = String(row.storage_name);
  return {
    name: String(row.name), size: num(row.size), url,
    previewUrl: previewMime(storageName) ? `${url}?preview=1&v=${encodeURIComponent(storageName)}` : null,
  };
}

export function removeInstructionFile(storageName: string) {
  previewMimeCache.delete(storageName);
  try {
    unlinkSync(path.join(DIR, storageName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not remove instruction file", error);
  }
}

export async function receiveInstructionFile(req: Request, imageOnly = false) {
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
    if (imageOnly && !previewMime(storageName)) throw new HttpError(415, "not_previewable", "Choose a PNG, JPEG, WebP or GIF diagram.");
    return { storageName, name, size };
  } catch (error) {
    removeInstructionFile(storageName);
    if ((error as NodeJS.ErrnoException).code === "ENOSPC") {
      throw new HttpError(507, "storage_full", "There is not enough storage for this file.");
    }
    throw error;
  }
}

export function downloadInstructionFile(row: Row | undefined, preview = false) {
  if (!row) throw notFound("No instruction file is attached.");
  const storageName = String(row.storage_name);
  const file = path.join(DIR, storageName);
  const size = statSync(file, { throwIfNoEntry: false })?.size;
  if (size !== num(row.size)) throw notFound("The instruction file is unavailable.");
  const name = String(row.name);
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const mime = preview ? previewMime(storageName) : null;
  if (preview && !mime) throw new HttpError(415, "not_previewable", "This attachment is not a supported image.");
  return new Response(Readable.toWeb(createReadStream(file)) as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime ?? "application/octet-stream",
      "Content-Disposition": `${mime ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
