import { OAuth2Client } from "google-auth-library";

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!client) {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = `${appUrl()}/auth/google/callback`;
    if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required");
    client = new OAuth2Client(id, secret, redirect);
  }
  return client;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

export function googleAuthUrl(state: string): string {
  return getClient().generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state
  });
}

export async function exchangeGoogleCode(code: string) {
  const { tokens } = await getClient().getToken(code);
  if (!tokens.id_token) throw new Error("Missing id_token from Google");
  const ticket = await getClient().verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error("Invalid Google profile");
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    avatarUrl: payload.picture
  };
}
