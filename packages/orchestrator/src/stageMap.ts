import { StageName as PrismaStageName } from "@studio/infra-prisma";
import type { StageName } from "@studio/shared";

/**
 * Prisma enum cannot use "package" (TS reserved-ish token after compile);
 * we store it as `package_` in DB and map to/from the API name `package`.
 */
export function toPrismaStage(stage: StageName): PrismaStageName {
  if (stage === "package") return "package_";
  return stage as PrismaStageName;
}

export function fromPrismaStage(stage: PrismaStageName): StageName {
  if (stage === "package_") return "package";
  return stage as StageName;
}
