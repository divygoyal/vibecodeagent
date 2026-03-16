export const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";

export function getGitHubAuthUrl(clientId: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo read:user user:email",
    state: crypto.randomUUID(),
  });
  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

export async function getGitHubAccessToken(clientId: string, clientSecret: string, code: string) {
  let res: Response;
  try {
    res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new Error(`GitHub token exchange network error: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: ${res.status}`);
  }
  return res.json();
}
