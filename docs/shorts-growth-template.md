# Shorts growth template

The growth console (`apps/growth`) is what writes and publishes the YouTube Shorts for @reelminoapp and @KitchenTips-Reelmino. It sends a brief into the studio pipeline (brief, script, audio, render, series) and uploads the finished file with the YouTube adapter in `packages/providers/src/social/youtube.ts`. Upload entry point: `runPublish` in `apps/growth/src/publish.ts`.

Studio approval modes (`manual`, `auto`, `auto_until_render`) are unchanged. Growth briefs still request `approvalMode: "auto"`. The new gate stops a bad Short from being uploaded. It does not add a stage inside the studio run.

## What a Short is

Per channel, in `packages/shared/src/shortsGrowth.ts`:

| | Kitchen (@KitchenTips-Reelmino) | Product (@reelminoapp) |
| --- | --- | --- |
| Handle match | handle, name, or URL contains `kitchentips` | every other YouTube channel |
| Length | 15–20 seconds. Hard maximum 25, including the end card. A saved 30-second short is produced at 20. | same |
| Second 0 | A concrete problem: “Stop …” or “Your … dies in a few days because …” | The exact one-sentence prompt being typed, for example “Bakery in Tel Aviv, weekend sale 20% off.” No logo and no greeting. |
| Body | One idea, two or three steps, each with a before and after | 1.5–8s: Reelmino generating (progress, branding, scenes). 8–17s: the finished business video. |
| Ending | The last spoken line repeats the opening line so the video loops. No “Visit our website” and no “Click Subscribe”. Optional line, under 2 seconds: “Follow for one fix a day.” | Last 2s: “Try it with your sentence - link in pinned comment.” Then cut back to the prompt so it loops. |
| Title | At most 60 characters, the phrase someone would type, same language as the audio, and about this video | A search phrase for that feature, such as “AI video ad for a bakery in 60 seconds” or “Turn one sentence into a branded video”. |
| Description | One or two sentences from the video, then 3–5 hashtags (`#Shorts` plus topical tags). A light “Made with Reelmino.” No site link. | One or two sentences about the feature, `https://reelmino.com`, and 3–5 hashtags. |
| Speech | The name is written Reelmino. Speech says “Rihlmeenoh” (English) or “רילמינו” (Hebrew), never “Real Mino”. | same |

Longer cuts (60 seconds and up) keep their chosen length. The 25-second cap applies only when the file is a Short.

## Topic rotation

Proven kitchen subjects are tried first, each with more than one angle: herb storage, produce crispness, leftovers, fridge layout, small-kitchen layout. The product channel rotates `PRODUCT_FEATURES` in the same file: automatic branding, one sentence to a full video, aspect-ratio switch, multilingual voiceover, business templates, before/after, and a 60-second ad. Each feature is paired with a business from `PRODUCT_BUSINESSES` (bakery, restaurant, real estate, gym, salon, online shop). The next Short uses a different feature and a different business from the one before it. The same feature plus the same business type inside 7 days is rejected as a duplicate.

Edit the `weight` on a feature to show it more often. Higher weight is offered first.

## Product demos

A product Short is one feature and one business. The spoken script is the example sentence, the feature name, the finished video, the line “Try it with your sentence - link in pinned comment.”, then the example sentence again so the edit can loop.

The result beat is a Veo stand-in inside that same Reelmino render. The brief sets `resultSegment.source` to `veo-stand-in`, stores the example prompt, and sets `swapLater: true`. The growth host does not have a way to upload a second finished mp4 into the studio timeline, so a real export of the example prompt is not spliced in automatically. Replace the result beat later with that export when you have it.

After the upload, the channel posts one top-level comment (`commentThreads.insert`). A product Short still includes the example prompt. Both channels add a line that points at one @reelminoapp function demo and `https://reelmino.com`. YouTube’s Data API cannot pin a comment, and it cannot set the Shorts “related video” link. Pin the comment in YouTube Studio. The related-video chip stays unset.

## Promo links

Every auto-produced Short on @KitchenTips-Reelmino and @reelminoapp links to a function demo from @reelminoapp. The growth tick reads that channel’s uploads playlist (public videos only) at most once a day and caches the video id, title, and function when the title or our own job row matches a `PRODUCT_FEATURES` id. Kitchen Shorts prefer a demo whose title shares a topic word, then rotate. A product Short never links to itself or to another video of the same function.

The line is `See Reelmino do this: <title>` plus the watch URL and `https://reelmino.com`. It is added to the description at upload time, so it does not cost a separate `videos.update`. The same line is the channel comment.

`SHORTS_PROMO_BACKFILL_PER_DAY` (default 1) updates descriptions of Shorts from the last 30 days that do not have the line yet. `videos.update` costs 50 quota units and `videos.list` costs 1. Six uploads are about 1,600 units each, and six new comments are 50 each, so a full day is about 9,900 of the default 10,000 units. One backfill update fits in what is left. Raise the env value only if the project quota is higher. A failed update is skipped until the next day. Set `SHORTS_PROMO_LINKS=0` to stop new links and the backfill.

## Quality gate

`evaluateShortsGate` runs twice:

1. Before a new render (title, language, leaked prompt text, near-duplicate, daily cap, and, when a real script is already saved, the opening line and complete sentences).
2. Again inside `runPublish` and `retryPublish`, on the title and description that would actually be uploaded. If the studio run stored a script artifact, that narration is what gets checked. When the file’s duration can be read, that duration wins over the planned length.

A failure is a failed upload job. Nothing is sent to YouTube.

| Result | `error_code` | What it means |
| --- | --- | --- |
| Block | `shorts_quality` | Generic or mismatched title, leaked prompt, wrong language, near-duplicate, bad opening, cut-off sentence, a Short longer than 25 seconds, or a product script with no feature, no business, or no pinned-comment line |
| Needs approval | `shorts_review` | The title only partly matches the script. It is not uploaded. |
| Daily cap | `shorts_daily_cap` | This channel already has its Shorts for the day. |
| Publish | | The listing is cleaned (hashtags, description) and uploaded. |

Blocked and review jobs do not count toward the YouTube 16-upload safety cap.

Near-duplicate means the same normalized title, a title that shares most of its words, or a script that shares about three quarters of its words with a video that was published, scheduled, or is still uploading on that channel in the last 14 days. On the product channel, the same feature and the same business type inside 7 days is also a duplicate.

Hashtags drop stopwords (`to`, `save`, `wooden`, and the rest of the list in `shortsGrowth.ts`) and tags in the wrong language. `#Shorts` stays.

The title check is an offline word overlap. Set `SHORTS_TITLE_LLM=1` and `GEMINI_API_KEY` or `OPENAI_API_KEY` to also ask a model whether the title describes the script. `SHORTS_TITLE_LLM=0` forces the offline check even when a key is present. If the model is unreachable, the offline check is used.

## Settings

Nothing is required for the defaults.

| Setting | Where | Default |
| --- | --- | --- |
| Shorts per channel per day | environment `SHORTS_DAILY_CAP`, or growth setting `shorts_daily_cap` | 3 (0 pauses the channel, maximum 50) |
| Title model | `SHORTS_TITLE_LLM` plus `GEMINI_API_KEY` or `OPENAI_API_KEY` | off unless a key is already in the environment and the flag is not `0` |
| Model name | `GEMINI_TEXT_MODEL` or `OPENAI_TEXT_MODEL` | `gemini-2.0-flash` / `gpt-4o-mini` |
| Channel kind | YouTube handle | `kitchentips` → kitchen, otherwise product |
| Subjects and weights | `KITCHEN_TOPICS`, `PRODUCT_FEATURES`, `PRODUCT_BUSINESSES` | see the file |

`shorts_daily_cap` is a row in the growth `settings` table. The YouTube safety cap of 16 uploads per channel per Jerusalem day is still there and still wins if it is hit first.

The rendered voiceover is checked when the script artifact comes back with the video. Until that artifact exists, a keyword-only item is gated on its title, description, duplicate history, and the daily cap. The brief still tells the script stage to open on the hook and to loop the last line.

## Fixed schedule

The growth process used to wake every 30 seconds and run four independent loops: YouTube trends, the script bank, keyword feeds, and brand distribution. Each loop had its own hour window, so a channel could publish a burst of near-duplicate Shorts. Those four loops are no longer started by the timer.

`advanceShortsSchedule` is now the only automatic YouTube Shorts producer. It still runs inside that same 30-second tick. Every new Short from the clock is built with the growth template and cannot upload unless the quality gate accepts it. Manual console actions (script bank, trends, brand, and the publish button) also go through `runPublish`, so a YouTube upload still cannot skip the gate.

Times are wall-clock in `SHORTS_TIMEZONE` (default `Asia/Jerusalem`). Generation starts `SHORTS_LEAD_MINUTES` before the slot (default 90). As soon as the file is ready, YouTube receives it as a private video with `publishAt` set to the slot. One row per slot is stored in `shorts_slots`. A slot that is already past, and was never started, is marked skipped and is not made up later. A render that was already started is allowed to finish. If the gate rejects a take, the slot is regenerated up to two more times (three tries total) and then skipped. `SHORTS_DAILY_CAP=0` pauses that channel.

| Channel | id | Default times |
| --- | --- | --- |
| @KitchenTips-Reelmino | `UCsKPN8oZJOPM4KJC4bN_ANw` | 15:00, 19:00, 23:00 |
| @reelminoapp | `UC3iee8PYICmnfO5s8viJgkQ` | 16:00, 21:00 |

15:00 / 19:00 / 23:00 Jerusalem is 08:00 / 12:00 / 16:00 US Eastern while Israel is on standard time.

| Env | Meaning |
| --- | --- |
| `SHORTS_SCHEDULE_KITCHEN` | Comma-separated `HH:MM` list. Empty uses the kitchen default. |
| `SHORTS_SCHEDULE_REELMINO` | Same for the product channel. |
| `SHORTS_TIMEZONE` | IANA zone. Invalid values fall back to `Asia/Jerusalem`. |
| `SHORTS_LEAD_MINUTES` | How early to start the render. Default 90. |
| `SHORTS_DAILY_CAP` | Max uploads per channel per Jerusalem day. `0` pauses the channel. |

Change a time by setting the env var and restarting the growth process. No database edit is required. Example: `SHORTS_SCHEDULE_KITCHEN=14:30,18:30,22:30`.

## Subscriber automation

These jobs run on the same 30-second tick as the Shorts clock. Each one is on unless the env var is `0`, `false`, `off`, or `no`. None of them add Shorts beyond the fixed schedule. The old trend and keyword loops are only a topic source.

| Env | Default | What it does |
| --- | --- | --- |
| `SHORTS_PLAYLISTS` | on | Creates topic playlists and adds every new Short. Backfills existing public uploads once. |
| `SHORTS_LONGFORM` | on | Sunday 18:00 Asia/Jerusalem, one 3–6 minute 16:9 video per channel. Private upload with `publishAt`. |
| `SHORTS_COMMENT_REPLIES` | on | Every 2 hours, one reply per genuine thread. Cap 30 replies per channel per day. |
| `SHORTS_CHANNEL_SEO` | on | Channel description, keywords, and English as the default language. Applied by the existing channel-profile pass. |
| `SHORTS_TOPIC_DEMAND` | on | Once a day, ranks search titles and offers the top fresh one to the next kitchen slot. |
| `SHORTS_WEIGHT_TUNING` | on | Once a week, moves topic and feature weights between 0.5× and 2× from Analytics. |
| `SHORTS_CROSSPOST` | on | After a Short’s YouTube `publishAt` time, uploads the same mp4 through Zernio to TikTok and X, and sends it to Telegram with the bot API. Skips each destination when its credentials are empty. |

Kitchen playlists are produce, herbs, storage, cleaning, and cooking hacks. Product playlists are one per feature plus `Reelmino for <business>`.

The weekly kitchen video is “N tricks to &lt;topic&gt;” with chapters. The product video is a walkthrough of one feature. The long-form gate requires a search title, at least three chapters, no greeting, and the word “subscribe” in the middle and at the end. Each later Short description links that long video.

Comment replies are at most 200 characters, in the comment’s language, and end with a question. Spam, abuse, complaints, and political or sensitive comments are logged and not answered. The only link allowed is `reelmino.com`, and only on the product channel when the person asks how to try it. Replied comment ids are stored so a thread is answered once.

YouTube’s API can set `unsubscribedTrailer` only when you pass a video id. Set `SHORTS_TRAILER_KITCHEN` and `SHORTS_TRAILER_REELMINO` to those ids. There is no API to upload a trailer file by itself. If the env vars are empty, the current trailer is left as it is.

### One-time re-consent

New YouTube connects request `youtube.force-ssl` (comments and playlists) and `yt-analytics.readonly` (the weekly weight pass). A token saved before this change will not have those scopes. Disconnect the YouTube account in the growth console and connect it again, then accept every permission. Until you do, comments, playlists, and analytics calls fail and are logged. Uploads keep working on the old scopes.

### Cross-post accounts

Cross-posts go through Zernio (`https://zernio.com`). The growth process uploads the rendered mp4 to Zernio’s media endpoint (or sends an `https` media path when the file is already a public URL) and publishes a native TikTok video and an X video post. This runs only after the Short’s YouTube slot time. A Zernio failure is logged and retried; the YouTube upload is left as it is.

Connected Zernio accounts: TikTok `user811120410700` (`6afd5d11e23b7dac9dfd7e84`) and X `@reelmino2026` (`6afd5d2a030baa4c27c55943`). The free Zernio plan allows two accounts, so Telegram is not sent through Zernio. Add Instagram or Facebook later in `ZERNIO_ACCOUNTS` as `instagram:<accountId>` or `facebook:<accountId>`. The API name for X is `twitter`; `x:` in the env value is accepted.

| Env | Default | What it does |
| --- | --- | --- |
| `ZERNIO_API_KEY` | empty | Required. When empty, the cross-post step logs nothing and posts nowhere. |
| `ZERNIO_ACCOUNTS` | `tiktok:6afd5d11e23b7dac9dfd7e84,x:6afd5d2a030baa4c27c55943` | Comma-separated `platform:accountId`. |
| `ZERNIO_DAILY_CAP` | `3` | How many Shorts, across both YouTube channels, may be cross-posted per Jerusalem day. |
| `ZERNIO_MIN_GAP_HOURS` | `2` | Minimum time between cross-posts. |
| `ZERNIO_SLOT_PREFER` | `even:kitchen,odd:product` | Even schedule slots prefer the kitchen channel. Odd slots prefer the product channel. |

Each video is posted once per platform. The Zernio post id is stored in `growth_crossposts`. A failed platform waits 2 minutes, then 8, 32, and up to 2 hours, and stops after 5 attempts. The weekly weight pass also reads Zernio analytics for posts sent through the API and writes the view and like totals to the growth log.

Caption: the Short title, then 2–3 hashtags, then `More on YouTube: <channel URL>`. X captions stay within 280 characters.

Telegram uses the Bot API directly. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_IDS` must both be set; otherwise the step returns without a log line. Chat ids are comma-separated. The first target is the private ReelMino channel, `-1004473673094`. Each newly published Short is sent after its YouTube `publishAt`, at least `ZERNIO_MIN_GAP_HOURS` after the previous Telegram send. A file of 50MB or smaller is `sendVideo`. A larger file, a missing file, or the weekly long video is `sendMessage` with the YouTube link. The caption is the title, a short description, the YouTube link, and `https://reelmino.com`, in English or Hebrew to match the video, and at most 1024 characters. Message ids are stored in `growth_crossposts` per video and chat. A failed chat is logged and retried; the other chats and the YouTube upload continue.

Set the keys on the Hetzner growth host, not on Render. The file is `infra/hetzner/.env` on that server (the copy of `infra/hetzner/env.example`). `infra/hetzner/docker-compose.yml` passes `ZERNIO_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_IDS` into the `growth` container. After editing the file, run `bash infra/hetzner/deploy.sh` from the repo on the server so the container restarts with the new value.

If `ZERNIO_API_KEY` is empty and the older Buffer or Facebook Page tokens are set, the previous caption-only post still runs. It does not upload the mp4.
