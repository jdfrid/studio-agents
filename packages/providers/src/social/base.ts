import { NETWORK_CAPABILITIES, previewTransform } from "@studio/shared";
import type { DestinationConfig, PackageCopyInput, PackageMediaItem, SocialNetwork } from "@studio/shared";
import type { NetworkAdapter } from "./types.js";
import { SOCIAL_ADAPTER_VERSION } from "./types.js";

export function defaultPreview(
  network: SocialNetwork,
  media: PackageMediaItem[],
  copy: PackageCopyInput,
  destConfig?: DestinationConfig
) {
  return previewTransform(media, copy, NETWORK_CAPABILITIES[network], destConfig);
}

export function baseAdapter(network: SocialNetwork): Pick<NetworkAdapter, "network" | "adapterVersion" | "capabilities" | "preview"> {
  return {
    network,
    adapterVersion: SOCIAL_ADAPTER_VERSION,
    capabilities: NETWORK_CAPABILITIES[network],
    preview(media, copy, destConfig) {
      return defaultPreview(network, media, copy, destConfig);
    }
  };
}
