import type {
  ConnectionIdentity,
  DestinationDraft,
  NetworkAdapter,
  OAuthExchangeInput,
  OAuthStartInput,
  PublishContext,
  PublishHandle,
  SocialTokens
} from "./types.js";
import { baseAdapter } from "./base.js";
import { SocialApiError, socialJson, socialRequest } from "./http.js";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube"
];

export function youtubeClient(): { id: string; secret: string } {
  const id = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new SocialApiError("youtube", "YouTube OAuth is not configured", 501, "not_configured");
  return { id, secret };
}

async function youtubeJson<T>(tokens: SocialTokens, url: string): Promise<T> {
  return socialJson<T>("youtube", url, {
    headers: { authorization: `Bearer ${tokens.accessToken}` }
  });
}

export function createYoutubeAdapter(): NetworkAdapter {
  return {
    ...baseAdapter("youtube"),
    authKind: "oauth2",
    envKeys: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
    pkce: false,
    async startOAuth(input: OAuthStartInput) {
      const { id } = youtubeClient();
      const params = new URLSearchParams({
        client_id: id,
        redirect_uri: input.redirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: YOUTUBE_SCOPES.join(" "),
        state: input.state,
        include_granted_scopes: "true"
      });
      return { authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
    },
    async exchangeOAuth(input: OAuthExchangeInput) {
      const { id, secret } = youtubeClient();
      const tokensRaw = await socialJson<{
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      }>("youtube", "https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: input.code,
          client_id: id,
          client_secret: secret,
          redirect_uri: input.redirectUri,
          grant_type: "authorization_code"
        }).toString()
      });
      const tokens: SocialTokens = {
        accessToken: tokensRaw.access_token,
        refreshToken: tokensRaw.refresh_token,
        expiresAt: tokensRaw.expires_in ? new Date(Date.now() + tokensRaw.expires_in * 1000).toISOString() : undefined,
        extra: { scope: tokensRaw.scope }
      };
      const identity = await this.identify!(tokens);
      identity.scopes = tokensRaw.scope?.split(/\s+/) ?? YOUTUBE_SCOPES;
      return { tokens, identity };
    },
    async refreshAuth(tokens) {
      if (!tokens.refreshToken) return null;
      const { id, secret } = youtubeClient();
      const refreshed = await socialJson<{ access_token: string; expires_in?: number; refresh_token?: string }>(
        "youtube",
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: tokens.refreshToken,
            client_id: id,
            client_secret: secret,
            grant_type: "refresh_token"
          }).toString()
        }
      );
      return {
        ...tokens,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
        expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : tokens.expiresAt
      };
    },
    async identify(tokens): Promise<ConnectionIdentity> {
      const data = await youtubeJson<{
        items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }>;
      }>(tokens, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
      const channel = data.items?.[0];
      if (!channel) throw new SocialApiError("youtube", "No YouTube channel on this Google account", 400, "validation");
      return {
        externalUserId: channel.id,
        displayName: channel.snippet?.title ?? channel.id,
        handle: channel.snippet?.customUrl,
        avatarUrl: channel.snippet?.thumbnails?.default?.url
      };
    },
    async listDestinations(tokens): Promise<DestinationDraft[]> {
      const channels = await youtubeJson<{
        items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string } }>;
      }>(tokens, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
      const drafts: DestinationDraft[] = (channels.items ?? []).map((channel) => ({
        kind: "channel" as const,
        externalId: channel.id,
        name: channel.snippet?.title ?? channel.id,
        handle: channel.snippet?.customUrl,
        url: `https://www.youtube.com/channel/${channel.id}`
      }));
      const playlists = await youtubeJson<{
        items?: Array<{ id: string; snippet?: { title?: string; channelId?: string } }>;
      }>(tokens, "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50").catch(() => ({ items: [] }));
      for (const playlist of playlists.items ?? []) {
        drafts.push({
          kind: "playlist",
          externalId: playlist.id,
          name: playlist.snippet?.title ?? playlist.id,
          url: `https://www.youtube.com/playlist?list=${playlist.id}`,
          config: { categoryId: playlist.snippet?.channelId }
        });
      }
      return drafts;
    },
    async publish(ctx: PublishContext): Promise<PublishHandle> {
      const video = ctx.media.find((item) => item.item.kind === "video");
      if (!video) throw new SocialApiError("youtube", "YouTube requires a video", 400, "validation");
      const isShort = Boolean(ctx.preview.nativeCopy.isShort);
      const title = (ctx.preview.nativeCopy.title || ctx.copy.title || "Untitled").slice(0, 100);
      let description = ctx.preview.nativeCopy.description || ctx.preview.nativeCopy.caption || "";
      if (isShort && !/#shorts/i.test(description)) description = `${description}\n\n#Shorts`.trim();
      const privacy = ctx.destination.config.privacy ?? (ctx.mode === "draft" ? "private" : "public");
      const snippet: Record<string, unknown> = {
        title,
        description,
        tags: ctx.copy.hashtags?.map((tag) => tag.replace(/^#/, "")).slice(0, 15),
        categoryId: ctx.destination.config.categoryId || "22"
      };
      if (ctx.destination.kind === "playlist") {
        snippet.channelId = ctx.destination.config.categoryId;
      }
      const status: Record<string, unknown> = {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: ctx.destination.config.madeForKids === true
      };
      if (ctx.mode === "schedule" && ctx.scheduleAt && privacy !== "private") {
        status.privacyStatus = "private";
        status.publishAt = ctx.scheduleAt.toISOString();
      }

      const init = await socialRequest("youtube", "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.tokens.accessToken}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": video.mimeType,
          "x-upload-content-length": String(video.body.byteLength)
        },
        body: JSON.stringify({ snippet, status }),
        timeoutMs: 60_000
      });
      if (init.status < 200 || init.status >= 300) {
        throw new SocialApiError("youtube", `resume init failed: ${init.text.slice(0, 400)}`, init.status, "upload_failed", init.text);
      }
      const uploadUrl = init.headers.get("location");
      if (!uploadUrl) throw new SocialApiError("youtube", "YouTube did not return an upload URL", 502, "upload_failed");

      const uploaded = await socialRequest("youtube", uploadUrl, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${ctx.tokens.accessToken}`,
          "content-type": video.mimeType,
          "content-length": String(video.body.byteLength)
        },
        body: video.body,
        timeoutMs: 10 * 60_000
      });
      if (uploaded.status < 200 || uploaded.status >= 300) {
        throw new SocialApiError("youtube", `upload failed: ${uploaded.text.slice(0, 400)}`, uploaded.status, "upload_failed", uploaded.text);
      }
      const body = uploaded.text ? (JSON.parse(uploaded.text) as { id?: string }) : {};
      const videoId = body.id;
      if (!videoId) throw new SocialApiError("youtube", "YouTube upload returned no video id", 502, "upload_failed");

      if (ctx.destination.kind === "playlist") {
        await socialJson("youtube", "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.tokens.accessToken}` },
          body: {
            snippet: {
              playlistId: ctx.destination.externalId,
              resourceId: { kind: "youtube#video", videoId }
            }
          }
        }).catch(() => undefined);
      }

      if (ctx.cover) {
        await socialRequest(
          "youtube",
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${ctx.tokens.accessToken}`,
              "content-type": ctx.cover.mimeType
            },
            body: ctx.cover.body,
            timeoutMs: 60_000
          }
        ).catch(() => undefined);
      }

      return {
        status: "published",
        remotePostId: videoId,
        remoteUrl: `https://youtu.be/${videoId}`,
        nativePayload: { title, privacy, isShort, snippet, status }
      };
    }
  };
}
