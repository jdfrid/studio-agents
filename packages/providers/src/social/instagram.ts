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
import { SocialApiError, socialJson } from "./http.js";
import { META_SCOPES, exchangeMetaCode, graphGet, graphPost, listMetaPages, metaAuthorizeUrl, metaIdentity, pageToken } from "./meta.js";

const GRAPH = "https://graph.facebook.com/v21.0";

async function igUser(tokens: SocialTokens, igUserId: string, pageId?: string) {
  const access = pageId ? pageToken(tokens, pageId) : tokens.accessToken;
  return socialJson<{ id: string; username?: string }>("instagram", `${GRAPH}/${igUserId}?fields=id,username&access_token=${encodeURIComponent(access)}`);
}

export function createInstagramAdapter(): NetworkAdapter {
  return {
    ...baseAdapter("instagram"),
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
      const igPage = pages.find((page) => page.instagram_business_account?.id);
      const identity = igPage?.instagram_business_account
        ? await igUser(tokens, igPage.instagram_business_account.id, igPage.id).then((user) => ({
            externalUserId: user.id,
            displayName: user.username ?? user.id,
            handle: user.username ? `@${user.username}` : undefined,
            scopes: META_SCOPES
          }))
        : await metaIdentity(tokens);
      identity.scopes = META_SCOPES;
      tokens.extra = {
        ...(tokens.extra ?? {}),
        igPageMap: Object.fromEntries(
          pages
            .filter((page) => page.instagram_business_account?.id)
            .map((page) => [page.instagram_business_account!.id, page.id])
        )
      };
      return { tokens, identity };
    },
    async identify(tokens) {
      return metaIdentity(tokens);
    },
    async listDestinations(tokens): Promise<DestinationDraft[]> {
      const pages = await listMetaPages(tokens);
      const drafts: DestinationDraft[] = [];
      for (const page of pages) {
        const igId = page.instagram_business_account?.id;
        if (!igId) continue;
        const user = await igUser(tokens, igId, page.id).catch(() => ({ id: igId, username: undefined as string | undefined }));
        drafts.push({
          kind: "profile",
          externalId: igId,
          name: user.username ?? page.name,
          handle: user.username ? `@${user.username}` : undefined,
          url: user.username ? `https://www.instagram.com/${user.username}` : undefined,
          config: {
            pageAccessToken: page.access_token,
            categoryId: page.id
          }
        });
      }
      return drafts;
    },
    async publish(ctx: PublishContext): Promise<PublishHandle> {
      const igUserId = ctx.destination.externalId;
      const access = ctx.destination.config.pageAccessToken || pageToken(ctx.tokens, ctx.destination.config.categoryId ?? "");
      const caption = ctx.preview.nativeCopy.caption || "";
      const video = ctx.media.find((item) => item.item.kind === "video");
      const images = ctx.media.filter((item) => item.item.kind === "image");

      if (video) {
        if (!video.publicUrl) throw new SocialApiError("instagram", "Instagram Reels require a public video URL", 400, "validation");
        const created = await graphPost<{ id?: string }>(
          "instagram",
          `/${igUserId}/media`,
          {
            media_type: "REELS",
            video_url: video.publicUrl,
            caption,
            cover_url: ctx.cover?.publicUrl,
            share_to_feed: true
          },
          access
        );
        if (!created.id) throw new SocialApiError("instagram", "Instagram did not return a container id", 502, "upload_failed");
        return {
          status: "processing",
          poll: { creationId: created.id, accessHint: ctx.destination.config.categoryId },
          nativePayload: { media_type: "REELS", caption }
        };
      }

      if (images.length > 1) {
        const children: string[] = [];
        for (const image of images.slice(0, 10)) {
          if (!image.publicUrl) throw new SocialApiError("instagram", "Instagram carousel items require public URLs", 400, "validation");
          const child = await graphPost<{ id?: string }>(
            "instagram",
            `/${igUserId}/media`,
            { is_carousel_item: true, image_url: image.publicUrl },
            access
          );
          if (child.id) children.push(child.id);
        }
        const created = await graphPost<{ id?: string }>(
          "instagram",
          `/${igUserId}/media`,
          { media_type: "CAROUSEL", children: children.join(","), caption },
          access
        );
        if (!created.id) throw new SocialApiError("instagram", "Instagram carousel container missing", 502, "upload_failed");
        return {
          status: "processing",
          poll: { creationId: created.id },
          nativePayload: { media_type: "CAROUSEL", caption }
        };
      }

      const image = images[0];
      if (!image?.publicUrl) throw new SocialApiError("instagram", "Instagram requires an image or video URL", 400, "validation");
      const created = await graphPost<{ id?: string }>(
        "instagram",
        `/${igUserId}/media`,
        { image_url: image.publicUrl, caption },
        access
      );
      if (!created.id) throw new SocialApiError("instagram", "Instagram did not return a container id", 502, "upload_failed");
      return {
        status: "processing",
        poll: { creationId: created.id },
        nativePayload: { media_type: "IMAGE", caption }
      };
    },
    async poll(ctx: PollContext): Promise<PublishHandle> {
      const creationId = String(ctx.handle.creationId ?? "");
      if (!creationId) throw new SocialApiError("instagram", "missing creationId", 400, "validation");
      const access = ctx.destination.config.pageAccessToken || pageToken(ctx.tokens, ctx.destination.config.categoryId ?? "");
      const status = await graphGet<{ status_code?: string; status?: string }>(
        "instagram",
        { accessToken: access },
        `/${creationId}?fields=status_code,status`
      );
      const code = (status.status_code || status.status || "").toUpperCase();
      if (code === "IN_PROGRESS" || code === "PENDING") {
        return { status: "processing", poll: ctx.handle };
      }
      if (code && code !== "FINISHED" && code !== "PUBLISHED") {
        throw new SocialApiError("instagram", `container status ${code}`, 400, "network_rejected");
      }
      const published = await graphPost<{ id?: string }>(
        "instagram",
        `/${ctx.destination.externalId}/media_publish`,
        { creation_id: creationId },
        access
      );
      return {
        status: "published",
        remotePostId: published.id,
        remoteUrl: published.id ? `https://www.instagram.com/p/${published.id}/` : undefined
      };
    }
  };
}
