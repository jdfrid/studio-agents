# Reelmino growth console

Separate from customer accounts. It keeps a local SQLite database, imports the promo kit and the 90-day calendar, and publishes the brand organically.

```powershell
copy apps\growth\.env.example apps\growth\.env
# set GROWTH_OPERATOR_PASSWORD
pnpm dev:growth
```

Open http://127.0.0.1:4180

The laptop command above is for development. The console that other people use runs on the same Hetzner server as the video product, so it stays up when this computer is off. On the server, set `GROWTH_OPERATOR_PASSWORD` in `infra/hetzner/.env`, point a DNS A record for `growth.reelmino.com` at the server, then run `bash infra/hetzner/deploy.sh`. Open https://growth.reelmino.com.

The first login uses `GROWTH_OPERATOR_PASSWORD`. After that, passwords live in the server database, so changing the env value does not change an existing operator. Add more people from the מפעילים tab. They share one database: content, connected accounts, calendar and results.

מדריך חיבור החשבונות, בעברית: [GUIDE.he.md](./GUIDE.he.md) · [GUIDE.he.docx](./GUIDE.he.docx)

אפיון הפונקציות והמסכים, בעברית: [SPEC.he.docx](./SPEC.he.docx)

Default is manual. Turn on autopilot per destination when a due calendar slot should publish without another approval. Disabling a destination stops only that destination.

X, WhatsApp, Pinterest and Threads export a caption and file. They are not posted through an API. TikTok stays in the account inbox until `TIKTOK_DIRECT_POST=1` and TikTok has approved the app.

Before a network can publish: a YouTube channel, a Facebook Page, a professional Instagram account linked to that Page, a Telegram bot that admins the channel, and developer apps at Google, Meta, TikTok and LinkedIn. Meta, TikTok and LinkedIn app review is done on their sites.

`ייצוא מאמרי /learn` writes static pages into `apps/web/public/learn` and updates `sitemap.xml`.
