import { correctionCreditCost } from "@studio/shared";

export function formatCredits(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function correctionLabel(rerunFrom: "asset" | "render" | null): string | null {
  const cost = correctionCreditCost(rerunFrom ?? undefined);
  if (cost <= 0) return null;
  const kind = rerunFrom === "asset" ? "ויזואל מחדש" : "רינדור מחדש";
  return `${kind} יעלה ${formatCredits(cost)} קרדיט (יתרת חשבון נדרשת). סרטונים מתוך מכסת החינם — ללא חיוב.`;
}
