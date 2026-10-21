import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SqliteDatabase } from "./nodeSqlite.js";
import type { ItemCopy } from "./copy.js";
import { DIRECTORY_BLURB, DIRECTORY_SEEDS } from "./internet.js";

export type GrowthDb = SqliteDatabase;
type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function rows(value: unknown[]): Row[] {
  return value as Row[];
}

export function openDb(file: string): GrowthDb {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

export function migrate(db: GrowthDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      operator_id TEXT
    );
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      network TEXT NOT NULL,
      display_name TEXT NOT NULL,
      handle TEXT,
      external_user_id TEXT NOT NULL,
      encrypted_tokens TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS destinations (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      network TEXT NOT NULL,
      kind TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      handle TEXT,
      url TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      autopilot INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(connection_id, kind, external_id)
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'en',
      copy_json TEXT NOT NULL,
      media_path TEXT,
      media_mime TEXT,
      media_kind TEXT,
      media_width INTEGER,
      media_height INTEGER,
      media_duration_ms INTEGER,
      reelmino_run_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      network TEXT NOT NULL,
      destination_id TEXT,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      destination_id TEXT,
      slot_id TEXT,
      network TEXT NOT NULL,
      status TEXT NOT NULL,
      remote_post_id TEXT,
      remote_url TEXT,
      last_error TEXT,
      error_code TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      handle_json TEXT NOT NULL DEFAULT '{}',
      scheduled_for TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS directories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      submit_url TEXT NOT NULL,
      status TEXT NOT NULL,
      draft_text TEXT NOT NULL,
      listing_url TEXT,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      last_error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fb_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      rules TEXT NOT NULL DEFAULT '',
      min_days INTEGER NOT NULL DEFAULT 7,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_shares (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      status TEXT NOT NULL,
      post_url TEXT,
      created_at TEXT NOT NULL,
      done_at TEXT,
      UNIQUE(group_id, job_id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS slots_due ON slots(status, scheduled_for);
    CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);
  `);
  const sessionColumns = rows(db.prepare("PRAGMA table_info(sessions)").all());
  if (!sessionColumns.some((column) => str(column, "name") === "operator_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN operator_id TEXT");
  }
  seedDirectories(db);
}

export function seedDirectories(db: GrowthDb): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO directories (id, name, submit_url, status, draft_text, listing_url, notes, updated_at)
     VALUES (?, ?, ?, 'todo', ?, NULL, '', ?)`
  );
  const now = new Date().toISOString();
  for (const seed of DIRECTORY_SEEDS) insert.run(seed.id, seed.name, seed.submitUrl, DIRECTORY_BLURB, now);
}

export type Item = {
  id: string;
  slug: string;
  source: string;
  title: string;
  summary: string;
  language: string;
  copy: ItemCopy;
  mediaPath: string | null;
  mediaMime: string | null;
  mediaKind: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationMs: number | null;
  reelminoRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapItem(row: Row): Item {
  return {
    id: str(row, "id"),
    slug: str(row, "slug"),
    source: str(row, "source"),
    title: str(row, "title"),
    summary: str(row, "summary"),
    language: str(row, "language"),
    copy: JSON.parse(str(row, "copy_json") || "{}") as ItemCopy,
    mediaPath: str(row, "media_path") || null,
    mediaMime: str(row, "media_mime") || null,
    mediaKind: str(row, "media_kind") || null,
    mediaWidth: row.media_width == null ? null : num(row, "media_width"),
    mediaHeight: row.media_height == null ? null : num(row, "media_height"),
    mediaDurationMs: row.media_duration_ms == null ? null : num(row, "media_duration_ms"),
    reelminoRunId: str(row, "reelmino_run_id") || null,
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at")
  };
}

export function listItems(db: GrowthDb): Item[] {
  return rows(db.prepare("SELECT * FROM items ORDER BY created_at DESC").all()).map(mapItem);
}

export function getItem(db: GrowthDb, id: string): Item | null {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as Row | undefined;
  return row ? mapItem(row) : null;
}

export function getItemBySlug(db: GrowthDb, slug: string): Item | null {
  const row = db.prepare("SELECT * FROM items WHERE slug = ?").get(slug) as Row | undefined;
  return row ? mapItem(row) : null;
}

export function insertItem(db: GrowthDb, item: Omit<Item, "createdAt" | "updatedAt"> & { createdAt?: string }): Item {
  const now = item.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO items (
      id, slug, source, title, summary, language, copy_json, media_path, media_mime, media_kind,
      media_width, media_height, media_duration_ms, reelmino_run_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.id,
    item.slug,
    item.source,
    item.title,
    item.summary,
    item.language,
    JSON.stringify(item.copy),
    item.mediaPath,
    item.mediaMime,
    item.mediaKind,
    item.mediaWidth,
    item.mediaHeight,
    item.mediaDurationMs,
    item.reelminoRunId,
    now,
    now
  );
  return getItem(db, item.id)!;
}

export function updateItem(
  db: GrowthDb,
  id: string,
  patch: Partial<Pick<Item, "title" | "summary" | "copy" | "mediaPath" | "mediaMime" | "mediaKind" | "mediaWidth" | "mediaHeight" | "mediaDurationMs" | "reelminoRunId">>
): Item | null {
  const current = getItem(db, id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE items SET title = ?, summary = ?, copy_json = ?, media_path = ?, media_mime = ?, media_kind = ?,
      media_width = ?, media_height = ?, media_duration_ms = ?, reelmino_run_id = ?, updated_at = ? WHERE id = ?`
  ).run(
    next.title,
    next.summary,
    JSON.stringify(next.copy),
    next.mediaPath,
    next.mediaMime,
    next.mediaKind,
    next.mediaWidth,
    next.mediaHeight,
    next.mediaDurationMs,
    next.reelminoRunId,
    next.updatedAt,
    id
  );
  return getItem(db, id);
}

export type Destination = {
  id: string;
  connectionId: string;
  network: string;
  kind: string;
  externalId: string;
  name: string;
  handle: string | null;
  url: string | null;
  config: Record<string, unknown>;
  autopilot: boolean;
  enabled: boolean;
};

function mapDestination(row: Row): Destination {
  return {
    id: str(row, "id"),
    connectionId: str(row, "connection_id"),
    network: str(row, "network"),
    kind: str(row, "kind"),
    externalId: str(row, "external_id"),
    name: str(row, "name"),
    handle: str(row, "handle") || null,
    url: str(row, "url") || null,
    config: JSON.parse(str(row, "config_json") || "{}") as Record<string, unknown>,
    autopilot: num(row, "autopilot") === 1,
    enabled: num(row, "enabled") === 1
  };
}

export function listDestinations(db: GrowthDb): Destination[] {
  return rows(db.prepare("SELECT * FROM destinations ORDER BY network, name").all()).map(mapDestination);
}

export function getDestination(db: GrowthDb, id: string): Destination | null {
  const row = db.prepare("SELECT * FROM destinations WHERE id = ?").get(id) as Row | undefined;
  return row ? mapDestination(row) : null;
}

export function destinationsForNetwork(db: GrowthDb, network: string): Destination[] {
  return rows(db.prepare("SELECT * FROM destinations WHERE network = ? ORDER BY name").all(network)).map(mapDestination);
}

export function upsertDestination(
  db: GrowthDb,
  input: Omit<Destination, "id" | "autopilot" | "enabled"> & { id: string }
): void {
  db.prepare(
    `INSERT INTO destinations (id, connection_id, network, kind, external_id, name, handle, url, config_json, autopilot, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(connection_id, kind, external_id) DO UPDATE SET
       name = excluded.name, handle = excluded.handle, url = excluded.url, config_json = excluded.config_json`
  ).run(
    input.id,
    input.connectionId,
    input.network,
    input.kind,
    input.externalId,
    input.name,
    input.handle,
    input.url,
    JSON.stringify(input.config),
    input.kind === "playlist" ? 0 : 1,
    new Date().toISOString()
  );
}

export function setDestinationFlags(db: GrowthDb, id: string, flags: { autopilot?: boolean; enabled?: boolean }): Destination | null {
  const current = getDestination(db, id);
  if (!current) return null;
  const autopilot = flags.autopilot ?? current.autopilot;
  const enabled = flags.enabled ?? current.enabled;
  db.prepare("UPDATE destinations SET autopilot = ?, enabled = ? WHERE id = ?").run(autopilot ? 1 : 0, enabled ? 1 : 0, id);
  return getDestination(db, id);
}

export type Connection = {
  id: string;
  network: string;
  displayName: string;
  handle: string | null;
  externalUserId: string;
  encryptedTokens: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function mapConnection(row: Row): Connection {
  return {
    id: str(row, "id"),
    network: str(row, "network"),
    displayName: str(row, "display_name"),
    handle: str(row, "handle") || null,
    externalUserId: str(row, "external_user_id"),
    encryptedTokens: str(row, "encrypted_tokens"),
    status: str(row, "status"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at")
  };
}

export function listConnections(db: GrowthDb): Connection[] {
  return rows(db.prepare("SELECT * FROM connections ORDER BY network").all()).map(mapConnection);
}

export function getConnection(db: GrowthDb, id: string): Connection | null {
  const row = db.prepare("SELECT * FROM connections WHERE id = ?").get(id) as Row | undefined;
  return row ? mapConnection(row) : null;
}

export function insertConnection(db: GrowthDb, input: Omit<Connection, "createdAt" | "updatedAt">): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO connections (id, network, display_name, handle, external_user_id, encrypted_tokens, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(input.id, input.network, input.displayName, input.handle, input.externalUserId, input.encryptedTokens, input.status, now, now);
}

export function updateConnectionTokens(db: GrowthDb, id: string, encryptedTokens: string, status: string): void {
  db.prepare("UPDATE connections SET encrypted_tokens = ?, status = ?, updated_at = ? WHERE id = ?").run(
    encryptedTokens,
    status,
    new Date().toISOString(),
    id
  );
}

export function deleteConnection(db: GrowthDb, id: string): void {
  db.prepare("DELETE FROM destinations WHERE connection_id = ?").run(id);
  db.prepare("DELETE FROM connections WHERE id = ?").run(id);
}

export type Slot = {
  id: string;
  itemId: string;
  itemTitle: string;
  network: string;
  destinationId: string | null;
  destinationName: string | null;
  scheduledFor: string;
  status: string;
  origin: "calendar" | "manual";
  note: string | null;
};

function mapSlot(row: Row): Slot {
  const origin = str(row, "origin") === "manual" ? "manual" : "calendar";
  return {
    id: str(row, "id"),
    itemId: str(row, "item_id"),
    itemTitle: str(row, "item_title"),
    network: str(row, "network"),
    destinationId: str(row, "destination_id") || null,
    destinationName: str(row, "destination_name") || null,
    scheduledFor: str(row, "scheduled_for"),
    status: str(row, "status"),
    origin,
    note: str(row, "note") || null
  };
}

const SLOT_SELECT = `SELECT slots.*, items.title AS item_title, destinations.name AS destination_name
  FROM slots JOIN items ON items.id = slots.item_id
  LEFT JOIN destinations ON destinations.id = slots.destination_id`;

export function listSlots(db: GrowthDb): Slot[] {
  return rows(db.prepare(`${SLOT_SELECT} ORDER BY scheduled_for`).all()).map(mapSlot);
}

export function getSlot(db: GrowthDb, id: string): Slot | null {
  const row = db.prepare(`${SLOT_SELECT} WHERE slots.id = ?`).get(id) as Row | undefined;
  return row ? mapSlot(row) : null;
}

export function dueSlots(db: GrowthDb, nowIso: string): Slot[] {
  return rows(db.prepare(`${SLOT_SELECT} WHERE slots.status = 'planned' AND slots.scheduled_for <= ? ORDER BY scheduled_for`).all(nowIso)).map(mapSlot);
}

export function claimSlot(db: GrowthDb, id: string, status: string, note: string | null): boolean {
  const result = db.prepare("UPDATE slots SET status = ?, note = ? WHERE id = ? AND status = 'planned'").run(status, note, id);
  return result.changes > 0;
}

export function setSlotStatus(db: GrowthDb, id: string, status: string, note: string | null): void {
  db.prepare("UPDATE slots SET status = ?, note = ? WHERE id = ?").run(status, note, id);
}

export function reopenSlot(db: GrowthDb, id: string): void {
  db.prepare("UPDATE slots SET status = 'planned', origin = 'manual', note = NULL WHERE id = ?").run(id);
}

export function upsertPlannedSlot(db: GrowthDb, input: Omit<Slot, "itemTitle" | "destinationName" | "destinationId" | "note" | "status"> & { destinationId?: string | null }): void {
  const existing = db.prepare("SELECT status FROM slots WHERE id = ?").get(input.id) as Row | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO slots (id, item_id, network, destination_id, scheduled_for, status, origin, note, created_at)
       VALUES (?, ?, ?, ?, ?, 'planned', ?, NULL, ?)`
    ).run(input.id, input.itemId, input.network, input.destinationId ?? null, input.scheduledFor, input.origin, new Date().toISOString());
    return;
  }
  if (str(existing, "status") === "planned") {
    db.prepare("UPDATE slots SET scheduled_for = ?, origin = ? WHERE id = ?").run(input.scheduledFor, input.origin, input.id);
  }
}

export type Job = {
  id: string;
  itemId: string;
  itemTitle: string;
  destinationId: string | null;
  destinationName: string | null;
  slotId: string | null;
  network: string;
  status: string;
  remotePostId: string | null;
  remoteUrl: string | null;
  lastError: string | null;
  errorCode: string | null;
  attempts: number;
  handle: Record<string, unknown>;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapJob(row: Row): Job {
  return {
    id: str(row, "id"),
    itemId: str(row, "item_id"),
    itemTitle: str(row, "item_title"),
    destinationId: str(row, "destination_id") || null,
    destinationName: str(row, "destination_name") || null,
    slotId: str(row, "slot_id") || null,
    network: str(row, "network"),
    status: str(row, "status"),
    remotePostId: str(row, "remote_post_id") || null,
    remoteUrl: str(row, "remote_url") || null,
    lastError: str(row, "last_error") || null,
    errorCode: str(row, "error_code") || null,
    attempts: num(row, "attempts"),
    handle: JSON.parse(str(row, "handle_json") || "{}") as Record<string, unknown>,
    scheduledFor: str(row, "scheduled_for") || null,
    publishedAt: str(row, "published_at") || null,
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at")
  };
}

const JOB_SELECT = `SELECT jobs.*, items.title AS item_title, destinations.name AS destination_name
  FROM jobs JOIN items ON items.id = jobs.item_id
  LEFT JOIN destinations ON destinations.id = jobs.destination_id`;

export function listJobs(db: GrowthDb): Job[] {
  return rows(db.prepare(`${JOB_SELECT} ORDER BY jobs.created_at DESC LIMIT 400`).all()).map(mapJob);
}

export function getJob(db: GrowthDb, id: string): Job | null {
  const row = db.prepare(`${JOB_SELECT} WHERE jobs.id = ?`).get(id) as Row | undefined;
  return row ? mapJob(row) : null;
}

export function processingJobs(db: GrowthDb): Job[] {
  return rows(db.prepare(`${JOB_SELECT} WHERE jobs.status = 'processing'`).all()).map(mapJob);
}

export function insertJob(db: GrowthDb, input: { id: string; itemId: string; destinationId: string | null; slotId: string | null; network: string; status: string; scheduledFor?: string | null }): Job {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO jobs (id, item_id, destination_id, slot_id, network, status, attempts, handle_json, scheduled_for, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, '{}', ?, ?, ?)`
  ).run(input.id, input.itemId, input.destinationId, input.slotId, input.network, input.status, input.scheduledFor ?? null, now, now);
  return getJob(db, input.id)!;
}

export function updateJob(
  db: GrowthDb,
  id: string,
  patch: Partial<Pick<Job, "status" | "remotePostId" | "remoteUrl" | "lastError" | "errorCode" | "attempts" | "handle" | "publishedAt">>
): Job | null {
  const current = getJob(db, id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE jobs SET status = ?, remote_post_id = ?, remote_url = ?, last_error = ?, error_code = ?, attempts = ?, handle_json = ?, published_at = ?, updated_at = ? WHERE id = ?`
  ).run(next.status, next.remotePostId, next.remoteUrl, next.lastError, next.errorCode, next.attempts, JSON.stringify(next.handle), next.publishedAt, next.updatedAt, id);
  if (next.slotId) setSlotStatus(db, next.slotId, next.status === "processing" ? "queued" : next.status, next.lastError);
  return getJob(db, id);
}

export type FbGroup = {
  id: string;
  name: string;
  url: string;
  rules: string;
  minDays: number;
  enabled: boolean;
  lastSharedAt: string | null;
  createdAt: string;
};

const GROUP_SELECT = `SELECT fb_groups.*,
  (SELECT MAX(done_at) FROM group_shares WHERE group_shares.group_id = fb_groups.id AND group_shares.status = 'done') AS last_shared_at
  FROM fb_groups`;

function mapGroup(row: Row): FbGroup {
  return {
    id: str(row, "id"),
    name: str(row, "name"),
    url: str(row, "url"),
    rules: str(row, "rules"),
    minDays: num(row, "min_days"),
    enabled: num(row, "enabled") === 1,
    lastSharedAt: str(row, "last_shared_at") || null,
    createdAt: str(row, "created_at")
  };
}

export function listGroups(db: GrowthDb): FbGroup[] {
  return rows(db.prepare(`${GROUP_SELECT} ORDER BY fb_groups.created_at`).all()).map(mapGroup);
}

export function getGroup(db: GrowthDb, id: string): FbGroup | null {
  const row = db.prepare(`${GROUP_SELECT} WHERE fb_groups.id = ?`).get(id) as Row | undefined;
  return row ? mapGroup(row) : null;
}

export function insertGroup(db: GrowthDb, input: { id: string; name: string; url: string; rules: string; minDays: number }): FbGroup {
  db.prepare("INSERT INTO fb_groups (id, name, url, rules, min_days, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)").run(
    input.id,
    input.name,
    input.url,
    input.rules,
    input.minDays,
    new Date().toISOString()
  );
  return getGroup(db, input.id)!;
}

export function updateGroup(db: GrowthDb, id: string, patch: Partial<Pick<FbGroup, "name" | "rules" | "minDays" | "enabled">>): FbGroup | null {
  const current = getGroup(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db.prepare("UPDATE fb_groups SET name = ?, rules = ?, min_days = ?, enabled = ? WHERE id = ?").run(next.name, next.rules, next.minDays, next.enabled ? 1 : 0, id);
  return getGroup(db, id);
}

export function deleteGroup(db: GrowthDb, id: string): void {
  db.prepare("DELETE FROM group_shares WHERE group_id = ? AND status = 'pending'").run(id);
  db.prepare("DELETE FROM fb_groups WHERE id = ?").run(id);
}

export type GroupShare = {
  id: string;
  groupId: string;
  groupName: string;
  groupUrl: string;
  groupRules: string;
  groupMinDays: number;
  groupLastSharedAt: string | null;
  jobId: string;
  itemId: string;
  itemTitle: string;
  pagePostUrl: string | null;
  status: string;
  postUrl: string | null;
  createdAt: string;
  doneAt: string | null;
};

const SHARE_SELECT = `SELECT group_shares.*, fb_groups.name AS group_name, fb_groups.url AS group_url,
  fb_groups.rules AS group_rules, fb_groups.min_days AS group_min_days,
  (SELECT MAX(done_at) FROM group_shares AS done WHERE done.group_id = group_shares.group_id AND done.status = 'done') AS group_last_shared_at,
  items.title AS item_title, jobs.remote_url AS page_post_url
  FROM group_shares
  JOIN fb_groups ON fb_groups.id = group_shares.group_id
  JOIN items ON items.id = group_shares.item_id
  JOIN jobs ON jobs.id = group_shares.job_id`;

function mapShare(row: Row): GroupShare {
  return {
    id: str(row, "id"),
    groupId: str(row, "group_id"),
    groupName: str(row, "group_name"),
    groupUrl: str(row, "group_url"),
    groupRules: str(row, "group_rules"),
    groupMinDays: num(row, "group_min_days"),
    groupLastSharedAt: str(row, "group_last_shared_at") || null,
    jobId: str(row, "job_id"),
    itemId: str(row, "item_id"),
    itemTitle: str(row, "item_title"),
    pagePostUrl: str(row, "page_post_url") || null,
    status: str(row, "status"),
    postUrl: str(row, "post_url") || null,
    createdAt: str(row, "created_at"),
    doneAt: str(row, "done_at") || null
  };
}

export function listGroupShares(db: GrowthDb): GroupShare[] {
  return rows(
    db.prepare(`${SHARE_SELECT} ORDER BY CASE group_shares.status WHEN 'pending' THEN 0 ELSE 1 END, group_shares.created_at DESC LIMIT 200`).all()
  ).map(mapShare);
}

export function getGroupShare(db: GrowthDb, id: string): GroupShare | null {
  const row = db.prepare(`${SHARE_SELECT} WHERE group_shares.id = ?`).get(id) as Row | undefined;
  return row ? mapShare(row) : null;
}

export function queueGroupShares(db: GrowthDb, job: Pick<Job, "id" | "itemId">, newId: () => string): number {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO group_shares (id, group_id, job_id, item_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)"
  );
  const now = new Date().toISOString();
  let added = 0;
  for (const group of listGroups(db).filter((row) => row.enabled)) {
    added += insert.run(newId(), group.id, job.id, job.itemId, now).changes;
  }
  return added;
}

export function finishGroupShare(db: GrowthDb, id: string, status: "done" | "skipped", postUrl: string | null): GroupShare | null {
  db.prepare("UPDATE group_shares SET status = ?, post_url = ?, done_at = ? WHERE id = ?").run(status, postUrl, new Date().toISOString(), id);
  return getGroupShare(db, id);
}

export type DirectoryRow = {
  id: string;
  name: string;
  submitUrl: string;
  status: string;
  draftText: string;
  listingUrl: string | null;
  notes: string;
  updatedAt: string;
};

export function listDirectories(db: GrowthDb): DirectoryRow[] {
  return rows(db.prepare("SELECT * FROM directories ORDER BY name").all()).map((row) => ({
    id: str(row, "id"),
    name: str(row, "name"),
    submitUrl: str(row, "submit_url"),
    status: str(row, "status"),
    draftText: str(row, "draft_text"),
    listingUrl: str(row, "listing_url") || null,
    notes: str(row, "notes"),
    updatedAt: str(row, "updated_at")
  }));
}

export function updateDirectory(db: GrowthDb, id: string, patch: { status?: string; draftText?: string; listingUrl?: string | null; notes?: string }): DirectoryRow | null {
  const current = listDirectories(db).find((row) => row.id === id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare("UPDATE directories SET status = ?, draft_text = ?, listing_url = ?, notes = ?, updated_at = ? WHERE id = ?").run(
    next.status,
    next.draftText,
    next.listingUrl,
    next.notes,
    next.updatedAt,
    id
  );
  return listDirectories(db).find((row) => row.id === id) ?? null;
}

export type EmailDraft = {
  id: string;
  itemId: string | null;
  subject: string;
  body: string;
  status: string;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
};

function mapEmail(row: Row): EmailDraft {
  return {
    id: str(row, "id"),
    itemId: str(row, "item_id") || null,
    subject: str(row, "subject"),
    body: str(row, "body"),
    status: str(row, "status"),
    lastError: str(row, "last_error") || null,
    sentAt: str(row, "sent_at") || null,
    createdAt: str(row, "created_at")
  };
}

export function listEmails(db: GrowthDb): EmailDraft[] {
  return rows(db.prepare("SELECT * FROM emails ORDER BY created_at DESC").all()).map(mapEmail);
}

export function getEmail(db: GrowthDb, id: string): EmailDraft | null {
  const row = db.prepare("SELECT * FROM emails WHERE id = ?").get(id) as Row | undefined;
  return row ? mapEmail(row) : null;
}

export function insertEmail(db: GrowthDb, input: { id: string; itemId: string | null; subject: string; body: string }): EmailDraft {
  db.prepare("INSERT INTO emails (id, item_id, subject, body, status, created_at) VALUES (?, ?, ?, ?, 'draft', ?)").run(
    input.id,
    input.itemId,
    input.subject,
    input.body,
    new Date().toISOString()
  );
  return getEmail(db, input.id)!;
}

export function updateEmail(db: GrowthDb, id: string, patch: Partial<Pick<EmailDraft, "subject" | "body" | "status" | "lastError" | "sentAt">>): EmailDraft | null {
  const current = getEmail(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db.prepare("UPDATE emails SET subject = ?, body = ?, status = ?, last_error = ?, sent_at = ? WHERE id = ?").run(
    next.subject,
    next.body,
    next.status,
    next.lastError,
    next.sentAt,
    id
  );
  return getEmail(db, id);
}

export function getSetting(db: GrowthDb, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
  return row ? str(row, "value") : null;
}

export function setSetting(db: GrowthDb, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function flag(db: GrowthDb, key: string): boolean {
  return getSetting(db, key) === "1";
}

export type Operator = { id: string; name: string; createdAt: string };

export function listOperators(db: GrowthDb): Operator[] {
  return rows(db.prepare("SELECT id, name, created_at FROM operators ORDER BY created_at").all()).map((row) => ({
    id: str(row, "id"),
    name: str(row, "name"),
    createdAt: str(row, "created_at")
  }));
}

export function operatorCount(db: GrowthDb): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM operators").get() as Row | undefined;
  return row ? num(row, "n") : 0;
}

export function insertOperator(db: GrowthDb, id: string, name: string, passwordHash: string): Operator {
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO operators (id, name, password_hash, created_at) VALUES (?, ?, ?, ?)").run(id, name, passwordHash, createdAt);
  return { id, name, createdAt };
}

export function findOperatorByPassword(db: GrowthDb, password: string, verify: (password: string, stored: string) => boolean, name?: string): Operator | null {
  const wanted = name?.trim().toLowerCase();
  const matches = rows(db.prepare("SELECT id, name, password_hash, created_at FROM operators").all()).filter((row) => {
    if (wanted && str(row, "name").toLowerCase() !== wanted) return false;
    return verify(password, str(row, "password_hash"));
  });
  if (matches.length !== 1) return null;
  const row = matches[0]!;
  return { id: str(row, "id"), name: str(row, "name"), createdAt: str(row, "created_at") };
}

export function deleteOperator(db: GrowthDb, id: string): boolean {
  if (operatorCount(db) <= 1) return false;
  db.prepare("DELETE FROM sessions WHERE operator_id = ?").run(id);
  const result = db.prepare("DELETE FROM operators WHERE id = ?").run(id);
  return result.changes > 0;
}

export function ensureFirstOperator(db: GrowthDb, name: string, passwordHash: string, id: string): void {
  if (operatorCount(db) > 0 || !passwordHash) return;
  insertOperator(db, id, name, passwordHash);
}

export function createSession(db: GrowthDb, tokenHash: string, expiresAt: string, operatorId: string): void {
  db.prepare("INSERT INTO sessions (token_hash, expires_at, operator_id) VALUES (?, ?, ?)").run(tokenHash, expiresAt, operatorId);
}

export function sessionValid(db: GrowthDb, tokenHash: string, nowIso: string): boolean {
  const row = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(tokenHash) as Row | undefined;
  return Boolean(row && str(row, "expires_at") > nowIso);
}

export function deleteSession(db: GrowthDb, tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}
