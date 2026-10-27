import { SocialNetworkSchema } from "@studio/shared";

const QUERY_KEYS = ["code", "state", "error", "error_description"] as const;

/** Growth signs OAuth state with via=growth. Distribution state carries a tenant instead. */
export function growthOAuthNetwork(state: string): string | null {
  const encoded = state.split(".")[0];
  if (!encoded || encoded === state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      network?: unknown;
      via?: unknown;
      tenantId?: unknown;
    };
    if (parsed.via !== "growth" || parsed.tenantId) return null;
    const network = SocialNetworkSchema.safeParse(parsed.network);
    return network.success ? network.data : null;
  } catch {
    return null;
  }
}

export function growthOAuthBounceUrl(
  state: string,
  query: Partial<Record<(typeof QUERY_KEYS)[number], string>>,
  growthBase = process.env.GROWTH_PUBLIC_BASE || "https://growth.reelmino.com"
): string | null {
  const network = growthOAuthNetwork(state);
  if (!network) return null;
  const dest = new URL(`${growthBase.replace(/\/$/, "")}/oauth/${network}/callback`);
  for (const key of QUERY_KEYS) {
    const value = query[key];
    if (value) dest.searchParams.set(key, value);
  }
  return dest.toString();
}
