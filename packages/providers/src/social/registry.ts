import type { SocialNetwork } from "@studio/shared";
import { NETWORK_AUTH, NETWORK_CAPABILITIES, networkAuthConfigured } from "@studio/shared";
import { createFacebookAdapter } from "./facebook.js";
import { createInstagramAdapter } from "./instagram.js";
import { createTelegramAdapter } from "./telegram.js";
import { createTiktokAdapter } from "./tiktok.js";
import { SOCIAL_ADAPTER_VERSION, type NetworkAdapter } from "./types.js";
import { createXAdapter } from "./x.js";
import { createYoutubeAdapter } from "./youtube.js";

const adapters: Record<SocialNetwork, NetworkAdapter> = {
  telegram: createTelegramAdapter(),
  youtube: createYoutubeAdapter(),
  facebook: createFacebookAdapter(),
  instagram: createInstagramAdapter(),
  x: createXAdapter(),
  tiktok: createTiktokAdapter()
};

export function getNetworkAdapter(network: SocialNetwork): NetworkAdapter {
  const adapter = adapters[network];
  if (!adapter) throw new Error(`unknown social network: ${network}`);
  return adapter;
}

export function listNetworkAdapters(): NetworkAdapter[] {
  return Object.values(adapters);
}

export function listNetworkPublicViews() {
  return listNetworkAdapters().map((adapter) => {
    const auth = networkAuthConfigured(adapter.network);
    return {
      network: adapter.network,
      adapterVersion: adapter.adapterVersion || SOCIAL_ADAPTER_VERSION,
      authKind: adapter.authKind,
      configured: auth.configured,
      missingEnv: auth.missingEnv,
      capabilities: adapter.capabilities ?? NETWORK_CAPABILITIES[adapter.network]
    };
  });
}

export { NETWORK_AUTH, SOCIAL_ADAPTER_VERSION };
