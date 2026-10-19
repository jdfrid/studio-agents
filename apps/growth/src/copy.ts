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
  const hash = tags(input.hashtags);
  copy.hashtags = input.hashtags;
  copy.youtube = { title: input.youtubeTitle, body: input.youtubeDescription };
  copy.tiktok = { body: hash && !input.tiktokCaption.includes("#") ? `${input.tiktokCaption} ${hash}` : input.tiktokCaption };
  copy.telegram = { body: input.telegram };
  copy.instagram = { body: copy.tiktok.body };
  copy.facebook = { body: input.telegram };
  copy.x = { body: input.x };
  copy.threads = { body: input.x };
  copy.whatsapp = { body: input.telegram };
  copy.pinterest = { title: input.name, body: input.message };
  copy.linkedin = { body: `${input.hook}\n\n${input.description}\n\nhttps://reelmino.com` };
  copy.email = {
    subject: input.name,
    body: `${input.hook}\n\n${input.description}\n\nhttps://reelmino.com`
  };
  copy.article = {
    title: input.name,
    description: input.message,
    body: `${input.description}\n\n${input.feature}\n\n${input.hook}`
  };
  return copy;
}

export function copyFromCalendar(input: { title: string; goal: string; cta: string; kind: string }): ItemCopy {
  const title = asReelmino(input.title);
  const goal = asReelmino(input.goal);
  const cta = asReelmino(input.cta);
  const body = `${title}\n\n${goal}\n\n${cta}\n\nhttps://reelmino.com`;
  const copy = emptyCopy();
  copy.youtube = { title: title.slice(0, 90), body };
  copy.tiktok = { body: `${title}\n\n${cta}` };
  copy.instagram = { body: copy.tiktok.body };
  copy.facebook = { body };
  copy.telegram = { body };
  copy.x = { body: `${title}\n\n${cta}\n\nhttps://reelmino.com`.slice(0, 280) };
  copy.threads = { body: copy.x.body };
  copy.whatsapp = { body };
  copy.pinterest = { title, body: goal };
  copy.linkedin = { body };
  copy.email = { subject: title, body };
  copy.article = {
    title,
    description: goal,
    body: input.kind === "short" ? `${title}\n\n${goal}\n\n${cta}` : `${goal}\n\n${title}\n\n${cta}`
  };
  return copy;
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
