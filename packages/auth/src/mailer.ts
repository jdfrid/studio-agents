import nodemailer from "nodemailer";
import { PRODUCT_NAME, PRODUCT_URL } from "@studio/shared";

export class MailNotConfiguredError extends Error {
  constructor() {
    super("mail_not_configured");
    this.name = "MailNotConfiguredError";
  }
}

export async function sendOtpEmail(to: string, code: string, locale: "he" | "en"): Promise<void> {
  const subject =
    locale === "he" ? `${code} — קוד הכניסה ל-${PRODUCT_NAME}` : `${code} — your ${PRODUCT_NAME} sign-in code`;
  const text =
    locale === "he"
      ? `קוד הכניסה שלכם הוא ${code}. הוא תקף ל-10 דקות. אם לא ביקשתם קוד, אפשר להתעלם מההודעה.`
      : `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`;
  const html = `<p style="font-family:Arial,sans-serif;color:#172C26">${text}</p><p style="color:#596A62;font-size:12px">${PRODUCT_URL}</p>`;
  const from = process.env.MAIL_FROM?.trim() || `${PRODUCT_NAME} <noreply@reelmino.com>`;

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ from, to: [to], subject, text, html })
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`resend_failed:${res.status}:${detail.slice(0, 180)}`);
    }
    return;
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) throw new MailNotConfiguredError();

  const port = Number(process.env.SMTP_PORT ?? "587");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  await transporter.sendMail({ from, to, subject, text, html });
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() || (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()));
}
