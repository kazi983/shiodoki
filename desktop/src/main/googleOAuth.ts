/**
 * Google sign-in for the desktop app (requirements A-03).
 *
 * Google blocks sign-in inside embedded browsers such as Electron windows,
 * so the system browser is opened instead and the result comes back to a
 * temporary server on 127.0.0.1 (OAuth "loopback" flow with PKCE). The
 * resulting Google ID token is then handed to Firebase Authentication.
 *
 * Needs an OAuth client of type "Desktop app" from the same Google Cloud
 * project as Firebase. For installed apps Google does not treat the client
 * secret as confidential, but it is still kept out of git
 * (resources/oauth-client.json, see README).
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Read the JSON downloaded from Google Cloud console ({"installed": {...}}). */
export function loadOAuthClient(file: string): OAuthClient | null {
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const c = raw.installed ?? raw;
  if (typeof c.client_id !== "string" || typeof c.client_secret !== "string") {
    throw new Error(`${file} に client_id / client_secret がありません`);
  }
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrl(clientId: string, redirectUri: string, challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

/** Result of the browser redirect to the loopback server. */
export function parseCallback(
  url: string,
  expectedState: string,
): { code: string } | { error: string } | null {
  const u = new URL(url, "http://127.0.0.1");
  if (u.pathname !== "/") return null;
  if (u.searchParams.get("state") !== expectedState) return { error: "state が一致しません" };
  const error = u.searchParams.get("error");
  if (error) return { error: error === "access_denied" ? "ログインがキャンセルされました" : error };
  const code = u.searchParams.get("code");
  return code ? { code } : null;
}

const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="ja"><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:sans-serif;text-align:center;padding:48px;background:#0b1326;color:#dae2fd">` +
  `<h1>${title}</h1><p>${body}</p></body></html>`;

/**
 * Run the whole flow and return a Google ID token.
 * `openBrowser` is shell.openExternal in production.
 */
export async function signInWithGoogle(
  client: OAuthClient,
  openBrowser: (url: string) => Promise<void>,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const { timeoutMs = 5 * 60_000, fetchImpl = fetch } = options;
  const { verifier, challenge } = createPkce();
  const state = base64url(randomBytes(16));

  let server: Server | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
      let redirectUri = "";
      server = createServer((req, res) => {
        const result = parseCallback(req.url ?? "/", state);
        if (!result) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        if ("error" in result) {
          res.end(PAGE("ログインできませんでした", result.error));
          reject(new Error(result.error));
        } else {
          res.end(PAGE("ログインしました", "このタブを閉じて、アプリに戻ってください。"));
          resolve({ code: result.code, redirectUri });
        }
      });
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const { port } = server!.address() as AddressInfo;
        redirectUri = `http://127.0.0.1:${port}`;
        openBrowser(buildAuthUrl(client.clientId, redirectUri, challenge, state)).catch(reject);
      });
      timer = setTimeout(() => reject(new Error("ログインがタイムアウトしました")), timeoutMs);
    });

    const res = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const body = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
    if (!res.ok || !body.id_token) {
      throw new Error(`Google のトークン取得に失敗しました: ${body.error_description ?? body.error ?? res.status}`);
    }
    return body.id_token;
  } finally {
    clearTimeout(timer);
    server?.close();
  }
}
