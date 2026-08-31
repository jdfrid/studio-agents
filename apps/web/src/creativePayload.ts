import type { CreativeOptions } from "@studio/shared";

/**
 * Built-in values are the API wire format. Database catalog option codes are
 * metadata for snapshots and must not replace schema values in `brief.creative`.
 */
export function creativePayloadForRequest(
  creative: CreativeOptions
): CreativeOptions | undefined {
  return Object.keys(creative).length ? creative : undefined;
}
