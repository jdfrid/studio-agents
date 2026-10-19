export interface StatementSync {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

export interface DatabaseSyncConstructor {
  new (path: string): SqliteDatabase;
}
