import { socialJson, socialRequest, SocialApiError, tokenExpired, type PublishContext, type PublishHandle, type SocialTokens } from "@studio/providers";
import { previewTransform, type CapabilityManifest, type DestinationConfig, type PackageCopyInput, type PackageMediaItem } from "@studio/shared";

const LINKEDIN_CAPABILITIES: CapabilityManifest = {
  media: ["video", "image", "text"],
  limits: {
    maxDurationMs: 15 * 60 * 1000,
    maxBytes: 200 * 1024 * 1024,
    captionChars: 3000,
    titleChars: 0
  },
  features: {
    scheduleNative: false,
    cover: false,
    firstComment: false,
    privacy: false,
    location: false,
    altText: false,
    playlist: false,
    notifyFollowers: false
  },
  publishProtocol: "sync"
};

export function linkedinVersion(): string {
  return process.env.LINKEDIN_VERSION?.trim() || "202510";
}

export function linkedinScopes(): string {
  return process.env.LINKEDIN_SCOPES?.trim() || "openid profile w_member_social";
}

function appCreds(): { id: string; secret: string } {
  const id = process.env.LINKEDIN_CLIENT_ID?.trim();
  const secret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new SocialApiError("linkedin", "LinkedIn OAuth is not configured", 501, "not_configured");
  return { id, secret };
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "linkedin-version": linkedinVersion(),
    "x-restli-protocol-version": "2.0.0"
  };
}

export function linkedinPostBody(owner: string, commentary: string, mediaId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    author: owner,
    commentary: commentary.slice(0, 3000),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  };
  if (mediaId) body.content = { media: { id: mediaId } };
  return body;
}

export function createLinkedInAdapter() {
  return {
    network: "linkedin" as const,
    pkce: true,
    preview(media: PackageMediaItem[], copy: PackageCopyInput, destConfig?: DestinationConfig) {
      return previewTransform(media, copy, LINKEDIN_CAPABILITIES, destConfig);
    },
    async startOAuth(input: { redirectUri: string; state: string; codeChallenge?: string }) {
      const { id } = appCreds();
      const params = new URLSearchParams({
        response_type: "code",
        client_id: id,
        redirect_uri: input.redirectUri,
        state: input.state,
        scope: linkedinScopes()
      });
      if (input.codeChallenge) params.set("code_challenge", input.codeChallenge);
      params.set("code_challenge_method", "S256");
      return { authorizeUrl: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}` };
    },
    async exchangeOAuth(input: { code: string; redirectUri: string; codeVerifier?: string }) {
      const { id, secret } = appCreds();
      const raw = await socialJson<{
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      }>("linkedin", "https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: input.code,
          redirect_uri: input.redirectUri,
          client_id: id,
          client_secret: secret,
          ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {})
        }).toString()
      });
      if (!raw.access_token) throw new SocialApiError("linkedin", "LinkedIn token exchange failed", 400, "auth_expired");
      const tokens: SocialTokens = {
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token,
        expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000).toISOString() : undefined
      };
      const identity = await identify(tokens);
      return { tokens, identity };
    },
    async refreshAuth(tokens: SocialTokens): Promise<SocialTokens | null> {
      if (!tokens.refreshToken) return null;
      const { id, secret } = appCreds();
      const raw = await socialJson<{ access_token?: string; refresh_token?: string; expires_in?: number }>(
        "linkedin",
        "https://www.linkedin.com/oauth/v2/accessToken",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: tokens.refreshToken,
            client_id: id,
            client_secret: secret
          }).toString()
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
    async listDestinations(tokens: SocialTokens) {
      const me = await identify(tokens);
      const drafts: Array<{ kind: "profile" | "page"; externalId: string; name: string; handle?: string; url?: string }> = [
        {
          kind: "profile",
          externalId: `urn:li:person:${me.externalUserId}`,
          name: me.displayName,
          handle: me.handle,
          url: "https://www.linkedin.com/in/me"
        }
      ];
      try {
        const orgs = await socialJson<{ elements?: Array<{ organization?: string }> }>(
          "linkedin",
          "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
          { headers: headers(tokens.accessToken) }
        );
        for (const row of orgs.elements ?? []) {
          if (!row.organization) continue;
          drafts.push({
            kind: "page",
            externalId: row.organization,
            name: row.organization,
            handle: undefined,
            url: "https://www.linkedin.com/company"
          });
        }
      } catch {
        // Company pages need w_organization_social on the LinkedIn app. Member posting still works.
      }
      return drafts;
    },
    async publish(ctx: PublishContext): Promise<PublishHandle> {
      const commentary = (ctx.preview.nativeCopy.caption || ctx.copy.body || ctx.copy.title || "").trim();
      if (!commentary) throw new SocialApiError("linkedin", "LinkedIn post is empty", 400, "validation");
      const video = ctx.media.find((item) => item.item.kind === "video");
      const image = ctx.media.find((item) => item.item.kind === "image");
      let mediaId: string | undefined;
      if (video) mediaId = await uploadVideo(ctx.tokens.accessToken, ctx.destination.externalId, video.body);
      else if (image) mediaId = await uploadImage(ctx.tokens.accessToken, ctx.destination.externalId, image.body);
      const posted = await socialRequest("linkedin", "https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: { ...headers(ctx.tokens.accessToken), "content-type": "application/json" },
        body: JSON.stringify(linkedinPostBody(ctx.destination.externalId, commentary, mediaId))
      });
      if (posted.status >= 300) {
        throw new SocialApiError("linkedin", posted.text.slice(0, 400), posted.status, "network_rejected", posted.text);
      }
      const remotePostId = posted.headers.get("x-restli-id") ?? undefined;
      return {
        status: "published",
        remotePostId,
        remoteUrl: remotePostId ? `https://www.linkedin.com/feed/update/${encodeURIComponent(remotePostId)}` : "https://www.linkedin.com/feed/",
        nativePayload: { commentary, mediaId }
      };
    }
  };
}

async function identify(tokens: SocialTokens): Promise<{ externalUserId: string; displayName: string; handle?: string }> {
  const me = await socialJson<{ sub?: string; name?: string }>("linkedin", "https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${tokens.accessToken}` }
  });
  if (!me.sub) throw new SocialApiError("linkedin", "LinkedIn profile missing", 400, "validation");
  return { externalUserId: me.sub, displayName: me.name || me.sub };
}

async function uploadImage(token: string, owner: string, body: Buffer): Promise<string> {
  const init = await socialJson<{ value?: { uploadUrl?: string; image?: string } }>(
    "linkedin",
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: headers(token),
      body: { initializeUploadRequest: { owner } }
    }
  );
  const uploadUrl = init.value?.uploadUrl;
  const image = init.value?.image;
  if (!uploadUrl || !image) throw new SocialApiError("linkedin", "LinkedIn image upload was not initialized", 502, "upload_failed");
  const put = await socialRequest("linkedin", uploadUrl, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
    body
  });
  if (put.status >= 300) throw new SocialApiError("linkedin", put.text.slice(0, 300), put.status, "upload_failed", put.text);
  return image;
}

async function uploadVideo(token: string, owner: string, body: Buffer): Promise<string> {
  const init = await socialJson<{
    value?: {
      video?: string;
      uploadToken?: string;
      uploadInstructions?: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>;
    };
  }>("linkedin", "https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: headers(token),
    body: {
      initializeUploadRequest: {
        owner,
        fileSizeBytes: body.byteLength,
        uploadCaptions: false,
        uploadThumbnail: false
      }
    }
  });
  const video = init.value?.video;
  const instructions = init.value?.uploadInstructions ?? [];
  if (!video || !instructions.length) throw new SocialApiError("linkedin", "LinkedIn video upload was not initialized", 502, "upload_failed");
  const partIds: string[] = [];
  for (const part of instructions) {
    const chunk = body.subarray(part.firstByte, part.lastByte + 1);
    const put = await socialRequest("linkedin", part.uploadUrl, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
      body: chunk,
      timeoutMs: 10 * 60_000
    });
    if (put.status >= 300) throw new SocialApiError("linkedin", put.text.slice(0, 300), put.status, "upload_failed", put.text);
    const etag = put.headers.get("etag");
    if (etag) partIds.push(etag);
  }
  await socialJson("linkedin", "https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: headers(token),
    body: {
      finalizeUploadRequest: {
        video,
        uploadToken: init.value?.uploadToken ?? "",
        uploadedPartIds: partIds
      }
    }
  });
  return video;
}

export function linkedinTokenExpired(tokens: SocialTokens): boolean {
  return tokenExpired(tokens);
}
