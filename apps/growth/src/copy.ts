import { calendarAngles, composeFreshCopy, promoAngles, type ItemAngles } from "./angles.js";

export type NetworkCopy = { title?: string; body?: string; subject?: string };

export type ItemCopy = {
  hashtags: string[];
  youtube: NetworkCopy;
  tiktok: NetworkCopy;
  telegram: NetworkCopy;
  instagram: NetworkCopy;
  facebook: NetworkCopy;
  x: NetworkCopy;
  linkedin: NetworkCopy;
  threads: NetworkCopy;
  pinterest: NetworkCopy;
  whatsapp: NetworkCopy;
  email: NetworkCopy;
  article: { title: string; description: string; body: string };
  angles?: ItemAngles;
};

export const EXPORT_NETWORKS = ["x", "whatsapp", "pinterest", "threads"] as const;
export const API_NETWORKS = ["telegram", "youtube", "facebook", "instagram", "tiktok", "linkedin"] as const;

export function emptyCopy(): ItemCopy {
  const blank = (): NetworkCopy => ({ title: "", body: "" });
  return {
    hashtags: [],
    youtube: blank(),
    tiktok: blank(),
    telegram: blank(),
    instagram: blank(),
    facebook: blank(),
    x: blank(),
    linkedin: blank(),
    threads: blank(),
    pinterest: blank(),
    whatsapp: blank(),
    email: { subject: "", body: "" },
    article: { title: "", description: "", body: "" }
  };
}

export function asReelmino(text: string): string {
  return text.replaceAll("Prompt2Spot", "Reelmino");
}

function tags(list: string[]): string {
  return list.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
}

function fillNetworks(copy: ItemCopy, title: string, summary: string, seedKey: string): ItemCopy {
  const item = { title, summary, copy };
  const used: string[] = [];
  const fill = (network: string) => {
    const caption = composeFreshCopy({ item, network, seed: `${seedKey}:${network}`, recentBodies: used });
    used.push(caption.body);
    return { title: caption.title, body: caption.body };
  };
  return {
    ...copy,
    youtube: fill("youtube"),
    tiktok: fill("tiktok"),
    telegram: fill("telegram"),
    instagram: fill("instagram"),
    facebook: fill("facebook"),
    x: fill("x"),
    linkedin: fill("linkedin"),
    threads: fill("threads"),
    pinterest: { title, body: fill("pinterest").body },
    whatsapp: fill("whatsapp"),
    email: { subject: title, body: fill("email").body }
  };
}

export function copyFromPromo(input: {
  name: string;
  feature: string;
  hook: string;
  message: string;
  description: string;
  youtubeTitle: string;
  youtubeDescription: string;
  tiktokCaption: string;
  hashtags: string[];
  telegram: string;
  x: string;
}): ItemCopy {
  const copy = emptyCopy();
  copy.hashtags = input.hashtags;
  copy.article = {
    title: input.name,
    description: input.message,
    body: `${input.description}\n\n${input.feature}\n\n${input.hook}`
  };
  const filled = fillNetworks({ ...copy, angles: promoAngles(input) }, input.name, input.message, input.name);
  const hash = tags(input.hashtags);
  if (hash) {
    for (const network of ["tiktok", "instagram"] as const) {
      const row = filled[network];
      if (row.body && !row.body.includes("#")) filled[network] = { ...row, body: `${row.body} ${hash}` };
    }
  }
  filled.youtube = { title: input.youtubeTitle.slice(0, 90), body: filled.youtube.body };
  return filled;
}

export function copyFromCalendar(input: { title: string; goal: string; cta: string; kind: string }): ItemCopy {
  const title = asReelmino(input.title);
  const goal = asReelmino(input.goal);
  const cta = asReelmino(input.cta);
  const copy = emptyCopy();
  copy.article = {
    title,
    description: goal,
    body: input.kind === "short" ? `${title}\n\n${goal}\n\n${cta}` : `${goal}\n\n${title}\n\n${cta}`
  };
  return fillNetworks({ ...copy, angles: calendarAngles(title, goal, cta) }, title, goal, title);
}

export function networkText(copy: ItemCopy, network: string): { title: string; body: string; subject: string } {
  const field = copy[network as keyof ItemCopy];
  if (network === "article") {
    return { title: copy.article.title, body: copy.article.body, subject: copy.article.title };
  }
  if (field && typeof field === "object" && "body" in field) {
    const row = field as NetworkCopy;
    return { title: row.title ?? "", body: row.body ?? "", subject: row.subject ?? row.title ?? "" };
  }
  return { title: "", body: "", subject: "" };
}
