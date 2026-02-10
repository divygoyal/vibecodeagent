export const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";

export function getGitHubAuthUrl(clientId: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo read:user user:email",
    state: Math.random().toString(36).substring(7),
  });
  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

export async function getGitHubAccessToken(clientId: string, clientSecret: string, code: string) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
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
  });
  return res.json();
}
