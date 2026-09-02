import type { CapabilityManifest, DestinationConfig, NativeCopy, PackageCopyInput, PackageMediaItem, TransformChange, TransformPreview } from "./schemas.js";

function ratioLabel(width?: number, height?: number): string | null {
  if (!width || !height) return null;
  const r = width / height;
  if (Math.abs(r - 9 / 16) < 0.08) return "9:16";
  if (Math.abs(r - 16 / 9) < 0.08) return "16:9";
  if (Math.abs(r - 1) < 0.08) return "1:1";
  if (Math.abs(r - 4 / 5) < 0.08) return "4:5";
  return `${width}:${height}`;
}

function truncate(value: string, max: number): { text: string; cut: boolean } {
  if (value.length <= max) return { text: value, cut: false };
  if (max <= 1) return { text: value.slice(0, max), cut: true };
  return { text: `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`, cut: true };
}

function hashtagsText(tags: string[]): string {
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
}

export function composeCaption(copy: PackageCopyInput, captionLimit?: number): { caption: string; changes: TransformChange[]; lossy: boolean } {
  const parts: string[] = [];
  if (copy.body?.trim()) parts.push(copy.body.trim());
  const tags = hashtagsText(copy.hashtags ?? []);
  if (tags) parts.push(tags);
  if (copy.link) parts.push(copy.link);
  const full = parts.join("\n\n");
  const changes: TransformChange[] = [];
  let lossy = false;
  if (captionLimit === 0) {
    return { caption: "", changes, lossy };
  }
  if (captionLimit == null) return { caption: full, changes, lossy };
  const { text, cut } = truncate(full, captionLimit);
  if (cut) {
    lossy = full.length - captionLimit > Math.max(40, captionLimit * 0.2);
    changes.push({
      field: "caption",
      from: `${full.length} chars`,
      to: `${text.length} chars`,
      reason: "caption_limit"
    });
  }
  return { caption: text, changes, lossy };
}

export function selectMedia(
  media: PackageMediaItem[],
  capabilities: CapabilityManifest
): { selected: PackageMediaItem | null; extra: PackageMediaItem[]; errors: string[] } {
  const allowed = new Set(capabilities.media);
  const videos = media.filter((item) => item.kind === "video");
  const images = media.filter((item) => item.kind === "image");
  const errors: string[] = [];

  if (videos.length && allowed.has("video")) {
    return { selected: videos[0] ?? null, extra: images, errors };
  }
  if (images.length && (allowed.has("image") || allowed.has("carousel"))) {
    return { selected: images[0] ?? null, extra: images.slice(1), errors };
  }
  if (allowed.has("text") && !media.length) {
    return { selected: null, extra: [], errors };
  }
  if (!media.length && !allowed.has("text")) {
    errors.push("media_required");
  } else if (media.length) {
    errors.push("unsupported_media");
  }
  return { selected: null, extra: [], errors };
}

export function previewTransform(
  media: PackageMediaItem[],
  copy: PackageCopyInput,
  capabilities: CapabilityManifest,
  destConfig: DestinationConfig = {}
): TransformPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const changes: TransformChange[] = [];
  const { selected, extra, errors: mediaErrors } = selectMedia(media, capabilities);
  errors.push(...mediaErrors);

  let captionLimit = capabilities.limits.captionChars;
  if (destConfig.premiumCopyLimit && captionLimit === 280) captionLimit = 25_000;

  const composed = composeCaption(copy, captionLimit);
  changes.push(...composed.changes);
  let lossy = composed.lossy;

  let title: string | undefined = copy.title?.trim() || undefined;
  const titleLimit = capabilities.limits.titleChars;
  if (title && titleLimit === 0) {
    title = undefined;
    changes.push({ field: "title", reason: "title_unsupported" });
  } else if (title && titleLimit && title.length > titleLimit) {
    const cut = truncate(title, titleLimit);
    if (cut.cut) {
      changes.push({ field: "title", from: title, to: cut.text, reason: "title_limit" });
      title = cut.text;
      lossy = true;
    }
  }

  if (selected?.kind === "video") {
    const maxDuration = capabilities.limits.maxDurationMs;
    if (maxDuration && selected.durationMs && selected.durationMs > maxDuration) {
      errors.push("duration_exceeds_limit");
      lossy = true;
      changes.push({
        field: "duration",
        from: `${selected.durationMs}ms`,
        to: `${maxDuration}ms`,
        reason: "duration_limit"
      });
    }
    const maxBytes = capabilities.limits.maxBytes;
    if (maxBytes && selected.sizeBytes && selected.sizeBytes > maxBytes) {
      errors.push("file_too_large");
    }
  }

  const aspect = selected ? ratioLabel(selected.width, selected.height) : null;
  const allowedAspects = capabilities.limits.aspects;
  if (selected && allowedAspects?.length && aspect && !allowedAspects.includes(aspect)) {
    const message = `aspect ${aspect} is outside ${allowedAspects.join(", ")}`;
    if (capabilities.strictAspect) {
      warnings.push(message);
      lossy = true;
      changes.push({ field: "aspect", from: aspect, to: allowedAspects[0], reason: "aspect_mismatch" });
    } else {
      warnings.push(message);
    }
  }

  if (selected?.kind === "image" && extra.length && !capabilities.media.includes("carousel") && capabilities.limits.imageCount === 1) {
    warnings.push("extra_images_dropped");
    changes.push({ field: "images", reason: "single_image_only" });
  }

  const nativeCopy: NativeCopy = {
    title,
    caption: composed.caption || undefined,
    description: composed.caption || undefined,
    tags: copy.hashtags,
    firstComment: destConfig.firstComment,
    privacy: destConfig.privacy
  };

  if (selected?.kind === "video" && selected.durationMs && selected.durationMs <= 60_000 && aspect === "9:16") {
    nativeCopy.isShort = true;
  }

  const accepted = errors.length === 0 && Boolean(selected || capabilities.media.includes("text"));
  return {
    accepted,
    lossy,
    errors,
    warnings,
    changes,
    nativeCopy,
    selectedMedia: selected,
    extraMedia: extra
  };
}
