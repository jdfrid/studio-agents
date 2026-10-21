import { networkText, type ItemCopy } from "./copy.js";

const GROUP_URL = /^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/groups\/([A-Za-z0-9._-]+)\/?(?:[?#].*)?$/;

export function normalizeGroupUrl(input: string): string | null {
  const match = GROUP_URL.exec(input.trim());
  return match ? `https://www.facebook.com/groups/${match[1]}` : null;
}

export function groupShareText(copy: ItemCopy, pagePostUrl: string | null): string {
  const text = networkText(copy, "facebook");
  const body = (text.body || text.title || "").trim();
  if (!pagePostUrl || body.includes(pagePostUrl)) return body;
  return `${body}\n\n${pagePostUrl}`;
}

export function sharedTooRecently(lastSharedAt: string | null, minDays: number, now = new Date()): boolean {
  if (!lastSharedAt || minDays <= 0) return false;
  return now.getTime() - new Date(lastSharedAt).getTime() < minDays * 24 * 3600_000;
}
