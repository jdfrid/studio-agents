import { authorizedFetch } from "./auth";

export interface Dashboard {
  users: number;
  revenueNis: number;
  costNis: number;
  marginNis: number;
  videosCompleted: number;
  videosFailed: number;
  successRate: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  videosCompleted: number;
  videosFailed: number;
  revenueNis: number;
  costNis: number;
  createdAt: string;
}

export interface ProviderMonitor {
  id: string;
  provider: string;
  displayName: string;
  category: "PAID_PROVIDER" | "SYSTEM_INFRASTRUCTURE";
  company: string;
  capability: string;
  configured: boolean;
  expectedFromRecentUsage: boolean;
  metricType: string;
  unit: string | null;
  lastValue: number | null;
  lastCheckedAt: string | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  estimatedRunwayHours: number | null;
  source: string;
  sourceRealtime: boolean;
  lastErrorMessage: string | null;
  lastErrorCode: string | null;
  billingUrl: string | null;
  enabled: boolean;
  snapshots: Array<{
    healthy: boolean;
    checkedAt: string;
    details: Record<string, unknown>;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}

export interface ProviderAlert {
  id: string;
  severity: "WARNING" | "CRITICAL" | "RECOVERY";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  title: string;
  message: string;
  recommendedAction: string | null;
  lastSeenAt: string;
  occurrenceCount: number;
  metadata: { technicalMessage?: string; errorCode?: string } | null;
  monitor: { provider: string; displayName: string; lastErrorCode?: string | null };
}

export interface OperationalMetrics {
  totals: {
    costNis: number;
    costUsd: number;
    revenueNis: number;
    completed: number;
    failed: number;
  };
  services: Array<{ service: string; events: number; billedUnits: number; costNis: number }>;
  trend: Array<{ at: string; costNis: number; revenueNis: number; completed: number; failed: number }>;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}
