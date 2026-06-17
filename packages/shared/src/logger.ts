export interface LogFn {
  (step: string, message: string, metadata?: Record<string, unknown>): Promise<void> | void;
}

export interface Logger {
  log: LogFn;
  child(extra: Record<string, unknown>): Logger;
}

export function createConsoleLogger(base: Record<string, unknown> = {}): Logger {
  const log: LogFn = (step, message, metadata) => {
    // eslint-disable-next-line no-console
    console.log(`[${step}] ${message}`, { ...base, ...(metadata ?? {}) });
  };
  return {
    log,
    child(extra) {
      return createConsoleLogger({ ...base, ...extra });
    }
  };
}
