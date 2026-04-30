import axios from "axios";
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CLI_CLIENT_ID, GITHUB_CLI_CLIENT_SECRET } from "../config/env.js";

/**
 * Exchange OAuth code for GitHub access token
 */
export async function exchangeCodeForToken({ code, redirect_uri, code_verifier, source }) {
  const params = {
    client_id:     source === "cli" ? GITHUB_CLI_CLIENT_ID     : GITHUB_CLIENT_ID,
    client_secret: source === "cli" ? GITHUB_CLI_CLIENT_SECRET : GITHUB_CLIENT_SECRET,
    code,
    redirect_uri,
  };

  if (code_verifier) params.code_verifier = code_verifier;

  const { data } = await axios.post(
      "https://github.com/login/oauth/access_token",
      params,
      { headers: { Accept: "application/json" } }
  );

  if (data.error) {
    throw Object.assign(new Error(data.error_description || "GitHub OAuth failed"), { statusCode: 502 });
  }

  return data.access_token;
}

/**
 * Fetch authenticated GitHub user info
 */
export async function getGitHubUser(githubToken) {
  const { data } = await axios.get("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  return data;
}

/**
 * Build GitHub OAuth authorization URL
 */
export function buildGitHubAuthUrl({ state, redirectUri, codeChallenge, source }) {
  const clientId = source === "cli"
      ? process.env.GITHUB_CLI_CLIENT_ID
      : process.env.GITHUB_CLIENT_ID;

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    scope:        "read:user user:email",
    state,
  });

  if (codeChallenge) {
    params.set("code_challenge",        codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
