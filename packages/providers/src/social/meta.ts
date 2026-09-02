import type { ConnectionIdentity, SocialTokens } from "./types.js";
import { SocialApiError, socialJson } from "./http.js";

const GRAPH = "https://graph.facebook.com/v21.0";

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "business_management"
];

export function metaApp(): { id: string; secret: string } {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new SocialApiError("facebook", "Meta OAuth is not configured", 501, "not_configured");
  return { id, secret };
}

export function metaAuthorizeUrl(redirectUri: string, state: string): { authorizeUrl: string } {
  const { id } = metaApp();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: META_SCOPES.join(",")
  });
  return { authorizeUrl: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}` };
}

export async function exchangeMetaCode(code: string, redirectUri: string): Promise<SocialTokens> {
  const { id, secret } = metaApp();
  const shortLived = await socialJson<{ access_token: string; expires_in?: number }>(
    "facebook",
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      code
    }).toString()}`
  );
  const longLived = await socialJson<{ access_token: string; expires_in?: number }>(
    "facebook",
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: id,
      client_secret: secret,
      fb_exchange_token: shortLived.access_token
    }).toString()}`
  ).catch(() => shortLived);
  const expiresIn = longLived.expires_in ?? shortLived.expires_in;
  return {
    accessToken: longLived.access_token,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined
  };
}

export async function graphGet<T>(network: string, tokens: SocialTokens, path: string): Promise<T> {
  const join = path.includes("?") ? "&" : "?";
  return socialJson<T>(network, `${GRAPH}${path}${join}access_token=${encodeURIComponent(tokens.accessToken)}`);
}

export async function graphPost<T>(
  network: string,
  path: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<T> {
  return socialJson<T>(network, `${GRAPH}${path}`, {
    method: "POST",
    body: { ...body, access_token: accessToken }
  });
}

export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string };
}

export async function listMetaPages(tokens: SocialTokens): Promise<MetaPage[]> {
  const data = await graphGet<{ data?: MetaPage[] }>(
    "facebook",
    tokens,
    "/me/accounts?fields=id,name,access_token,instagram_business_account"
  );
  return data.data ?? [];
}

export async function metaIdentity(tokens: SocialTokens): Promise<ConnectionIdentity> {
  const me = await graphGet<{ id: string; name?: string }>("facebook", tokens, "/me?fields=id,name");
  return { externalUserId: me.id, displayName: me.name ?? me.id };
}

export function pageToken(tokens: SocialTokens, pageId: string): string {
  return tokens.pageTokens?.[pageId] || tokens.accessToken;
}
