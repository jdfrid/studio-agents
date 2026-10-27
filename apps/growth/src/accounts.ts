import { getNetworkAdapter, randomPkce, type SocialTokens } from "@studio/providers";
import { networkAuthConfigured, type SocialNetwork } from "@studio/shared";
import { createLinkedInAdapter } from "./linkedin.js";
import { isProductNetwork, mergePageTokens, publicConfig } from "./publish.js";
import { decryptJson, encryptJson, nid, signPayload, verifyPayload } from "./crypto.js";
import {
  deleteConnection,
  destinationsForNetwork,
  getConnection,
  insertConnection,
  listConnections,
  updateConnectionTokens,
  upsertDestination,
  type GrowthDb
} from "./db.js";

export type OAuthState = { network: string; verifier?: string; exp: number; via: "growth" };

/** YouTube on the shared site Google client must return to the URI Google already allows. */
export function growthOAuthRedirect(input: { network: string; publicBase: string; siteOrigin: string }): string {
  const youtubeId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
  const sharesSiteClient = input.network === "youtube" && (!youtubeId || youtubeId === googleId);
  if (sharesSiteClient) return `${input.siteOrigin.replace(/\/$/, "")}/auth/google/callback`;
  return `${input.publicBase.replace(/\/$/, "")}/oauth/${input.network}/callback`;
}

const OAUTH_NETWORKS = ["youtube", "facebook", "instagram", "tiktok", "linkedin"];

export function oauthNetworks(): string[] {
  return [...OAUTH_NETWORKS];
}

export function networkSetup(network: string): { configured: boolean; missingEnv: string[] } {
  if (network === "linkedin") {
    const missing = ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"].filter((key) => !process.env[key]);
    return { configured: missing.length === 0, missingEnv: missing };
  }
  if (network === "telegram") return { configured: true, missingEnv: [] };
  if (!isProductNetwork(network)) return { configured: false, missingEnv: [] };
  return networkAuthConfigured(network);
}

function adapterFor(network: string) {
  if (network === "linkedin") return createLinkedInAdapter();
  if (!isProductNetwork(network)) throw new Error(`unsupported network ${network}`);
  return getNetworkAdapter(network as SocialNetwork);
}

export async function beginOAuth(network: string, redirectUri: string, secret: string): Promise<{ authorizeUrl: string }> {
  if (!oauthNetworks().includes(network)) throw new Error("this network has no OAuth connect");
  const setup = networkSetup(network);
  if (!setup.configured) throw new Error(`missing env: ${setup.missingEnv.join(", ")}`);
  const adapter = adapterFor(network);
  if (!adapter.startOAuth) throw new Error("OAuth is not available");
  const pkce = adapter.pkce ? randomPkce() : undefined;
  const state = signPayload({ network, verifier: pkce?.verifier, exp: Date.now() + 15 * 60_000, via: "growth" } satisfies OAuthState, secret);
  return adapter.startOAuth({ redirectUri, state, codeChallenge: pkce?.challenge });
}

type Draft = {
  kind: string;
  externalId: string;
  name: string;
  handle?: string;
  url?: string;
  config?: { pageAccessToken?: string; categoryId?: string };
};

export async function finishOAuth(input: {
  db: GrowthDb;
  key: Buffer;
  secret: string;
  query: { code?: string; state?: string; error?: string; error_description?: string };
  redirectUri: string;
}): Promise<{ network: string }> {
  if (input.query.error) throw new Error(input.query.error_description || input.query.error);
  if (!input.query.code || !input.query.state) throw new Error("missing code");
  const state = verifyPayload<OAuthState>(input.query.state, input.secret);
  if (state.exp < Date.now()) throw new Error("oauth state expired");
  const adapter = adapterFor(state.network);
  if (!adapter.exchangeOAuth) throw new Error("OAuth exchange is not available");
  const exchanged = await adapter.exchangeOAuth({
    code: input.query.code,
    redirectUri: input.redirectUri,
    codeVerifier: state.verifier
  });
  const drafts = (await adapter.listDestinations(exchanged.tokens)) as Draft[];
  const tokens = mergePageTokens(exchanged.tokens, state.network, drafts);
  await saveConnection(input.db, input.key, state.network, exchanged.identity, tokens, drafts);
  return { network: state.network };
}

async function saveConnection(
  db: GrowthDb,
  key: Buffer,
  network: string,
  identity: { externalUserId: string; displayName: string; handle?: string },
  tokens: SocialTokens,
  drafts: Draft[]
): Promise<void> {
  const existing = listConnections(db).find((row) => row.network === network && row.externalUserId === identity.externalUserId);
  const connectionId = existing?.id ?? nid();
  const encrypted = encryptJson(tokens, key);
  if (existing) updateConnectionTokens(db, existing.id, encrypted, "active");
  else {
    insertConnection(db, {
      id: connectionId,
      network,
      displayName: identity.displayName,
      handle: identity.handle ?? null,
      externalUserId: identity.externalUserId,
      encryptedTokens: encrypted,
      status: "active"
    });
  }
  for (const draft of drafts) {
    upsertDestination(db, {
      id: nid(),
      connectionId,
      network,
      kind: draft.kind,
      externalId: draft.externalId,
      name: draft.name,
      handle: draft.handle ?? null,
      url: draft.url ?? null,
      config: publicConfig(draft.config)
    });
  }
}

export async function connectTelegram(db: GrowthDb, key: Buffer, token: string, chatId?: string): Promise<void> {
  const adapter = getNetworkAdapter("telegram");
  const tokens: SocialTokens = { accessToken: token, botToken: token };
  if (!adapter.identify) throw new Error("telegram identify missing");
  const identity = await adapter.identify(tokens);
  let drafts = (await adapter.listDestinations(tokens)) as Draft[];
  if (chatId && adapter.resolveDestination) {
    const resolved = await adapter.resolveDestination(tokens, chatId);
    if (resolved) drafts = [...drafts.filter((row) => row.externalId !== resolved.externalId), resolved];
  }
  await saveConnection(db, key, "telegram", identity, tokens, drafts);
}

export async function syncConnection(db: GrowthDb, key: Buffer, connectionId: string, chatId?: string): Promise<number> {
  const connection = getConnection(db, connectionId);
  if (!connection) throw new Error("connection not found");
  const tokens = decryptJson<SocialTokens>(connection.encryptedTokens, key);
  const adapter = adapterFor(connection.network);
  let drafts = (await adapter.listDestinations(tokens)) as Draft[];
  if (chatId && "resolveDestination" in adapter && adapter.resolveDestination) {
    const resolved = await adapter.resolveDestination(tokens, chatId);
    if (resolved) drafts = [...drafts.filter((row) => row.externalId !== resolved.externalId), resolved];
  }
  const merged = mergePageTokens(tokens, connection.network, drafts);
  updateConnectionTokens(db, connection.id, encryptJson(merged, key), "active");
  for (const draft of drafts) {
    upsertDestination(db, {
      id: nid(),
      connectionId: connection.id,
      network: connection.network,
      kind: draft.kind,
      externalId: draft.externalId,
      name: draft.name,
      handle: draft.handle ?? null,
      url: draft.url ?? null,
      config: publicConfig(draft.config)
    });
  }
  return destinationsForNetwork(db, connection.network).length;
}

export function removeConnection(db: GrowthDb, id: string): void {
  deleteConnection(db, id);
}
