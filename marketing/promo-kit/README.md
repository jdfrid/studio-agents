# Reelmino promo kit — 30-second feature ads

Fourteen ready-to-edit packages for YouTube Shorts, TikTok, Telegram and X. Each package is one 30-second vertical ad about one feature, with a timecoded script, on-screen text, a shot list pointing at real mobile screens, and post copy for every platform.

Open `index.html` in a browser for the visual storyboards. The full scripts are in `packages/`.

## Folder

| Path | What it is |
|---|---|
| `index.html` | Storyboard of every package: frames, timecodes, on-screen text and voice-over |
| `packages/NN-*.md` | Script, shot list, feature description and platform copy for each package |
| `screens/` | Mobile screenshots (iPhone, 1170×2532). Files ending in `-full` are full-page captures for panning or cropping |
| `broll/` | Four finished Reelmino videos from the library, for "this is the result" shots |
| `brand/` | Reelmino logo and symbol (SVG) for the end card |
| `packages.mjs` / `build.mjs` | Source data for the packages. Edit `packages.mjs`, then run `node marketing/promo-kit/build.mjs` to regenerate the Markdown and the storyboard |

## Packages

| # | Ad | Feature |
|---|---|---|
| 00 | Hero — Reelmino in 30 seconds | The whole flow |
| 01 | One sentence is enough | Create from one description |
| 02 | See the script before it's made | Proposal, scene editor, approval |
| 03 | On brand, every video | Brand kit and end card |
| 04 | 23 voices — or your own | Voice library and voice cloning |
| 05 | Shoot it on your phone | Camera, gallery, material roles, reference video |
| 06 | Make your character talk | Lip-sync talking character |
| 07 | Seven languages, captions on | Content languages and captions |
| 08 | Made for every feed | Formats and platforms |
| 09 | Your mood, your rules | Mood, style and creation mode |
| 10 | A new video every day (beta) | Website automation |
| 11 | Almost perfect? Don't start over | Edit scenes, visual corrections, new version |
| 12 | Credits, not surprises | Pricing |
| 13 | All your videos, one place | Library, download and share |

## How to cut one ad (CapCut, Premiere or similar)

1. Make a 1080×1920 project at 30 fps.
2. Record the voice-over from the package. Good options are Reelmino's own "Woman — warm" or "Man — clear" voice, or your own voice. Each script runs 20–28 seconds.
3. Put each screen inside a phone mockup (or full-bleed, cropped from the top) and follow the "Motion / edit" column: slow push-ins, scrolls and tap highlights. The screens are 3× resolution, so zooming up to about 2× stays sharp.
4. Add the on-screen text in bold, large type. Brand colors: forest `#173D35`, lime `#D9F27A`, paper `#F6F7F2`.
5. Add light upbeat music under the voice, about −18 dB below the voice.
6. Finish on the 3-second end card: Reelmino logo plus `reelmino.com`.
7. Burn in captions of the voice-over. Most viewers watch muted.

## Platform rules of thumb

| Platform | Format | Notes |
|---|---|---|
| YouTube Shorts | 9:16, up to 60 s | Title ≤ 60 characters. Put the hook in the first second. `#Shorts` is already in the descriptions |
| TikTok | 9:16 | Keep text out of the bottom 20% and the right 15% (UI overlays). Use 3–6 hashtags |
| Telegram | 9:16 or 1:1 | Post the video with the Telegram text as the caption. Links are clickable |
| X | 9:16 or 1:1, up to 2:20 | Every post is under 280 characters (links count as 23). A 1:1 version gets more room in the feed |

## Staged content in the screens

The screens are the real app, captured on 7 Oct 2026, with a few presentation changes made for the ads:

- **Library:** shows only eight ad-friendly projects. Their titles were translated to English (for example "Pizza Bravo — the cheese pull").
- **Credit balance:** displays 160 credits.
- **Coffee proposal:** the scenes of the "Morning coffee — café reel" proposal were shown in English. The original was written in Hebrew.
- **Example data:** the Pizza Bravo prompt and brand details were typed in for the shots and not saved.
- **Studio screens:** captured from the current code, which includes this round of mobile fixes (bottom tab bar, automation heading, scene editor, light panels). Deploy before you publish the ads, so viewers see the same thing when they open the app.

## Before publishing

- Re-check prices on the live Pricing page; package 12 quotes $15, $49 and $119.
- Package 06 uses a placeholder clip. Render one short real lip-sync video for it.
- Package 10 should keep the BETA wording, since automation is still marked as an experiment and doesn't publish on its own.
