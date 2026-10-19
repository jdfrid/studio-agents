export async function sendGrowthMail(input: { to: string; subject: string; text: string }): Promise<void> {
  const key = process.env.GROWTH_RESEND_API_KEY?.trim();
  const from = process.env.GROWTH_MAIL_FROM?.trim();
  if (!key || !from) throw new Error("Set GROWTH_RESEND_API_KEY and GROWTH_MAIL_FROM");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`resend ${response.status}: ${detail.slice(0, 180)}`);
  }
}
