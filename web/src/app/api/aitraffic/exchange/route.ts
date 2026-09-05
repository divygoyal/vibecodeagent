import { NextResponse } from "next/server";
import { consumeAuthorizationCode, createBridgeToken, validateBridgeSecret } from "@/lib/aitraffic-bridge.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.AITRAFFIC_BRIDGE_SECRET;
  return validateBridgeSecret(secret) && request.headers.get("x-aitraffic-bridge-secret") === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const secret = process.env.AITRAFFIC_BRIDGE_SECRET!;
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  if (!body || typeof body.code !== "string") {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  const authorization = consumeAuthorizationCode(body.code);
  if (!authorization) return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  return NextResponse.json({ bridgeToken: createBridgeToken({ userId: authorization.userId, secret }) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
