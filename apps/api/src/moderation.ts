import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { prisma } from "@studio/infra-prisma";
import { ContentModerationError, moderateUserText, stringLeaves } from "@studio/providers";

export { briefModerationParts } from "@studio/providers";

export type ModerationSource =
  | "run_create"
  | "visual_corrections"
  | "stage_output"
  | "brand_template"
  | "automation";

export function brandTemplateModerationParts(body: {
  name?: string | null;
  businessName?: string | null;
  slogan?: string | null;
  messages?: unknown;
  mustSay?: unknown;
  mustAvoid?: unknown;
  defaultCreative?: unknown;
}): string[] {
  return [
    body.name ?? "",
    body.businessName ?? "",
    body.slogan ?? "",
    ...stringLeaves(body.messages ?? []),
    ...stringLeaves(body.mustSay ?? []),
    ...stringLeaves(body.mustAvoid ?? []),
    ...stringLeaves(body.defaultCreative ?? {})
  ];
}

/** String leaves present in `next` that did not exist in `previous` (only edited text is screened). */
export function changedStrings(previous: unknown, next: unknown): string[] {
  const known = new Set(stringLeaves(previous));
  return stringLeaves(next).filter((text) => !known.has(text));
}

/**
 * Screens text with Creem before any credits are charged or models are called.
 * Returns true when allowed; otherwise sets the reply status and returns the error body.
 */
export async function screenOrReject(
  reply: FastifyReply,
  log: FastifyBaseLogger,
  input: {
    userId: string;
    source: ModerationSource;
    parts: Array<string | null | undefined>;
    entityId?: string;
  }
): Promise<true | { error: string; code: string }> {
  const externalId = `user_${input.userId}:${input.source}${input.entityId ? `:${input.entityId}` : ""}`;
  try {
    await moderateUserText(input.parts, externalId);
    return true;
  } catch (error) {
    if (!(error instanceof ContentModerationError)) throw error;
    log.warn({ source: input.source, decision: error.decision, code: error.code, detail: error.message }, "content moderation blocked request");
    await recordBlocked(input.userId, input.source, error, input.entityId).catch(() => undefined);
    if (error.code === "prompt_rejected") {
      reply.code(400);
      return { error: "prompt_rejected", code: "prompt_rejected" };
    }
    reply.code(503);
    return { error: "moderation_unavailable", code: "moderation_unavailable" };
  }
}

async function recordBlocked(
  userId: string,
  source: ModerationSource,
  error: ContentModerationError,
  entityId?: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  if (!user?.tenantId) return;
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      action: error.code === "prompt_rejected" ? "content_moderation_blocked" : "content_moderation_unavailable",
      entity: "User",
      entityId: userId,
      metadata: { source, decision: error.decision, runOrTemplateId: entityId ?? null, detail: error.message }
    }
  });
}
