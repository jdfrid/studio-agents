import nodemailer from "nodemailer";
import { PRODUCT_EMAIL, PRODUCT_NAME, PRODUCT_URL } from "@studio/shared";

export class MailNotConfiguredError extends Error {
  constructor() {
    super("mail_not_configured");
    this.name = "MailNotConfiguredError";
  }
}

export function mailFrom(): string {
  return process.env.MAIL_FROM?.trim() || `${PRODUCT_NAME} <${PRODUCT_EMAIL}>`;
}

export function mailInbox(): string {
  return process.env.MAIL_INBOX?.trim() || PRODUCT_EMAIL;
}

export function mailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() ||
      (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim())
  );
}

export async function sendMail(input: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<void> {
  const from = mailFrom();
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? undefined,
        reply_to: input.replyTo || undefined
      })
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
  await transporter.sendMail({
    from,
    to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo
  });
}

export async function sendOtpEmail(to: string, code: string, locale: "he" | "en"): Promise<void> {
  const subject =
    locale === "he" ? `${code} — קוד הכניסה ל-${PRODUCT_NAME}` : `${code} — your ${PRODUCT_NAME} sign-in code`;
  const text =
    locale === "he"
      ? `קוד הכניסה שלכם הוא ${code}. הוא תקף ל-10 דקות. אם לא ביקשתם קוד, אפשר להתעלם מההודעה.`
      : `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`;
  const html = `<p style="font-family:Arial,sans-serif;color:#172C26">${escapeHtml(text)}</p><p style="color:#596A62;font-size:12px">${PRODUCT_URL}</p>`;
  await sendMail({ to, subject, text, html });
}

export async function sendContactInquiryEmail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  locale?: string;
}): Promise<void> {
  const he = (input.locale ?? "en").startsWith("he");
  const subject = he
    ? `פנייה מאתר ${PRODUCT_NAME}: ${input.subject}`
    : `${PRODUCT_NAME} contact: ${input.subject}`;
  const text = [
    `${input.name} <${input.email}>`,
    "",
    input.message,
    "",
    PRODUCT_URL
  ].join("\n");
  const html = `<p style="font-family:Arial,sans-serif;color:#172C26"><strong>${escapeHtml(input.name)}</strong> &lt;${escapeHtml(input.email)}&gt;</p><p style="white-space:pre-wrap;font-family:Arial,sans-serif;color:#172C26">${escapeHtml(input.message)}</p><p style="color:#596A62;font-size:12px">${PRODUCT_URL}</p>`;
  await sendMail({
    to: mailInbox(),
    replyTo: input.email,
    subject,
    text,
    html
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
