import type { ProviderAlert, ProviderMonitor } from "./api";

const PROVIDERS: Record<string, string> = {
  gemini: "Google Gemini ו‑Veo",
  gcs: "אחסון Google Cloud",
  fal: "fal.ai",
  heygen: "HeyGen",
  elevenlabs: "ElevenLabs",
  lemonsqueezy: "Lemon Squeezy",
  postgresql: "מסד הנתונים",
  redis: "Redis",
  api: "שרת ה‑API",
  worker: "מעבד המשימות"
};

export function providerLabel(provider: string, fallback?: string): string {
  return PROVIDERS[provider.toLowerCase()] ?? fallback ?? provider;
}

export function severityLabel(severity: ProviderAlert["severity"]): string {
  return severity === "CRITICAL" ? "קריטי" : severity === "WARNING" ? "אזהרה" : "נפתר";
}

export function statusLabel(status: ProviderAlert["status"]): string {
  return status === "OPEN" ? "פתוח" : status === "ACKNOWLEDGED" ? "בטיפול" : "נפתר";
}

export function localizedAlert(alert: ProviderAlert): { title: string; message: string; action: string } {
  const provider = providerLabel(alert.monitor.provider, alert.monitor.displayName);
  const code = alert.metadata?.errorCode ?? alert.monitor.lastErrorCode ?? "";
  const title = `${provider} — ${severityLabel(alert.severity)}`;
  if (alert.severity === "RECOVERY" || alert.status === "RESOLVED") {
    return { title, message: "השירות חזר לפעילות תקינה.", action: "לא נדרשת פעולה." };
  }
  if (code === "upload_permission_denied") {
    return {
      title,
      message: "אין הרשאה להעלות קבצים לדלי האחסון.",
      action: "יש להעניק לחשבון השירות הרשאת storage.objects.create בדלי שהוגדר."
    };
  }
  if (code === "bucket_metadata_permission_missing") {
    return {
      title,
      message: "אין הרשאה לקריאת פרטי הדלי, אך מצב ההעלאה טרם הוכח כתקול.",
      action: "אין להוסיף storage.buckets.get רק לצורך ניטור; יש לבדוק בנפרד הרשאת העלאת קבצים."
    };
  }
  if (code === "not_configured") {
    return { title, message: "השירות לא הוגדר.", action: "יש להגדירו רק אם הוא אמור להיות פעיל." };
  }
  if (/^http_401/.test(code)) {
    return { title, message: "מפתח הגישה נדחה.", action: "יש לבדוק שהמפתח תקף." };
  }
  if (/^http_403/.test(code)) {
    return { title, message: "חסרה הרשאה לקריאת נתוני השירות.", action: "יש לעדכן את הרשאות המפתח." };
  }
  return {
    title,
    message: alert.severity === "WARNING" ? "היתרה או המכסה נמוכה." : "בדיקת השירות נכשלה.",
    action: "יש לפתוח את הפרטים הטכניים ולבדוק הרשאות, מכסה וזמינות."
  };
}

export function monitorRisk(provider: ProviderMonitor): { rank: number; label: string; className: string } {
  const details = provider.snapshots[0]?.details ?? {};
  const status = String(details.operationalStatus ?? "");
  if (!provider.enabled || status === "DISABLED" || status === "NOT_CONFIGURED") {
    return { rank: 3, label: "לא פעיל", className: "disabled" };
  }
  if (provider.lastErrorCode || provider.snapshots[0]?.healthy === false) {
    return { rank: 0, label: "דורש טיפול", className: "critical" };
  }
  if (status === "DEGRADED") {
    return { rank: 1, label: "בדיקה חלקית", className: "warning" };
  }
  if (provider.estimatedRunwayHours !== null && provider.estimatedRunwayHours < 24) {
    return { rank: 1, label: "סיכון גבוה", className: "warning" };
  }
  return { rank: 2, label: "תקין", className: "healthy" };
}

export function formatFreshness(value: string | null, now = Date.now()): string {
  if (!value) return "טרם נבדק";
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" });
  if (Math.abs(seconds) < 90) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 90) return formatter.format(minutes, "minute");
  return formatter.format(Math.round(minutes / 60), "hour");
}

export function formatCurrency(value: number, currency: "ILS" | "USD"): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
