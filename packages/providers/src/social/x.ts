import { createHash, randomBytes } from "node:crypto";
import type {
  DestinationDraft,
  NetworkAdapter,
  OAuthExchangeInput,
  OAuthStartInput,
  PublishContext,
  PublishHandle,
  SocialTokens
} from "./types.js";
import { baseAdapter } from "./base.js";
import { SocialApiError, socialFormJson, socialJson, socialRequest } from "./http.js";

const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"];

function xClient(): { id: string; secret: string } {
  const id = process.env.X_CLIENT_ID;
  const secret = process.env.X_CLIENT_SECRET;
  if (!id || !secret) throw new SocialApiError("x", "X OAuth is not configured", 501, "not_configured");
  return { id, secret };
}

function basicAuth(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export function createXAdapter(): NetworkAdapter {
  return {
    ...baseAdapter("x"),
    authKind: "oauth2",
    envKeys: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    pkce: true,
    async startOAuth(input: OAuthStartInput) {
      const { id } = xClient();
      const challenge = input.codeChallenge;
      if (!challenge) throw new SocialApiError("x", "PKCE code_challenge required", 400, "validation");
      const params = new URLSearchParams({
        response_type: "code",
        client_id: id,
        redirect_uri: input.redirectUri,
        scope: X_SCOPES.join(" "),
        state: input.state,
        code_challenge: challenge,
        code_challenge_method: "S256"
      });
      return { authorizeUrl: `https://twitter.com/i/oauth2/authorize?${params.toString()}` };
    },
    async exchangeOAuth(input: OAuthExchangeInput) {
      const { id, secret } = xClient();
      if (!input.codeVerifier) throw new SocialApiError("x", "PKCE code_verifier required", 400, "validation");
      const raw = await socialFormJson<{
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      }>("x", "https://api.twitter.com/2/oauth2/token", {
        code: input.code,
        grant_type: "authorization_code",
        client_id: id,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier
      }, { headers: { authorization: basicAuth(id, secret) } });
      const tokens: SocialTokens = {
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token,
        expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000).toISOString() : undefined,
        extra: { scope: raw.scope }
      };
      const identity = await this.identify!(tokens);
      identity.scopes = raw.scope?.split(/[+ ]/) ?? X_SCOPES;
      return { tokens, identity };
    },
    async refreshAuth(tokens) {
      if (!tokens.refreshToken) return null;
      const { id, secret } = xClient();
      const raw = await socialFormJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(
        "x",
        "https://api.twitter.com/2/oauth2/token",
        {
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
          client_id: id
        },
        { headers: { authorization: basicAuth(id, secret) } }
      );
      return {
        ...tokens,
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token ?? tokens.refreshToken,
        expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000).toISOString() : tokens.expiresAt
      };
    },
    async identify(tokens) {
      const me = await socialJson<{ data?: { id: string; name: string; username: string; profile_image_url?: string } }>(
        "x",
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        { headers: { authorization: `Bearer ${tokens.accessToken}` } }
      );
      const user = me.data;
      if (!user) throw new SocialApiError("x", "Could not load X user", 400, "validation");
      return {
        externalUserId: user.id,
        displayName: user.name,
        handle: `@${user.username}`,
        avatarUrl: user.profile_image_url
      };
    },
    async listDestinations(tokens): Promise<DestinationDraft[]> {
      const identity = await this.identify!(tokens);
      return [
        {
          kind: "profile",
          externalId: identity.externalUserId,
          name: identity.displayName,
          handle: identity.handle,
          url: identity.handle ? `https://x.com/${identity.handle.replace(/^@/, "")}` : undefined
        }
      ];
    },
    async publish(ctx: PublishContext): Promise<PublishHandle> {
      const mediaIds: string[] = [];
      for (const media of ctx.media.slice(0, 4)) {
        const mediaId = await uploadXMedia(ctx.tokens, media.body, media.mimeType, media.item.kind === "video" ? "tweet_video" : "tweet_image");
        mediaIds.push(mediaId);
      }
      const text = ctx.preview.nativeCopy.caption || ctx.copy.body || ctx.copy.title || "";
      const tweet = await socialJson<{ data?: { id: string } }>("x", "https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { authorization: `Bearer ${ctx.tokens.accessToken}` },
        body: {
          text,
          ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {})
        }
      });
      const id = tweet.data?.id;
      return {
        status: "published",
        remotePostId: id,
        remoteUrl: id && ctx.destination.handle ? `https://x.com/${ctx.destination.handle.replace(/^@/, "")}/status/${id}` : undefined,
        nativePayload: { text, mediaIds }
      };
    }
  };
}

async function uploadXMedia(tokens: SocialTokens, body: Buffer, mimeType: string, mediaCategory: string): Promise<string> {
  const init = await socialFormJson<{ media_id_string?: string; media_id?: number }>(
    "x",
    "https://upload.twitter.com/1.1/media/upload.json",
    {
      command: "INIT",
      total_bytes: String(body.byteLength),
      media_type: mimeType,
      media_category: mediaCategory
    },
    { headers: { authorization: `Bearer ${tokens.accessToken}` } }
  );
  const mediaId = init.media_id_string || String(init.media_id ?? "");
  if (!mediaId) throw new SocialApiError("x", "X media INIT returned no id", 502, "upload_failed");

  const chunkSize = 1024 * 1024;
  let segment = 0;
  for (let offset = 0; offset < body.byteLength; offset += chunkSize) {
    const chunk = body.subarray(offset, Math.min(body.byteLength, offset + chunkSize));
    const append = await socialRequest("x", "https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        command: "APPEND",
        media_id: mediaId,
        segment_index: String(segment),
        media_data: chunk.toString("base64")
      }).toString(),
      timeoutMs: 120_000
    });
    if (append.status >= 300) {
      throw new SocialApiError("x", `X media APPEND failed: ${append.text.slice(0, 300)}`, append.status, "upload_failed", append.text);
    }
    segment += 1;
  }

  const finalized = await socialFormJson<{ media_id_string?: string }>(
    "x",
    "https://upload.twitter.com/1.1/media/upload.json",
    { command: "FINALIZE", media_id: mediaId },
    { headers: { authorization: `Bearer ${tokens.accessToken}` } }
  );
  return finalized.media_id_string || mediaId;
}

export function randomPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
