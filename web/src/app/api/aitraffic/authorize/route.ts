import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ALLOWED_RETURN_TO, issueAuthorizationCode, validateBridgeSecret } from "@/lib/aitraffic-bridge.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to");
  const state = url.searchParams.get("state");
  if (!returnTo || !state || !ALLOWED_RETURN_TO(returnTo)) {
    return NextResponse.json({ error: "invalid_authorization_request" }, { status: 400 });
  }
  if (!validateBridgeSecret(process.env.AITRAFFIC_BRIDGE_SECRET)) {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    const signIn = new URL("/api/auth/signin/google", url.origin);
    signIn.searchParams.set("callbackUrl", url.toString());
    return NextResponse.redirect(signIn);
  }

  const code = issueAuthorizationCode({ userId: String(userId), returnTo, state });
  const callback = new URL(returnTo);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  return NextResponse.redirect(callback);
}
