const SOURCE: Record<string, string> = {
  youtube: "youtube",
  instagram: "instagram",
  facebook: "meta",
  tiktok: "tiktok",
  linkedin: "linkedin",
  telegram: "telegram",
  email: "newsletter",
  site: "google",
  x: "x",
  threads: "threads",
  pinterest: "pinterest",
  whatsapp: "whatsapp"
};

export function campaignMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function trackedLink(input: {
  network: string;
  slug: string;
  format: "v9x16" | "text" | "email" | "article";
  campaign?: string;
  medium?: string;
  term?: string;
  now?: Date;
}): string {
  const campaign = input.campaign ?? `${campaignMonth(input.now)}-smb-us-demo`;
  const url = new URL("https://reelmino.com/");
  url.searchParams.set("utm_source", SOURCE[input.network] ?? input.network);
  url.searchParams.set("utm_medium", input.medium ?? (input.network === "email" ? "email" : "organic"));
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", `${input.slug}-outcome-${input.format}-a`);
  if (input.term) url.searchParams.set("utm_term", input.term);
  return url.toString();
}

export function formatForNetwork(network: string): "v9x16" | "text" | "email" | "article" {
  if (network === "email") return "email";
  if (network === "site") return "article";
  if (network === "youtube" || network === "instagram" || network === "facebook" || network === "tiktok" || network === "telegram") {
    return "v9x16";
  }
  return "text";
}

export function applyLink(text: string, link: string): string {
  const trimmed = text.trim();
  if (!trimmed) return link;
  if (trimmed.includes("utm_")) return trimmed;
  if (trimmed.includes("https://reelmino.com")) return trimmed.replaceAll("https://reelmino.com", link);
  return `${trimmed}\n\n${link}`;
}
