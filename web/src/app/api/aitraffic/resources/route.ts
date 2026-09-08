import { NextResponse } from "next/server";
import {
  fetchGoogleTokensFromDb,
  getValidAccessToken,
  listAnalyticsProperties,
  listSearchConsoleSites,
} from "@/lib/googleApi";
import { validateBridgeSecret, verifyBridgeToken } from "@/lib/aitraffic-bridge.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request) {
  const secret = process.env.AITRAFFIC_BRIDGE_SECRET;
  if (!validateBridgeSecret(secret) || request.headers.get("x-aitraffic-bridge-secret") !== secret) return null;
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  return bearer ? verifyBridgeToken(bearer, secret) : null;
}

export async function GET(request: Request) {
  const bridge = authorize(request);
  if (!bridge) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const credentials = await fetchGoogleTokensFromDb(bridge.userId);
  if (!credentials?.accessToken) {
    return NextResponse.json({ connected: false, gaProperties: [], gscSites: [], warnings: ["google_not_connected"] }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const accessToken = await getValidAccessToken(credentials.accessToken, credentials.refreshToken);
    const [ga, gsc] = await Promise.allSettled([
      listAnalyticsProperties(accessToken),
      listSearchConsoleSites(accessToken),
    ]);
    const warnings: string[] = [];
    if (ga.status === "rejected") warnings.push("ga4_unavailable");
    if (gsc.status === "rejected") warnings.push("gsc_unavailable");
    const gaProperties = ga.status === "fulfilled"
      ? ga.value.map((property) => ({ propertyId: property.property, displayName: property.displayName }))
      : [];
    const gscSites = gsc.status === "fulfilled"
      ? gsc.value.map((site: { siteUrl?: string; permissionLevel?: string }) => ({ siteUrl: site.siteUrl ?? "", permissionLevel: site.permissionLevel ?? "" }))
      : [];
    return NextResponse.json({ connected: true, gaProperties, gscSites, warnings }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ connected: false, gaProperties: [], gscSites: [], warnings: ["google_connection_unavailable"] }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
