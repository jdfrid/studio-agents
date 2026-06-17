import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __studioPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__studioPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "1" ? ["query", "info", "warn", "error"] : ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__studioPrisma = prisma;
}

export * from "@prisma/client";
