export class AgentError extends Error {
  readonly stage?: string;
  readonly provider?: string;
  override readonly cause?: unknown;
  readonly metadata?: Record<string, unknown>;

  constructor(message: string, opts: { stage?: string; provider?: string; cause?: unknown; metadata?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "AgentError";
    this.stage = opts.stage;
    this.provider = opts.provider;
    this.cause = opts.cause;
    this.metadata = opts.metadata;
  }
}

export class ProviderError extends AgentError {
  constructor(message: string, opts: { provider: string; cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, opts);
    this.name = "ProviderError";
  }
}

export class ValidationError extends AgentError {
  constructor(message: string, opts: { stage?: string; metadata?: Record<string, unknown> } = {}) {
    super(message, opts);
    this.name = "ValidationError";
  }
}

export class NoProviderConfiguredError extends AgentError {
  constructor(providerType: string) {
    super(`No enabled provider configured for type: ${providerType}`, { metadata: { providerType } });
    this.name = "NoProviderConfiguredError";
  }
}
