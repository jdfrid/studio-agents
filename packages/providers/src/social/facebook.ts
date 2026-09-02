import type {
  DestinationDraft,
  NetworkAdapter,
  OAuthExchangeInput,
  OAuthStartInput,
  PublishContext,
  PublishHandle
} from "./types.js";
import { baseAdapter } from "./base.js";
import { SocialApiError } from "./http.js";
import { META_SCOPES, exchangeMetaCode, listMetaPages, metaAuthorizeUrl, metaIdentity, pageToken, graphPost } from "./meta.js";

export function createFacebookAdapter(): NetworkAdapter {
  return {
    ...baseAdapter("facebook"),
    authKind: "oauth2",
    envKeys: ["META_APP_ID", "META_APP_SECRET"],
    pkce: false,
    async startOAuth(input: OAuthStartInput) {
      return metaAuthorizeUrl(input.redirectUri, input.state);
    },
    async exchangeOAuth(input: OAuthExchangeInput) {
      const tokens = await exchangeMetaCode(input.code, input.redirectUri);
      const pages = await listMetaPages(tokens);
      tokens.pageTokens = Object.fromEntries(pages.filter((page) => page.access_token).map((page) => [page.id, page.access_token!]));
      const identity = await metaIdentity(tokens);
      identity.scopes = META_SCOPES;
      return { tokens, identity };
    },
    async identify(tokens) {
      return metaIdentity(tokens);
    },
    async listDestinations(tokens): Promise<DestinationDraft[]> {
      const pages = await listMetaPages(tokens);
      return pages.map((page) => ({
        kind: "page" as const,
        externalId: page.id,
        name: page.name,
        url: `https://www.facebook.com/${page.id}`,
        config: page.access_token ? { pageAccessToken: page.access_token } : undefined
      }));
    },
    async publish(ctx: PublishContext): Promise<PublishHandle> {
      const pageId = ctx.destination.externalId;
      const access = ctx.destination.config.pageAccessToken || pageToken(ctx.tokens, pageId);
      const message = ctx.preview.nativeCopy.caption || ctx.copy.body || "";
      const video = ctx.media.find((item) => item.item.kind === "video");
      const image = ctx.media.find((item) => item.item.kind === "image");
      const scheduled = ctx.mode === "schedule" && ctx.scheduleAt && ctx.scheduleAt.getTime() > Date.now() + 10 * 60_000;
      const published = ctx.mode !== "draft" && !scheduled;

      if (video) {
        const isReel = ctx.preview.nativeCopy.isShort || (video.item.width && video.item.height && video.item.height > video.item.width);
        const path = isReel ? `/${pageId}/video_reels` : `/${pageId}/videos`;
        const body: Record<string, unknown> = {
          description: message,
          published,
          title: ctx.preview.nativeCopy.title || ctx.copy.title
        };
        if (video.publicUrl) body.file_url = video.publicUrl;
        else throw new SocialApiError("facebook", "Facebook video publish requires a public media URL", 400, "validation");
        if (scheduled && ctx.scheduleAt) {
          body.published = false;
          body.scheduled_publish_time = Math.floor(ctx.scheduleAt.getTime() / 1000);
        }
        const result = await graphPost<{ id?: string; post_id?: string }>("facebook", path, body, access);
        const id = result.id || result.post_id;
        return {
          status: scheduled ? "draft" : "published",
          remotePostId: id,
          remoteUrl: id ? `https://www.facebook.com/${id}` : undefined,
          nativePayload: { path, message, scheduled }
        };
      }

      if (image) {
        const body: Record<string, unknown> = { caption: message, published };
        if (image.publicUrl) body.url = image.publicUrl;
        else throw new SocialApiError("facebook", "Facebook photo publish requires a public media URL", 400, "validation");
        if (scheduled && ctx.scheduleAt) {
          body.published = false;
          body.scheduled_publish_time = Math.floor(ctx.scheduleAt.getTime() / 1000);
        }
        const result = await graphPost<{ id?: string; post_id?: string }>("facebook", `/${pageId}/photos`, body, access);
        const id = result.post_id || result.id;
        return {
          status: scheduled ? "draft" : "published",
          remotePostId: id,
          remoteUrl: id ? `https://www.facebook.com/${id}` : undefined,
          nativePayload: { method: "photos", message }
        };
      }

      const body: Record<string, unknown> = { message, published };
      if (scheduled && ctx.scheduleAt) {
        body.published = false;
        body.scheduled_publish_time = Math.floor(ctx.scheduleAt.getTime() / 1000);
      }
      const result = await graphPost<{ id?: string }>("facebook", `/${pageId}/feed`, body, access);
      return {
        status: scheduled ? "draft" : "published",
        remotePostId: result.id,
        remoteUrl: result.id ? `https://www.facebook.com/${result.id}` : undefined,
        nativePayload: { method: "feed", message }
      };
    }
  };
}
