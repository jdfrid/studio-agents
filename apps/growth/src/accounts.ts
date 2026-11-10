import { getNetworkAdapter, randomPkce, type SocialTokens } from "@studio/providers";
import { networkAuthConfigured, type SocialNetwork } from "@studio/shared";
import { createLinkedInAdapter } from "./linkedin.js";
import { isProductNetwork, mergePageTokens, publicConfig } from "./publish.js";
import { copyTopic, isTelegramInvite, normalizeTelegramChat, rememberTelegramCopy, rememberTelegramMirror, skippedTelegramCopy, TELEGRAM_MIRROR_DESTINATION, telegramCanPost, telegramCopyAddress, type CopyTopic } from "./telegramMirror.js";
import { decryptJson, encryptJson, nid, signPayload, verifyPayload } from "./crypto.js";
import {
  deleteConnection,
  destinationsForNetwork,
  getConnection,
  getSetting,
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
  let linkedId = "";
  if (chatId && adapter.resolveDestination) {
    const hint = normalizeTelegramChat(chatId);
    try {
      const resolved = await adapter.resolveDestination(tokens, hint);
      if (resolved) {
        const withLink = resolved.url || !isTelegramInvite(chatId) ? resolved : { ...resolved, url: chatId.trim() };
        linkedId = withLink.externalId;
        drafts = [...drafts.filter((row) => row.externalId !== withLink.externalId), withLink];
      }
    } catch (error) {
      if (isTelegramInvite(chatId)) {
        throw new Error("הבוט עדיין לא בתוך הערוץ. הוסיפו אותו כמנהל עם הרשאת פרסום, ואז לחצו חיבור שוב עם אותו קישור.");
      }
      throw error;
    }
  }
  await saveConnection(db, key, "telegram", identity, tokens, drafts);
  if (linkedId) rememberTelegramMirror(db, linkedId);
}

async function telegramBotCall<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok || data.result === undefined) throw new Error(data.description ?? `telegram ${method} failed`);
  return data.result;
}

/** Adds a public group or channel that receives a copy of matching videos after the home post. */
export async function addTelegramCopy(
  db: GrowthDb,
  key: Buffer,
  chat: string,
  topicInput: string
): Promise<{ id: string; name: string; handle: string | null; topic: CopyTopic }> {
  const topic = copyTopic(topicInput);
  if (!topic) throw new Error("בוחרים נושא: יצירת וידאו או מטבח");
  const address = telegramCopyAddress(chat);
  if (!address) throw new Error("כותבים @שם, קישור t.me/שם, או קישור t.me/c/ מהקבוצה");
  if (skippedTelegramCopy(address)) throw new Error("המקום הזה מוכר פרסום או סגור לחברים. לא מעתיקים אליו.");
  if (!getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim()) throw new Error("חברו קודם את ערוץ הטלגרם שאליו עולים הסרטונים");
  const connection = listConnections(db).find((row) => row.network === "telegram" && row.status === "active");
  if (!connection) throw new Error("חברו קודם בוט טלגרם");
  const tokens = decryptJson<SocialTokens>(connection.encryptedTokens, key);
  const adapter = getNetworkAdapter("telegram");
  if (!adapter.resolveDestination) throw new Error("telegram resolve missing");
  let resolved;
  try {
    resolved = await adapter.resolveDestination(tokens, address);
  } catch {
    throw new Error("הבוט עדיין לא בתוך הקבוצה. הוסיפו אותו כחבר, ובערוץ כמנהל עם הרשאת פרסום, ואז שמרו שוב.");
  }
  if (!resolved) throw new Error("הבוט עדיין לא בתוך הקבוצה. הוסיפו אותו כחבר, ובערוץ כמנהל עם הרשאת פרסום, ואז שמרו שוב.");
  if (resolved.handle && skippedTelegramCopy(resolved.handle)) throw new Error("המקום הזה מוכר פרסום או סגור לחברים. לא מעתיקים אליו.");
  const token = tokens.botToken || tokens.accessToken || "";
  const member = await telegramBotCall<{ status: string; can_post_messages?: boolean; can_send_messages?: boolean }>(token, "getChatMember", {
    chat_id: resolved.externalId,
    user_id: Number(token.split(":")[0])
  });
  if (!telegramCanPost(resolved.kind, member)) {
    throw new Error(
      resolved.kind === "channel"
        ? "הבוט צריך להיות מנהל בערוץ, עם הרשאת פרסום"
        : "הבוט צריך להיות חבר בקבוצה, ושלחברים מותר לשלוח הודעות"
    );
  }
  const previous = destinationsForNetwork(db, "telegram").find((row) => row.externalId === resolved.externalId);
  upsertDestination(db, {
    id: nid(),
    connectionId: connection.id,
    network: "telegram",
    kind: resolved.kind,
    externalId: resolved.externalId,
    name: resolved.name,
    handle: resolved.handle ?? null,
    url: resolved.url ?? (resolved.handle ? `https://t.me/${resolved.handle.replace(/^@/, "")}` : `https://t.me/c/${resolved.externalId.replace(/^-100/, "")}`),
    config: { ...(previous?.config ?? {}), copyTopic: topic }
  });
  rememberTelegramCopy(db, resolved.externalId);
  const saved = destinationsForNetwork(db, "telegram").find((row) => row.externalId === resolved.externalId);
  if (!saved) throw new Error("הקבוצה לא נשמרה");
  return { id: saved.id, name: saved.name, handle: saved.handle, topic };
}

export async function syncConnection(db: GrowthDb, key: Buffer, connectionId: string, chatId?: string): Promise<number> {
  const connection = getConnection(db, connectionId);
  if (!connection) throw new Error("connection not found");
  const tokens = decryptJson<SocialTokens>(connection.encryptedTokens, key);
  const adapter = adapterFor(connection.network);
  let drafts = (await adapter.listDestinations(tokens)) as Draft[];
  let linkedId = "";
  if (chatId && "resolveDestination" in adapter && adapter.resolveDestination) {
    const resolved = await adapter.resolveDestination(tokens, connection.network === "telegram" ? normalizeTelegramChat(chatId) : chatId);
    if (resolved) {
      linkedId = resolved.externalId;
      drafts = [...drafts.filter((row) => row.externalId !== resolved.externalId), resolved];
    }
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
  if (connection.network === "telegram" && linkedId) rememberTelegramMirror(db, linkedId);
  return destinationsForNetwork(db, connection.network).length;
}

export function removeConnection(db: GrowthDb, id: string): void {
  deleteConnection(db, id);
}
