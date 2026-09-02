import type {
  ContentPackageSource,
  PublishJobStatus,
  PublishMode,
  SocialAuthKind,
  SocialConnectionStatus,
  SocialDestinationKind,
  SocialDestinationStatus,
  SocialNetwork
} from "@studio/shared";
import type {
  ContentPackageSource as PrismaPackageSource,
  PublishJobStatus as PrismaJobStatus,
  PublishMode as PrismaPublishMode,
  SocialAuthKind as PrismaAuthKind,
  SocialConnectionStatus as PrismaConnectionStatus,
  SocialDestinationKind as PrismaDestinationKind,
  SocialDestinationStatus as PrismaDestinationStatus,
  SocialNetwork as PrismaNetwork
} from "@studio/infra-prisma";

const NETWORK_TO_PRISMA: Record<SocialNetwork, PrismaNetwork> = {
  telegram: "TELEGRAM",
  youtube: "YOUTUBE",
  facebook: "FACEBOOK",
  instagram: "INSTAGRAM",
  x: "X",
  tiktok: "TIKTOK"
};

const NETWORK_FROM_PRISMA: Record<PrismaNetwork, SocialNetwork> = {
  TELEGRAM: "telegram",
  YOUTUBE: "youtube",
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  X: "x",
  TIKTOK: "tiktok"
};

export function toPrismaNetwork(network: SocialNetwork): PrismaNetwork {
  return NETWORK_TO_PRISMA[network];
}

export function fromPrismaNetwork(network: PrismaNetwork): SocialNetwork {
  return NETWORK_FROM_PRISMA[network];
}

export function toPrismaAuthKind(kind: SocialAuthKind): PrismaAuthKind {
  return kind;
}

export function fromPrismaAuthKind(kind: PrismaAuthKind): SocialAuthKind {
  return kind;
}

export function toPrismaConnectionStatus(status: SocialConnectionStatus): PrismaConnectionStatus {
  return status;
}

export function fromPrismaConnectionStatus(status: PrismaConnectionStatus): SocialConnectionStatus {
  return status;
}

export function toPrismaDestinationKind(kind: SocialDestinationKind): PrismaDestinationKind {
  return kind;
}

export function fromPrismaDestinationKind(kind: PrismaDestinationKind): SocialDestinationKind {
  return kind;
}

export function toPrismaDestinationStatus(status: SocialDestinationStatus): PrismaDestinationStatus {
  return status;
}

export function fromPrismaDestinationStatus(status: PrismaDestinationStatus): SocialDestinationStatus {
  return status;
}

export function toPrismaPackageSource(source: ContentPackageSource): PrismaPackageSource {
  return source;
}

export function fromPrismaPackageSource(source: PrismaPackageSource): ContentPackageSource {
  return source;
}

export function toPrismaPublishMode(mode: PublishMode): PrismaPublishMode {
  return mode;
}

export function fromPrismaPublishMode(mode: PrismaPublishMode): PublishMode {
  return mode;
}

export function toPrismaJobStatus(status: PublishJobStatus): PrismaJobStatus {
  return status;
}

export function fromPrismaJobStatus(status: PrismaJobStatus): PublishJobStatus {
  return status;
}
