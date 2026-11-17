# Shorts growth template

The growth console (`apps/growth`) is what writes and publishes the YouTube Shorts for @reelminoapp and @KitchenTips-Reelmino. It sends a brief into the studio pipeline (brief, script, audio, render, series) and uploads the finished file with the YouTube adapter in `packages/providers/src/social/youtube.ts`. Upload entry point: `runPublish` in `apps/growth/src/publish.ts`.

Studio approval modes (`manual`, `auto`, `auto_until_render`) are unchanged. Growth briefs still request `approvalMode: "auto"`. The new gate stops a bad Short from being uploaded. It does not add a stage inside the studio run.

## What a Short is

Per channel, in `packages/shared/src/shortsGrowth.ts`:

| | Kitchen (@KitchenTips-Reelmino) | Product (@reelminoapp) |
| --- | --- | --- |
| Handle match | handle, name, or URL contains `kitchentips` | every other YouTube channel |
| Length | 15–20 seconds. Hard maximum 25, including the end card. A saved 30-second short is produced at 20. | same |
| Second 0 | A concrete problem: “Stop …” or “Your … dies in a few days because …” | The finished ad or talking mascot, then “I made this from one sentence.” |
| Body | One idea, two or three steps, each with a before and after | same |
| Ending | The last spoken line repeats the opening line so the video loops. No “Visit our website” and no “Click Subscribe”. Optional line, under 2 seconds: “Follow for one fix a day.” | same |
| Title | At most 60 characters, the phrase someone would type, same language as the audio, and about this video | same |
| Description | One or two sentences from the video, then 3–5 hashtags (`#Shorts` plus topical tags). A light “Made with Reelmino.” No site link. | Same, plus `https://reelmino.com` |
| Speech | The name is written Reelmino. Speech says “Rihlmeenoh” (English) or “רילמינו” (Hebrew), never “Real Mino”. | same |

Longer cuts (60 seconds and up) keep their chosen length. The 25-second cap applies only when the file is a Short.

## Topic rotation

Proven kitchen subjects are tried first, each with more than one angle: herb storage, produce crispness, leftovers, fridge layout, small-kitchen layout. Product subjects: one-sentence ad, talking mascot, before/after business video.

When a trend chart has nothing new, the next unrepeated subject from that list is used. A title too close to one from the last 14 days is skipped. Edit `KITCHEN_TOPICS` or `PRODUCT_TOPICS` in `packages/shared/src/shortsGrowth.ts` to add a subject or change its weight. Higher weight is offered first.

## Quality gate

`evaluateShortsGate` runs twice:

1. Before a new render (title, language, leaked prompt text, near-duplicate, daily cap, and, when a real script is already saved, the opening line and complete sentences).
2. Again inside `runPublish` and `retryPublish`, on the title and description that would actually be uploaded. If the studio run stored a script artifact, that narration is what gets checked. When the file’s duration can be read, that duration wins over the planned length.

A failure is a failed upload job. Nothing is sent to YouTube.

| Result | `error_code` | What it means |
| --- | --- | --- |
| Block | `shorts_quality` | Generic or mismatched title, leaked prompt, wrong language, near-duplicate, bad opening, cut-off sentence, or a Short longer than 25 seconds |
| Needs approval | `shorts_review` | The title only partly matches the script. It is not uploaded. |
| Daily cap | `shorts_daily_cap` | This channel already has its Shorts for the day. |
| Publish | | The listing is cleaned (hashtags, description) and uploaded. |

Blocked and review jobs do not count toward the YouTube 16-upload safety cap.

Near-duplicate means the same normalized title, a title that shares most of its words, or a script that shares about three quarters of its words with a video that was published, scheduled, or is still uploading on that channel in the last 14 days.

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
| Subjects and weights | `KITCHEN_TOPICS` / `PRODUCT_TOPICS` | see the file |

`shorts_daily_cap` is a row in the growth `settings` table. The YouTube safety cap of 16 uploads per channel per Jerusalem day is still there and still wins if it is hit first.

The rendered voiceover is checked when the script artifact comes back with the video. Until that artifact exists, a keyword-only item is gated on its title, description, duplicate history, and the daily cap. The brief still tells the script stage to open on the hook and to loop the last line.
