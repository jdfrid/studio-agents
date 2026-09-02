import type {
  DestinationDraft,
  NetworkAdapter,
  OAuthExchangeInput,
  OAuthStartInput,
  PollContext,
  PublishContext,
  PublishHandle,
  SocialTokens
} from "./types.js";
import { baseAdapter } from "./base.js";
import { SocialApiError, socialFormJson, socialJson, socialRequest } from "./http.js";

const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"];

function tiktokApp(): { key: string; secret: string } {
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!key || !secret) throw new SocialApiError("tiktok", "TikTok OAuth is not configured", 501, "not_configured");
  return { key, secret };
}

function directPostEnabled(): boolean {
  return process.env.TIKTOK_DIRECT_POST === "1";
}

export function createTiktokAdapter(): NetworkAdapter {
  return {
    ...baseAdapter("tiktok"),
    authKind: "oauth2",
    envKeys: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    pkce: true,
    async startOAuth(input: OAuthStartInput) {
      const { key } = tiktokApp();
      const params = new URLSearchParams({
        client_key: key,
        redirect_uri: input.redirectUri,
        response_type: "code",
        scope: TIKTOK_SCOPES.join(","),
        state: input.state
      });
      if (input.codeChallenge) {
        params.set("code_challenge", input.codeChallenge);
        params.set("code_challenge_method", "S256");
      }
      return { authorizeUrl: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}` };
    },
    async exchangeOAuth(input: OAuthExchangeInput) {
      const { key, secret } = tiktokApp();
      const raw = await socialFormJson<{
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        open_id?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      }>("tiktok", "https://open.tiktokapis.com/v2/oauth/token/", {
        client_key: key,
        client_secret: secret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
        ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {})
      });
      if (!raw.access_token) {
        throw new SocialApiError("tiktok", raw.error_description || raw.error || "TikTok token exchange failed", 400, "auth_expired");
      }
      const tokens: SocialTokens = {
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token,
        expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000).toISOString() : undefined,
        extra: { openId: raw.open_id, scope: raw.scope }
      };
      const identity = await this.identify!(tokens);
      identity.externalUserId = raw.open_id || identity.externalUserId;
      identity.scopes = raw.scope?.split(",") ?? TIKTOK_SCOPES;
      return { tokens, identity };
    },
    async refreshAuth(tokens) {
      if (!tokens.refreshToken) return null;
      const { key, secret } = tiktokApp();
      const raw = await socialFormJson<{ access_token?: string; refresh_token?: string; expires_in?: number }>(
        "tiktok",
        "https://open.tiktokapis.com/v2/oauth/token/",
        {
          client_key: key,
          client_secret: secret,
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken
        }
      );
      if (!raw.access_token) return null;
      return {
        ...tokens,
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token ?? tokens.refreshToken,
        expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000).toISOString() : tokens.expiresAt
      };
    },
    async identify(tokens) {
      const me = await socialJson<{ data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } } }>(
        "tiktok",
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        { headers: { authorization: `Bearer ${tokens.accessToken}` } }
      );
      const user = me.data?.user;
      return {
        externalUserId: user?.open_id || String(tokens.extra?.openId ?? "tiktok"),
        displayName: user?.display_name || "TikTok",
        avatarUrl: user?.avatar_url
      };
    },
    async listDestinations(tokens): Promise<DestinationDraft[]> {
      const identity = await this.identify!(tokens);
      return [
        {
          kind: "profile",
          externalId: identity.externalUserId,
          name: identity.displayName,
          url: "https://www.tiktok.com/"
        }
      ];
    },
    async publish(ctx: PublishContext): Promise<PublishHandle> {
      const video = ctx.media.find((item) => item.item.kind === "video");
      const image = ctx.media.find((item) => item.item.kind === "image");
      const caption = ctx.preview.nativeCopy.caption || ctx.copy.body || "";
      const privacy = ctx.destination.config.privacy === "private" ? "SELF_ONLY" : "PUBLIC_TO_EVERYONE";
      const inbox = ctx.mode === "draft" || !directPostEnabled();

      if (video) {
        const path = inbox
          ? "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
          : "https://open.tiktokapis.com/v2/post/publish/video/init/";
        const init = await socialJson<{
          data?: { publish_id?: string; upload_url?: string };
          error?: { message?: string };
        }>("tiktok", path, {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.tokens.accessToken}` },
          body: {
            post_info: {
              title: caption.slice(0, 150),
              privacy_level: privacy,
              disable_comment: ctx.destination.config.disableComment === true
            },
            source_info: {
              source: "FILE_UPLOAD",
              video_size: video.body.byteLength,
              chunk_size: video.body.byteLength,
              total_chunk_count: 1
            }
          }
        });
        const uploadUrl = init.data?.upload_url;
        const publishId = init.data?.publish_id;
        if (!uploadUrl || !publishId) {
          throw new SocialApiError("tiktok", init.error?.message || "TikTok init failed", 502, "upload_failed");
        }
        const uploaded = await socialRequest("tiktok", uploadUrl, {
          method: "PUT",
          headers: {
            "content-type": video.mimeType,
            "content-length": String(video.body.byteLength),
            "content-range": `bytes 0-${video.body.byteLength - 1}/${video.body.byteLength}`
          },
          body: video.body,
          timeoutMs: 10 * 60_000
        });
        if (uploaded.status >= 300) {
          throw new SocialApiError("tiktok", `TikTok upload failed: ${uploaded.text.slice(0, 300)}`, uploaded.status, "upload_failed", uploaded.text);
        }
        return {
          status: "processing",
          poll: { publishId },
          nativePayload: { inbox, caption, privacy }
        };
      }

      if (image?.publicUrl) {
        const init = await socialJson<{ data?: { publish_id?: string } }>(
          "tiktok",
          "https://open.tiktokapis.com/v2/post/publish/content/init/",
          {
            method: "POST",
            headers: { authorization: `Bearer ${ctx.tokens.accessToken}` },
            body: {
              post_info: { title: caption.slice(0, 150), privacy_level: privacy },
              source_info: {
                source: "PULL_FROM_URL",
                photo_cover_index: 0,
                photo_images: [image.publicUrl]
              },
              post_mode: inbox ? "MEDIA_UPLOAD" : "DIRECT_POST",
              media_type: "PHOTO"
            }
          }
        );
        const publishId = init.data?.publish_id;
        if (!publishId) throw new SocialApiError("tiktok", "TikTok photo init failed", 502, "upload_failed");
        return { status: "processing", poll: { publishId }, nativePayload: { media: "PHOTO", inbox } };
      }

      throw new SocialApiError("tiktok", "TikTok requires a video or photo", 400, "validation");
    },
    async poll(ctx: PollContext): Promise<PublishHandle> {
      const publishId = String(ctx.handle.publishId ?? "");
      if (!publishId) throw new SocialApiError("tiktok", "missing publishId", 400, "validation");
      const status = await socialJson<{
        data?: { status?: string; publicaly_available_post_id?: string[]; fail_reason?: string };
      }>("tiktok", "https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: { authorization: `Bearer ${ctx.tokens.accessToken}` },
        body: { publish_id: publishId }
      });
      const code = (status.data?.status || "").toUpperCase();
      if (code === "PROCESSING_UPLOAD" || code === "PROCESSING_DOWNLOAD" || code === "SENDING_TO_USER_INBOX") {
        return { status: code === "SENDING_TO_USER_INBOX" ? "draft" : "processing", poll: ctx.handle };
      }
      if (code === "PUBLISH_COMPLETE" || code === "PUBLISHED") {
        const postId = status.data?.publicaly_available_post_id?.[0];
        return { status: "published", remotePostId: postId ?? publishId };
      }
      if (code === "FAILED") {
        throw new SocialApiError("tiktok", status.data?.fail_reason || "TikTok publish failed", 400, "network_rejected");
      }
      return { status: "processing", poll: ctx.handle };
    }
  };
}
