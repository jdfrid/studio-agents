import { NETWORK_CAPABILITIES } from "./capabilities.js";
import type { DestinationConfig } from "./schemas.js";

const EXTRA_FIRST_COMMENT_NETWORKS = new Set(["linkedin"]);

export type FirstCommentPlan = {
  text: string;
  at: string;
  status: "planned" | "pending" | "posted" | "failed";
  delayMinutes?: number;
  commentId?: string;
  error?: string;
};

export function networkSupportsFirstComment(network: string): boolean {
  if (EXTRA_FIRST_COMMENT_NETWORKS.has(network)) return true;
  const caps = NETWORK_CAPABILITIES[network as keyof typeof NETWORK_CAPABILITIES];
  return Boolean(caps?.features.firstComment);
}

export function firstCommentDelayMs(config?: Pick<DestinationConfig, "firstCommentDelayMinutes">): number {
  const minutes = config?.firstCommentDelayMinutes;
  const n = minutes === undefined ? 2 : minutes;
  return Math.max(0, Math.min(120, n)) * 60_000;
}

export function composeFirstComment(input: {
  firstComment?: string;
  link?: string;
  linkInFirstComment?: boolean;
}): string {
  const comment = input.firstComment?.trim() ?? "";
  const link = input.link?.trim() ?? "";
  if (comment && input.linkInFirstComment && link && !comment.includes(link)) return `${comment}\n${link}`;
  if (comment) return comment;
  if (input.linkInFirstComment && link) return link;
  return "";
}

export function resolveFirstCommentText(input: {
  network: string;
  firstComment?: string;
  link?: string;
  linkInFirstComment?: boolean;
}): string {
  if (!networkSupportsFirstComment(input.network)) return "";
  return composeFirstComment(input);
}

export function planFirstComment(input: {
  text: string;
  delayMinutes?: number;
  now?: Date;
}): FirstCommentPlan | null {
  const text = input.text.trim();
  if (!text) return null;
  const delayMinutes = input.delayMinutes === undefined ? 2 : Math.max(0, Math.min(120, input.delayMinutes));
  return {
    text,
    delayMinutes,
    at: new Date((input.now ?? new Date()).getTime() + delayMinutes * 60_000).toISOString(),
    status: "pending"
  };
}
