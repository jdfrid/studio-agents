import { correctionCreditCost } from "@studio/shared";

export function formatCredits(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function correctionLabel(rerunFrom: "asset" | "render" | null): string | null {
  const cost = correctionCreditCost(rerunFrom ?? undefined);
  if (cost <= 0) return null;
  return `תיקון זה יעלה ${formatCredits(cost)} קרדיט${cost !== 1 ? "ים" : ""}`;
}
