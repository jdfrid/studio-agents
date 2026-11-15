import { sendProductionFailureEmail } from "@studio/auth";
import { providerNameHe } from "@studio/providers";
import {
  getRenderProfile,
  productionBlockedNotice,
  type ProductionBlockReason,
  type RenderProfileId
} from "@studio/shared";

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 15 * 60 * 1000;

/** Mail the operator once when a create is refused, without a mail on every retry. */
export async function notifyProductionBlocked(input: {
  profileId: RenderProfileId;
  provider: string;
  reason: ProductionBlockReason;
}): Promise<void> {
  const key = `${input.provider}:${input.reason}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < COOLDOWN_MS) return;
  lastSent.set(key, now);
  const profile = getRenderProfile(input.profileId);
  const notice = productionBlockedNotice({
    modelLabel: profile.labelHe || profile.label,
    providerName: providerNameHe(input.provider),
    reason: input.reason,
    adminUrl: process.env.ADMIN_URL
  });
  try {
    await sendProductionFailureEmail({ subject: notice.subject, text: notice.text });
  } catch (error) {
    lastSent.delete(key);
    throw error;
  }
}
