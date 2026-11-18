import { get } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  try {
    get("SELECT 1 FROM users LIMIT 1");
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Database readiness check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
