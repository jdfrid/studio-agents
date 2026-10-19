import { createRequire } from "node:module";
import type { DatabaseSyncConstructor } from "./sqliteTypes.js";

const require = createRequire(import.meta.url);
const specifier = ["node", "sqlite"].join(":");
const sqlite = require(specifier) as { DatabaseSync: DatabaseSyncConstructor };

export const DatabaseSync = sqlite.DatabaseSync;
export type { SqliteDatabase } from "./sqliteTypes.js";
