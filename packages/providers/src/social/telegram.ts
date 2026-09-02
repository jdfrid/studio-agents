import type { DestinationDraft, NetworkAdapter, PublishContext, PublishHandle, SocialTokens } from "./types.js";
import { baseAdapter } from "./base.js";
import { FormData, SocialApiError, filePart, socialJson } from "./http.js";

interface TelegramResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

function botUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function tokenOf(tokens: SocialTokens): string {
  const value = tokens.botToken || tokens.accessToken;
  if (!value) throw new SocialApiError("telegram", "missing bot token", 401, "auth_expired");
  return value;
}

async function telegramCall<T>(tokens: SocialTokens, method: string, body?: unknown): Promise<T> {
  const data = await socialJson<TelegramResult<T>>("telegram", botUrl(tokenOf(tokens), method), {
    method: body === undefined ? "GET" : "POST",
    body
  });
  if (!data.ok || data.result === undefined) {
    throw new SocialApiError("telegram", data.description ?? "telegram call failed", data.error_code ?? 400, "network_rejected");
  }
  return data.result;
}

function destinationFromChat(chat: {
  id: number | string;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
}): DestinationDraft {
  const type = chat.type ?? "channel";
  const kind = type === "channel" ? "channel" : type === "supergroup" || type === "group" ? "group" : "bot_chat";
  const name = chat.title || chat.first_name || String(chat.id);
  return {
    kind,
    externalId: String(chat.id),
    name,
    handle: chat.username ? `@${chat.username}` : undefined,
    url: chat.username ? `https://t.me/${chat.username}` : undefined
  };
}

export function createTelegramAdapter(): NetworkAdapter {
  return {
    ...baseAdapter("telegram"),
    authKind: "bot_token",
    envKeys: [],
    pkce: false,
    async identify(tokens) {
      const me = await telegramCall<{ id: number; username?: string; first_name: string }>(tokens, "getMe");
      return {
        externalUserId: String(me.id),
        displayName: me.first_name || me.username || `bot:${me.id}`,
        handle: me.username ? `@${me.username}` : undefined
      };
    },
    async listDestinations(tokens) {
      const updates = await telegramCall<
        Array<{
          message?: { chat: { id: number; type: string; title?: string; username?: string; first_name?: string } };
          channel_post?: { chat: { id: number; type: string; title?: string; username?: string } };
          my_chat_member?: { chat: { id: number; type: string; title?: string; username?: string } };
        }>
      >(tokens, "getUpdates", { allowed_updates: ["message", "channel_post", "my_chat_member"], limit: 100 });
      const map = new Map<string, DestinationDraft>();
      for (const update of updates) {
        const chat = update.my_chat_member?.chat ?? update.channel_post?.chat ?? update.message?.chat;
        if (!chat) continue;
        const dest = destinationFromChat(chat);
        map.set(dest.externalId, dest);
      }
      return [...map.values()];
    },
    async resolveDestination(tokens, hint) {
      const chat = await telegramCall<{
        id: number;
        type: string;
        title?: string;
        username?: string;
        first_name?: string;
      }>(tokens, "getChat", { chat_id: hint });
      return destinationFromChat(chat);
    },
    async publish(ctx: PublishContext): Promise<PublishHandle> {
      const chatId = ctx.destination.externalId;
      const caption = ctx.preview.nativeCopy.caption ?? "";
      const disableNotification = ctx.destination.config.notifyFollowers === false;
      const video = ctx.media.find((item) => item.item.kind === "video");
      const images = ctx.media.filter((item) => item.item.kind === "image");

      if (video) {
        const form = new FormData();
        form.append("chat_id", chatId);
        if (caption) form.append("caption", caption);
        form.append("supports_streaming", "true");
        if (disableNotification) form.append("disable_notification", "true");
        form.append("video", filePart(video.body, video.filename, video.mimeType));
        const sent = await socialJson<TelegramResult<{ message_id: number }>>("telegram", botUrl(tokenOf(ctx.tokens), "sendVideo"), {
          method: "POST",
          body: form,
          timeoutMs: 180_000
        });
        if (!sent.ok || !sent.result) {
          throw new SocialApiError("telegram", sent.description ?? "sendVideo failed", sent.error_code ?? 400, "upload_failed");
        }
        return {
          status: "published",
          remotePostId: String(sent.result.message_id),
          remoteUrl: ctx.destination.handle ? `https://t.me/${ctx.destination.handle.replace(/^@/, "")}/${sent.result.message_id}` : undefined,
          nativePayload: { method: "sendVideo", chatId, caption }
        };
      }

      if (images.length === 1 && images[0]) {
        const image = images[0];
        const form = new FormData();
        form.append("chat_id", chatId);
        if (caption) form.append("caption", caption);
        if (disableNotification) form.append("disable_notification", "true");
        form.append("photo", filePart(image.body, image.filename, image.mimeType));
        const sent = await socialJson<TelegramResult<{ message_id: number }>>("telegram", botUrl(tokenOf(ctx.tokens), "sendPhoto"), {
          method: "POST",
          body: form,
          timeoutMs: 120_000
        });
        if (!sent.ok || !sent.result) {
          throw new SocialApiError("telegram", sent.description ?? "sendPhoto failed", sent.error_code ?? 400, "upload_failed");
        }
        return {
          status: "published",
          remotePostId: String(sent.result.message_id),
          nativePayload: { method: "sendPhoto", chatId, caption }
        };
      }

      if (images.length > 1) {
        const media = images.slice(0, 10).map((image, index) => ({
          type: "photo",
          media: `attach://file${index}`,
          caption: index === 0 ? caption : undefined
        }));
        const form = new FormData();
        form.append("chat_id", chatId);
        form.append("media", JSON.stringify(media));
        images.slice(0, 10).forEach((image, index) => {
          form.append(`file${index}`, filePart(image.body, image.filename, image.mimeType));
        });
        const sent = await socialJson<TelegramResult<Array<{ message_id: number }>>>(
          "telegram",
          botUrl(tokenOf(ctx.tokens), "sendMediaGroup"),
          { method: "POST", body: form, timeoutMs: 180_000 }
        );
        if (!sent.ok || !sent.result?.[0]) {
          throw new SocialApiError("telegram", sent.description ?? "sendMediaGroup failed", sent.error_code ?? 400, "upload_failed");
        }
        return {
          status: "published",
          remotePostId: String(sent.result[0].message_id),
          nativePayload: { method: "sendMediaGroup", chatId, caption }
        };
      }

      const sent = await telegramCall<{ message_id: number }>(ctx.tokens, "sendMessage", {
        chat_id: chatId,
        text: caption || ctx.copy.title || " ",
        disable_notification: disableNotification || undefined
      });
      return {
        status: "published",
        remotePostId: String(sent.message_id),
        nativePayload: { method: "sendMessage", chatId }
      };
    }
  };
}
