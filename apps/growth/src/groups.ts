import { getNetworkAdapter, type SocialTokens } from "@studio/providers";
import { DestinationConfigSchema, type PackageCopyInput } from "@studio/shared";
import { networkText } from "./copy.js";
import { decryptJson } from "./crypto.js";
import {
  claimGroupPost,
  finishGroupPost,
  getGroup,
  getGroupPost,
  getItem,
  listConnections,
  pendingGroupPosts,
  type GroupPost,
  type GrowthDb,
  type Item,
  type ShareGroup
} from "./db.js";
import { mediaOf } from "./publish.js";
import { applyLink, trackedLink } from "./utm.js";

export type GroupNetwork = "facebook" | "linkedin" | "whatsapp" | "reddit" | "x" | "telegram" | "discord";

/** Networks whose official API lets a bot or webhook post into a group the owner controls. */
export const AUTO_GROUP_NETWORKS: readonly GroupNetwork[] = ["telegram", "discord"];
export const GROUP_NETWORKS: readonly GroupNetwork[] = ["facebook", "linkedin", "whatsapp", "reddit", "x", "telegram", "discord"];

const COPY_FROM: Record<GroupNetwork, string> = {
  facebook: "facebook",
  linkedin: "linkedin",
  whatsapp: "whatsapp",
  reddit: "linkedin",
  x: "x",
  telegram: "telegram",
  discord: "telegram"
};

const TEXT_LIMIT: Partial<Record<GroupNetwork, number>> = { x: 280, discord: 2000, telegram: 4096 };

export function isGroupNetwork(value: string): value is GroupNetwork {
  return (GROUP_NETWORKS as readonly string[]).includes(value);
}

export function isAutoNetwork(network: string): boolean {
  return (AUTO_GROUP_NETWORKS as readonly string[]).includes(network);
}

export type GroupAddress = { link: string; target: string; name: string };

const PATTERNS: Partial<Record<GroupNetwork, { pattern: RegExp; link: (id: string) => string }>> = {
  facebook: {
    pattern: /^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/groups\/([A-Za-z0-9._-]+)\/?(?:[?#].*)?$/,
    link: (id) => `https://www.facebook.com/groups/${id}`
  },
  linkedin: {
    pattern: /^https:\/\/(?:www\.)?linkedin\.com\/groups\/(\d+)\/?(?:[?#].*)?$/,
    link: (id) => `https://www.linkedin.com/groups/${id}/`
  },
  whatsapp: {
    pattern: /^https:\/\/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,})\/?(?:[?#].*)?$/,
    link: (id) => `https://chat.whatsapp.com/${id}`
  },
  reddit: {
    pattern: /^https:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/([A-Za-z0-9_]{2,21})\/?(?:[?#].*)?$/,
    link: (id) => `https://www.reddit.com/r/${id}/`
  },
  x: {
    pattern: /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/communities\/(\d+)\/?(?:[?#].*)?$/,
    link: (id) => `https://x.com/i/communities/${id}`
  }
};

const DISCORD_WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/(\d+)\/([A-Za-z0-9_-]+)\/?$/;

/** Parses the address a person pastes for a manual group. Telegram and Discord are resolved separately. */
export function parseGroupAddress(network: string, input: string): GroupAddress | null {
  const rule = PATTERNS[network as GroupNetwork];
  if (!rule) return null;
  const match = rule.pattern.exec(input.trim());
  if (!match) return null;
  const id = match[1]!;
  const link = rule.link(id);
  return { link, target: link, name: network === "reddit" ? `r/${id}` : id };
}

export function parseDiscordWebhook(input: string): { target: string; webhook: string } | null {
  const match = DISCORD_WEBHOOK.exec(input.trim());
  if (!match) return null;
  return { target: `webhook:${match[1]}`, webhook: `https://discord.com/api/webhooks/${match[1]}/${match[2]}` };
}

export function normalizeGroupUrl(input: string): string | null {
  return parseGroupAddress("facebook", input)?.link ?? null;
}

function termOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "group";
}

/** The text a group receives: that network's copy, with a link tagged utm_medium=community and the group in utm_term. */
export function groupText(group: Pick<ShareGroup, "network" | "name">, item: Item, post: Pick<GroupPost, "facebookPostUrl">, campaign?: string): string {
  const text = networkText(item.copy, COPY_FROM[group.network as GroupNetwork] ?? "facebook");
  const raw = (text.body || text.title || item.title).trim();
  const link = trackedLink({ network: group.network, slug: item.slug, format: "text", campaign, medium: "community", term: termOf(group.name) });
  let body = applyLink(raw, link);
  if (group.network === "facebook" && post.facebookPostUrl && !body.includes(post.facebookPostUrl)) {
    body = `${body}\n\n${post.facebookPostUrl}`;
  }
  const limit = TEXT_LIMIT[group.network as GroupNetwork];
  if (limit && body.length > limit) body = `${raw.slice(0, Math.max(0, limit - link.length - 3)).trimEnd()}…\n${link}`;
  return body;
}

/** A link that opens the right place with as much prefilled as the network allows. */
export function openUrl(group: Pick<ShareGroup, "network" | "link" | "name">, item: Item, text: string): string {
  if (group.network === "reddit") {
    const url = new URL(`${group.link.replace(/\/$/, "")}/submit`);
    url.searchParams.set("type", "TEXT");
    url.searchParams.set("title", item.title.slice(0, 300));
    url.searchParams.set("text", text);
    return url.toString();
  }
  return group.link;
}

export function facebookShareUrl(postUrl: string | null): string | null {
  return postUrl ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}` : null;
}

export function sharedTooRecently(lastSharedAt: string | null, minDays: number, now = new Date()): boolean {
  if (!lastSharedAt || minDays <= 0) return false;
  return now.getTime() - new Date(lastSharedAt).getTime() < minDays * 24 * 3600_000;
}

export type GroupContext = { db: GrowthDb; key: Buffer; mediaDir: string; publicBase: string; campaign?: string };

function telegramTokens(ctx: GroupContext): SocialTokens {
  const connection = listConnections(ctx.db).find((row) => row.network === "telegram" && row.status !== "revoked");
  if (!connection) throw new Error("חברו בוט טלגרם בלשונית חשבונות");
  return decryptJson<SocialTokens>(connection.encryptedTokens, ctx.key);
}

async function telegramApi<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
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

/** Confirms the bot is inside the chat and allowed to write there, so nothing is queued for a group it cannot reach. */
export async function resolveTelegramGroup(ctx: GroupContext, hint: string): Promise<GroupAddress> {
  const tokens = telegramTokens(ctx);
  const token = tokens.botToken || tokens.accessToken;
  if (!token) throw new Error("telegram bot token missing");
  const clean = hint.trim().replace(/^https:\/\/t\.me\//, "@");
  const chat = await telegramApi<{ id: number; type: string; title?: string; username?: string }>(token, "getChat", { chat_id: clean });
  if (chat.type === "private") throw new Error("זו שיחה פרטית, לא קבוצה");
  const botId = Number(token.split(":")[0]);
  const member = await telegramApi<{ status: string; can_send_messages?: boolean; can_post_messages?: boolean }>(token, "getChatMember", {
    chat_id: chat.id,
    user_id: botId
  });
  const canWrite =
    member.status === "creator" ||
    (member.status === "administrator" && (chat.type !== "channel" || member.can_post_messages !== false)) ||
    ((member.status === "member" || member.status === "restricted") && chat.type !== "channel" && member.can_send_messages !== false);
  if (!canWrite) throw new Error("הבוט לא יכול לכתוב שם. הוסיפו אותו לקבוצה (בערוץ: כמנהל עם הרשאת פרסום)");
  return {
    target: String(chat.id),
    name: chat.title || chat.username || String(chat.id),
    link: chat.username ? `https://t.me/${chat.username}` : ""
  };
}

function telegramMessageUrl(chatId: string, link: string, messageId: string): string | null {
  if (link) return `${link.replace(/\/$/, "")}/${messageId}`;
  if (chatId.startsWith("-100")) return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  return null;
}

async function sendTelegram(ctx: GroupContext, group: ShareGroup, item: Item, text: string): Promise<string | null> {
  const adapter = getNetworkAdapter("telegram");
  const tokens = telegramTokens(ctx);
  const config = DestinationConfigSchema.parse({});
  const destination = { id: group.id, kind: "group" as const, externalId: group.target, name: group.name, config };
  const copy: PackageCopyInput = { title: item.title, body: text, hashtags: [], language: item.language };
  let media = item.mediaPath ? mediaOf(item, ctx.mediaDir, ctx.publicBase) : [];
  let preview = adapter.preview(media.map((file) => file.item), copy, config);
  if (!preview.accepted && media.length) {
    media = [];
    preview = adapter.preview([], copy, config);
  }
  if (!preview.accepted) throw new Error(preview.errors.join(", ") || "rejected");
  const result = await adapter.publish({ tokens, destination, copy, preview, media, mode: "now" });
  return result.remotePostId ? telegramMessageUrl(group.target, group.link, result.remotePostId) : null;
}

async function sendDiscord(ctx: GroupContext, group: ShareGroup, text: string): Promise<null> {
  if (!group.secretEnc) throw new Error("discord webhook missing");
  const webhook = decryptJson<{ url: string }>(group.secretEnc, ctx.key).url;
  const response = await fetch(`${webhook}?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: text.slice(0, 2000), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`discord ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return null;
}

/** Sends one queued post through the group's bot or webhook. Manual networks never reach here. */
export async function sendGroupPost(ctx: GroupContext, postId: string): Promise<GroupPost | null> {
  const post = getGroupPost(ctx.db, postId);
  if (!post) return null;
  const group = getGroup(ctx.db, post.groupId);
  const item = getItem(ctx.db, post.itemId);
  if (!group || !item || !isAutoNetwork(group.network)) return post;
  if (!claimGroupPost(ctx.db, post.id)) return getGroupPost(ctx.db, post.id);
  try {
    const text = groupText(group, item, post, ctx.campaign);
    const url = group.network === "telegram" ? await sendTelegram(ctx, group, item, text) : await sendDiscord(ctx, group, text);
    return finishGroupPost(ctx.db, post.id, { status: "done", postUrl: url });
  } catch (error) {
    return finishGroupPost(ctx.db, post.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
}

/** Autopilot groups get at most one post per tick and never inside their minimum gap. */
export async function deliverDueGroupPosts(ctx: GroupContext): Promise<number> {
  const served = new Set<string>();
  let sent = 0;
  for (const post of pendingGroupPosts(ctx.db)) {
    if (served.has(post.groupId)) continue;
    const group = getGroup(ctx.db, post.groupId);
    if (!group || !group.enabled || !group.autopilot || !isAutoNetwork(group.network)) continue;
    if (sharedTooRecently(group.lastSharedAt, group.minDays)) continue;
    served.add(group.id);
    const result = await sendGroupPost(ctx, post.id);
    if (result?.status === "done") sent += 1;
  }
  return sent;
}
