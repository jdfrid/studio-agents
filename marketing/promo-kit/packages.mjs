/**
 * Source of truth for the Reelmino promo packages.
 * Edit here, then run: node marketing/promo-kit/build.mjs
 *
 * Shot tuple: [timecode, screen file (screens/ or broll/), motion / edit note, voice-over, on-screen text]
 */

export const PACKAGES = [
  {
    id: "00",
    slug: "hero-overview",
    name: "Hero — Reelmino in 30 seconds",
    feature: "Whole product: idea → proposal → branded video",
    audience: "Small business owners, marketers, creators with no video team",
    hook: "Need a video for your business — but no crew, no editor, no time?",
    message: "Describe it once, review the script, get a finished branded 30-second video.",
    description:
      "Reelmino turns a one-sentence idea into a finished 30-second video. It writes the script, plans the scenes and shows a proposal before production. Your brand kit (logo, colors, website, voice) is applied to every video, and the result arrives with narration, music and captions, ready for Reels, TikTok and YouTube Shorts.",
    shots: [
      ["0–6s", "screens/21-create-prompt-filled.png", "Typing animation inside the text box", "Describe your business video in one sentence.", "1 · DESCRIBE IT"],
      ["6–12s", "screens/81-visual-style.png", "Tap through the style picker", "Pick a look: Pixar, LEGO, claymation, anime or cinematic.", "2 · PICK A STYLE"],
      ["12–18s", "demo/pixar-a.png", "Real Reelmino video, full screen", "Reelmino writes, casts and shoots every scene for you.", "3 · IT'S MADE FOR YOU"],
      ["18–24s", "demo/cinematic-a.png", "Real Reelmino video, full screen", "Your brand, voice, music and captions. Ready to post.", "REELS · TIKTOK · SHORTS"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Your story, now in motion.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "One sentence → a finished 30-second business video #Shorts",
      youtubeDescription:
        "Reelmino writes the script, plans the scenes and shows you a proposal before anything is produced. Your logo, colors and voice are applied automatically, and you get a finished 30-second video with narration, music and captions.\n\nTry it: https://reelmino.com",
      tiktokCaption: "No crew. No editor. Just one sentence → a finished 30-sec video for your business.",
      hashtags: ["#smallbusiness", "#videomarketing", "#aivideo", "#contentcreation", "#reels", "#marketingtips"],
      telegram:
        "Reelmino — your story, now in motion.\n\nDescribe your idea in one sentence. Reelmino writes the script, plans the scenes and shows you a proposal first. Your brand kit is applied to every video, and you get a finished 30-second MP4 with narration, music and captions.\n\n→ https://reelmino.com",
      x: "Need a business video but have no crew, no editor and no time?\n\nDescribe it in one sentence → review the script → get a finished, branded 30-sec video with voice, music and captions.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "01",
    slug: "idea-to-video",
    name: "One sentence is enough",
    feature: "Create from a single description",
    audience: "Busy owners who never made a video",
    hook: "What if one sentence was enough to make a video?",
    message: "Type what the video should show; Reelmino does the rest.",
    description:
      "The create screen asks one question: what should the video show or achieve? You type a sentence, pick a language and a format, and tap Prepare a proposal. Title, goal and every other setting are optional and live under More adjustments.",
    shots: [
      ["0–6s", "screens/20-create-empty.png", "Blinking cursor in the empty box", "What if one sentence was enough to make a video?", "ONE SENTENCE → ONE VIDEO"],
      ["6–12s", "screens/21-create-prompt-filled.png", "Type the prompt word by word", "Type what it should show: a cheesy slice, a kid's first bite.", "JUST DESCRIBE IT"],
      ["12–18s", "screens/54-run-coffee-proposal-top.png", "Scroll the generated scenes", "Reelmino writes the script and plans every scene.", "SCRIPT + SCENES, DONE"],
      ["18–24s", "demo/ugc-a.png", "Real Reelmino video, full screen", "Approve it, and get the video with voice, music and captions.", "A FINISHED MP4"],
      ["24–30s", "END CARD", "Logo + URL", "Start with one sentence at reelmino.com.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "I typed ONE sentence and got a 30-sec ad #Shorts",
      youtubeDescription:
        "Type what your video should show. Pick a language and a format. Reelmino writes the script, plans the scenes and produces a 30-second video with voice, music and captions.\n\nhttps://reelmino.com",
      tiktokCaption: "One sentence in. A 30-second business video out.",
      hashtags: ["#aivideo", "#smallbusinesstips", "#contentideas", "#videoediting", "#marketing"],
      telegram:
        "One sentence is enough.\n\nType what your video should show, choose a language and a format, and tap Prepare a proposal. Reelmino writes the script and plans the scenes — you approve, it produces.\n\n→ https://reelmino.com",
      x: "One sentence in → a 30-second business video out.\n\nType the idea, pick a language and format, approve the script. Reelmino handles scenes, voice, music and captions.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "02",
    slug: "review-before-production",
    name: "See the script before it's made",
    feature: "Proposal: script and scenes first, approval, scene editor",
    audience: "Anyone burned by paying for a video they didn't like",
    hook: "Ever paid for a video and hated the script?",
    message: "You see and edit every scene before production. No second charge to produce.",
    description:
      "In the recommended mode Reelmino prepares a proposal — 'This is how the video will look' — with the narration and visuals of every scene. You can edit any scene, then approve. Preparing the proposal uses 40 credits; producing the video after approval does not take another charge.",
    shots: [
      ["0–6s", "screens/54-run-coffee-proposal-top.png", "Hold on the headline", "Ever paid for a video and hated the script?", "SEE IT BEFORE IT'S MADE"],
      ["6–12s", "screens/60-scene-editor.png", "Highlight the narration field", "See every scene first, and change any line or visual.", "EDIT ANY SCENE"],
      ["12–18s", "screens/27-create-approval-mode.png", "Tap each mode", "Choose your control: automatic, script first, or every stage.", "YOU CHOOSE THE CONTROL"],
      ["18–24s", "screens/55-run-coffee-approve.png", "Tap Approve", "Approve it, and production follows your script. No second charge.", "APPROVE → PRODUCE"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Approve it before you make it.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "Approve the script BEFORE the video is made #Shorts",
      youtubeDescription:
        "Reelmino shows you the full script and every scene first. Edit any scene, then approve — producing after approval doesn't take another charge.\n\nhttps://reelmino.com",
      tiktokCaption: "Stop paying for videos you hate. See every scene first, then approve.",
      hashtags: ["#videomarketing", "#aivideo", "#smallbusiness", "#marketinghacks", "#creatortools"],
      telegram:
        "See the script before it's made.\n\nReelmino prepares a proposal with every scene's narration and visuals. Edit what you want, then approve. Preparing the proposal uses 40 credits — producing the video after approval doesn't take another charge.\n\n→ https://reelmino.com",
      x: "The worst part of outsourcing video: seeing it only when it's done.\n\nReelmino shows the script + every scene first. Edit, approve, then it produces — with no second charge.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "03",
    slug: "brand-kit",
    name: "On brand, every video",
    feature: "Brand kit: starters, identity, colors, end card, preferred voice",
    audience: "Brands and marketers who care about consistency",
    hook: "Does every video you post look like a different company?",
    message: "Set your brand once; every video uses it.",
    description:
      "The Brand kit stores your business name, tagline, website, logo, primary and background colors, and a preferred voice. Start from a ready kit (Daily deals shop, Local business, Service / expert) or save your own templates. Every video ends on your branded end card.",
    shots: [
      ["0–6s", "screens/30-brand-top.png", "Slow push-in", "Does every video you post look like a different company?", "ON BRAND. EVERY VIDEO."],
      ["6–12s", "screens/31-brand-identity.png", "Fields fill in one by one", "Add your name, tagline, website and logo, once.", "NAME · TAGLINE · LOGO"],
      ["12–18s", "screens/32-brand-colors.png", "Color swatches pop", "Set your brand colors and your brand voice.", "YOUR COLORS · YOUR VOICE"],
      ["18–24s", "screens/33-brand-end-card.png", "End card reveal", "Every video ends on your own branded end card.", "YOUR END CARD"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Set it once. Look like you, always.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "Make every video look like YOUR brand #Shorts",
      youtubeDescription:
        "Save your logo, colors, website, tagline and voice once in the Reelmino brand kit. Every new video uses it and ends on your branded end card.\n\nhttps://reelmino.com",
      tiktokCaption: "Consistent branding on every video, without redoing it every time.",
      hashtags: ["#branding", "#brandidentity", "#smallbusiness", "#videomarketing", "#marketingtips"],
      telegram:
        "On brand, every video.\n\nThe Reelmino brand kit keeps your name, tagline, website, logo, colors and preferred voice. Start from a ready kit or save your own — every video ends on your branded end card.\n\n→ https://reelmino.com",
      x: "Your videos should look like one company, not five.\n\nReelmino's brand kit: logo, colors, tagline, website and a preferred voice — set once, used on every video, with your own end card.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "04",
    slug: "voices",
    name: "23 voices — or your own",
    feature: "Voice library with samples, character voices, voice cloning",
    audience: "Creators and brands who want a distinct sound",
    hook: "Your video's voice matters more than you think.",
    message: "23 voices with instant samples, plus voice cloning with your consent.",
    description:
      "Reelmino includes 23 narration voices: six men's voices, six women's voices, character voices (boy, girl, cartoon, robotic, formal, silly) and special voices like an airport PA announcer, a hotel PA announcer, a beach lifeguard and a retro radio host. Every voice has a Play sample button. You can also clone a voice from a clean 30–120 second recording you have the right to use.",
    shots: [
      ["0–6s", "screens/34-voices.png", "Scroll the voice list", "Pick from 23 voices: clear, deep, warm, young or news-style.", "23 VOICES. ONE TAP."],
      ["6–12s", "screens/36-voices-characters.png", "Tap the character voices", "Or go playful: a cartoon, a robot, a retro radio host.", "CHARACTER VOICES"],
      ["12–18s", "screens/35-voices-selected.png", "Pulse on Play sample", "Tap Play sample to hear it before you choose.", "HEAR IT FIRST"],
      ["18–24s", "screens/65-voice-clone.png", "Highlight the upload box", "Or clone your own voice from a short, clean recording.", "CLONE YOUR VOICE"],
      ["24–30s", "END CARD", "Logo + URL", "Find your voice at reelmino.com.", "reelmino.com"]
    ],
    notes: "Only clone voices you have the right to use — the app asks for that consent. In a manual edit, play two or three real voice samples under scenes 1–3.",
    copy: {
      youtubeTitle: "23 AI voices for your ads — or clone your own #Shorts",
      youtubeDescription:
        "Men's, women's and character voices — even an airport announcer and a retro radio host. Tap Play sample to hear each one, or clone your own voice from a short clean recording.\n\nhttps://reelmino.com",
      tiktokCaption: "Which voice should narrate your ad? 23 options… or your own.",
      hashtags: ["#voiceover", "#aivoice", "#videomarketing", "#contentcreator", "#smallbusiness"],
      telegram:
        "23 voices — or your own.\n\nReelmino comes with men's, women's and character voices, plus special ones like an airport PA announcer, a beach lifeguard and a retro radio host. Hear every voice with Play sample, or clone your own from a clean 30–120 second recording.\n\n→ https://reelmino.com",
      x: "Your ad's voice changes everything.\n\nReelmino: 23 voices (incl. an airport announcer and a retro radio host), a Play sample button on each, and voice cloning from a short clean recording.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "05",
    slug: "phone-camera-and-materials",
    name: "Shoot it on your phone",
    feature: "Phone camera capture, gallery upload, material roles, reference video, inserted clip",
    audience: "Shop owners and creators who already film on their phone",
    hook: "Your phone is already a video studio.",
    message: "Snap your product or yourself; Reelmino builds the video around it.",
    description:
      "On mobile, the Source materials card opens the camera directly: Photograph a product (rear camera) or Photograph yourself (front camera). You can also choose files from the gallery. Reelmino places them automatically, or you can assign roles: character photos, product and location stills, logo. You can upload a reference video so Reelmino studies its style, colors and pacing (without copying it), or insert your own short clip.",
    shots: [
      ["0–6s", "screens/23-create-materials-camera.png", "Tap Photograph a product", "Your phone is a video studio: snap a product or a selfie.", "SHOOT ON YOUR PHONE"],
      ["6–12s", "screens/64-materials-roles.png", "Roles appear on each photo", "Reelmino places your photos, or you give each one a role.", "CHARACTER · PRODUCT · LOGO"],
      ["12–18s", "screens/66-reference-video.png", "Highlight the reference box", "Love a video's style? Upload it as a reference to match the look.", "MATCH A STYLE"],
      ["18–24s", "demo/cinematic-b.png", "Real Reelmino video, full screen", "Your real business, polished into a thirty-second video.", "YOUR PRODUCT, POLISHED"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Shot on your phone.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "Snap a product photo → get a 30-sec ad #Shorts",
      youtubeDescription:
        "Open Reelmino on your phone, tap Photograph a product or Photograph yourself, and the video is built around your real photos. Upload a reference video to match a style, or insert your own clip.\n\nhttps://reelmino.com",
      tiktokCaption: "Take a photo of your product. Get a whole ad back.",
      hashtags: ["#shotoniphone", "#productvideo", "#smallbusiness", "#ecommerce", "#aivideo"],
      telegram:
        "Shoot it on your phone.\n\nOn mobile, Reelmino opens the camera for you: Photograph a product or Photograph yourself. Add gallery photos, a logo or a short clip, or upload a reference video so Reelmino matches its style without copying it.\n\n→ https://reelmino.com",
      x: "Your phone is already a video studio.\n\nSnap your product (or yourself) right inside Reelmino → it builds a 30-sec video around your real photos. Want a certain look? Upload a reference video.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "06",
    slug: "lip-sync-talking-character",
    name: "Make your character talk",
    feature: "Talking character with lip-sync",
    audience: "Brands with a mascot, founders, educators",
    hook: "What if your mascot could talk?",
    message: "Upload a character photo, turn on lip-sync, and it speaks your script.",
    description:
      "Set Speech to 'Talking character with lip-sync', add at least one character image, and Reelmino matches the character's mouth movement to the narration. Lip-sync adds 20 credits (60 credits in total for a 30-second video).",
    shots: [
      ["0–6s", "screens/64-materials-roles.png", "Drop in a character photo", "What if your mascot could talk? Upload its photo.", "1 · ADD A CHARACTER"],
      ["6–12s", "screens/71-lipsync-summary.png", "Toggle lip-sync on", "Turn on Talking character with lip-sync.", "2 · TURN ON LIP-SYNC"],
      ["12–18s", "screens/34-voices.png", "Pick a voice", "Pick a voice, and the mouth matches every word.", "3 · IT TALKS"],
      ["18–24s", "screens/52-run-watch-clay-top.png", "Play the clay result", "Even a clay figure can present your product.", "PEOPLE · MASCOTS · CLAY"],
      ["24–30s", "END CARD", "Logo + URL", "Give your brand a face at reelmino.com.", "reelmino.com"]
    ],
    notes: "Scene 4 shows the real claymation watch project. For a stronger ad, render one short lip-sync video (a mascot saying the hook line) and splice it in like package 17 does.",
    copy: {
      youtubeTitle: "Make your mascot TALK (lip-sync in 3 steps) #Shorts",
      youtubeDescription:
        "Add a character photo, set Speech to Talking character with lip-sync, pick a voice. Reelmino matches the mouth to the narration. Lip-sync adds 20 credits.\n\nhttps://reelmino.com",
      tiktokCaption: "POV: your mascot finally gets to speak.",
      hashtags: ["#lipsync", "#aivideo", "#mascot", "#brandcharacter", "#marketing"],
      telegram:
        "Make your character talk.\n\nUpload a character photo, choose 'Talking character with lip-sync' and pick a voice — Reelmino matches the mouth movement to your script. Lip-sync adds 20 credits.\n\n→ https://reelmino.com",
      x: "Your mascot can talk now.\n\nUpload a character photo → turn on lip-sync → pick a voice. Reelmino matches the mouth to every word. +20 credits per video.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "07",
    slug: "languages-and-captions",
    name: "Seven languages, captions on",
    feature: "Content language (7) and automatic captions",
    audience: "Businesses selling to multilingual audiences",
    hook: "Selling in more than one language?",
    message: "One idea, seven languages, captions on by default.",
    description:
      "Every video can be made in Hebrew, English, Arabic, Russian, French, Spanish or Yiddish. The content language controls what's spoken and written in the video, independent of the app's interface language. Captions are on by default, so the message works with the sound off. Create another version to make the same video in a second language.",
    shots: [
      ["0–6s", "screens/22-create-language-format.png", "Tap through the languages", "Reelmino speaks seven languages, from Hebrew to Spanish.", "HE · EN · AR · RU · FR · ES · YI"],
      ["6–12s", "screens/28-create-basic-settings.png", "Highlight the language field", "The language is spoken and written in the video itself.", "SPOKEN + WRITTEN"],
      ["12–18s", "screens/63-remix-top.png", "Tap Create another version", "New market? Create another version in a new language.", "ANOTHER LANGUAGE, ANOTHER VERSION"],
      ["18–24s", "demo/anime-a.png", "Real Reelmino video with captions", "Captions are on by default, so it lands even on mute.", "WORKS ON MUTE"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Speak to everyone.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "Same ad, 7 languages, captions included #Shorts",
      youtubeDescription:
        "Make your 30-second video in Hebrew, English, Arabic, Russian, French, Spanish or Yiddish. Captions are on by default, and you can create another version in a second language.\n\nhttps://reelmino.com",
      tiktokCaption: "Your ad in 7 languages — with captions for the people scrolling on mute.",
      hashtags: ["#multilingual", "#captions", "#videomarketing", "#globalbusiness", "#aivideo"],
      telegram:
        "Seven languages, captions on.\n\nReelmino makes videos in Hebrew, English, Arabic, Russian, French, Spanish and Yiddish. Captions are on by default, and one tap creates another version in a new language.\n\n→ https://reelmino.com",
      x: "Most people scroll on mute.\n\nReelmino videos come with captions on by default, in 7 languages: Hebrew, English, Arabic, Russian, French, Spanish, Yiddish.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "08",
    slug: "formats-and-platforms",
    name: "Made for every feed",
    feature: "Vertical / horizontal format, platform targeting, fixed 30-second length",
    audience: "Social media managers posting on many networks",
    hook: "Reels, TikTok, Shorts, LinkedIn, YouTube — one tool.",
    message: "Pick the feed; get a video that fits it.",
    description:
      "Choose Vertical for Reels, TikTok and YouTube Shorts, or Horizontal for YouTube and presentations. Under Basic settings you pick the platform — Instagram Reels, TikTok, YouTube Shorts, LinkedIn, YouTube landscape or Website / presentation. Every video is 30 seconds, the sweet spot for short-form.",
    shots: [
      ["0–6s", "screens/22-create-language-format.png", "Tap Vertical, then Horizontal", "Vertical for Reels, TikTok and Shorts, or horizontal for YouTube.", "9:16 · 16:9"],
      ["6–12s", "screens/28-create-basic-settings.png", "Open the platform list", "Tell Reelmino where you're posting, and it fits the feed.", "PICK THE PLATFORM"],
      ["12–18s", "demo/lego-a.png", "Real Reelmino video, full screen", "Every video is a tight thirty seconds.", "ALWAYS 30 SECONDS"],
      ["18–24s", "screens/62-actions-menu.png", "Tap Download", "Download the MP4 and post it anywhere.", "DOWNLOAD · POST"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. One video, every feed.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "One tool for Reels, TikTok, Shorts & LinkedIn #Shorts",
      youtubeDescription:
        "Pick vertical or horizontal, choose the platform, and get a 30-second video ready to post on Reels, TikTok, YouTube Shorts, LinkedIn or YouTube.\n\nhttps://reelmino.com",
      tiktokCaption: "Vertical for TikTok, horizontal for YouTube — same tool, 30 seconds each.",
      hashtags: ["#socialmediamarketing", "#reels", "#youtubeshorts", "#linkedin", "#contentstrategy"],
      telegram:
        "Made for every feed.\n\nChoose vertical or horizontal and the platform you're posting to — Reels, TikTok, YouTube Shorts, LinkedIn or YouTube. Every Reelmino video is a tight 30 seconds, delivered as an MP4.\n\n→ https://reelmino.com",
      x: "Reels. TikTok. Shorts. LinkedIn. YouTube.\n\nPick vertical or horizontal + the platform → Reelmino makes a 30-sec video that fits the feed. Download the MP4 and post.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "09",
    slug: "mood-style-control",
    name: "Your mood, your rules",
    feature: "Mood & style, More adjustments studio, creation mode",
    audience: "Marketers who want creative control without an editor",
    hook: "Calm café or high-energy launch?",
    message: "Pick the mood and how hands-on you want to be.",
    description:
      "Choose up to two moods — Professional & trustworthy, Premium, Emotional, Young & energetic, Clean & modern, Dramatic, Calm. Reelmino applies the mood to color, music, pacing, narration and cinematography. More adjustments opens the full flow (Idea & style, Script & scenes, Voice & music, Review & create), and Creation mode sets how much you approve: automatic, script first, or every stage.",
    shots: [
      ["0–6s", "screens/26-create-mood.png", "Tap two mood chips", "Calm café or high-energy launch? Pick up to two moods.", "SET THE MOOD"],
      ["6–12s", "screens/80-style-presets.png", "Tap a preset card", "Or tap a preset: product ad, B2B, personal story, news or social.", "ONE-TAP PRESETS"],
      ["12–18s", "screens/87-camera-editing.png", "Scroll the camera settings", "Fine-tune camera, effects, transitions and caption style.", "THE FULL STUDIO"],
      ["18–24s", "demo/clay-a.png", "Real Reelmino video, full screen", "Same tool. Your style.", "YOUR STYLE"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Your mood, your rules.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "Pick a mood → the whole video changes #Shorts",
      youtubeDescription:
        "Choose up to two moods and Reelmino adapts color, music, pacing, narration and camera work. Go fully automatic, or approve every stage.\n\nhttps://reelmino.com",
      tiktokCaption: "Same idea, different mood, completely different video.",
      hashtags: ["#creativedirection", "#aivideo", "#videomarketing", "#branding", "#contentcreation"],
      telegram:
        "Your mood, your rules.\n\nPick up to two moods — Premium, Emotional, Young & energetic, Dramatic, Calm and more. Reelmino applies them to color, music, pacing, narration and camera work. Then choose your control: automatic, script first, or approve every stage.\n\n→ https://reelmino.com",
      x: "Calm café or high-energy launch?\n\nPick up to 2 moods in Reelmino → color, music, pacing, narration and camera all follow. Fully automatic or approve every stage — your call.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "10",
    slug: "daily-automation",
    name: "A new video every day (beta)",
    feature: "Automation: website scan, product catalog, daily production log",
    audience: "E-commerce and deal sites with many product pages",
    hook: "Got a website full of products? Get a new video every day.",
    message: "Lock the brand, add the website, and Reelmino makes a daily product video.",
    description:
      "Automation (beta) locks a brand kit and your website. Reelmino scans the site into a product catalog, and each day picks a different product page and produces a new video. Nothing is published automatically — each video waits in your library, ready for you to review and distribute.",
    shots: [
      ["0–6s", "screens/40-automation-top.png", "Slow push-in", "Got a website full of products? Get a new video every day.", "A DAILY VIDEO FROM YOUR SITE"],
      ["6–12s", "screens/41-automation-catalog.png", "Catalog rows appear", "Reelmino scans your site and builds a product catalog.", "AUTO CATALOG"],
      ["12–18s", "screens/42-automation-log.png", "New entry slides in", "Each day it picks a product and produces a new video.", "A NEW VIDEO DAILY"],
      ["18–24s", "screens/10-dashboard-library.png", "Library scroll", "Every video waits in your library. Nothing posts without you.", "YOU STAY IN CONTROL · BETA"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Your catalog, on video, daily.", "reelmino.com"]
    ],
    notes: "Automation is labelled an experiment in the app; keep the BETA wording and don't promise auto-publishing.",
    copy: {
      youtubeTitle: "My website now makes a new video every day #Shorts",
      youtubeDescription:
        "Reelmino Automation (beta) scans your website into a product catalog and produces a new branded video every day from a different product page. Nothing is published without you.\n\nhttps://reelmino.com",
      tiktokCaption: "Turned my product pages into a daily video machine (beta).",
      hashtags: ["#ecommerce", "#automation", "#productmarketing", "#shopify", "#aivideo"],
      telegram:
        "A new video every day (beta).\n\nLock your brand kit and add your website. Reelmino scans it into a product catalog and each day turns a different product page into a new video. Nothing is published automatically — every video waits for your review.\n\n→ https://reelmino.com",
      x: "Website full of products? Reelmino Automation (beta) scans it into a catalog and makes a new branded video every day — from a different product each time. You review before anything goes out.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "11",
    slug: "edit-refine-remix",
    name: "Almost perfect? Don't start over",
    feature: "Edit scenes, visual corrections, create another version",
    audience: "Users iterating on a finished video",
    hook: "Almost perfect? Don't start over.",
    message: "Fix a scene, regenerate a look, or spin off a new version.",
    description:
      "On a finished project, 'Want to refine something?' leads to the scene editor, where you change narration, visual description, character, location, action and length per scene. Visual corrections lets you change the look and regenerate — the cost is shown before you confirm and the previous file stays until the new one replaces it. Create another version starts a new production based on the original.",
    shots: [
      ["0–6s", "screens/61-refine.png", "Tap Edit scenes", "Almost perfect? Don't start over. Open Edit scenes.", "DON'T START OVER"],
      ["6–12s", "screens/60-scene-editor.png", "Edit the narration line", "Rewrite a line, the visual, the character or the timing.", "LINE BY LINE"],
      ["12–18s", "screens/56-run-coffee-below.png", "Highlight the cost", "Regenerate just that scene. You see the cost first.", "COST SHOWN FIRST"],
      ["18–24s", "screens/63-remix-top.png", "Tap Create another version", "Or create another version: a new angle, language or audience.", "CREATE ANOTHER VERSION"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Refine, don't redo.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "Fix one scene instead of remaking the whole video #Shorts",
      youtubeDescription:
        "Edit any scene's narration or visuals, regenerate the look with the cost shown first, or create another version for a new audience — your original stays in the library.\n\nhttps://reelmino.com",
      tiktokCaption: "When the video is 90% there — fix the 10%, keep the rest.",
      hashtags: ["#videoediting", "#aivideo", "#contentcreator", "#marketing", "#workflow"],
      telegram:
        "Almost perfect? Don't start over.\n\nEdit any scene's narration, visuals, character or length. Use Visual corrections to regenerate a look (the cost is shown before you confirm), or create another version for a new language or audience.\n\n→ https://reelmino.com",
      x: "The video is 90% right. Don't redo it.\n\nIn Reelmino: edit a scene's narration or visual, regenerate the look (cost shown first), or create another version — your original stays put.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "12",
    slug: "transparent-pricing",
    name: "Credits, not surprises",
    feature: "Credit pricing: single video, Starter, Business",
    audience: "Price-sensitive small businesses",
    hook: "How much does a video cost? Exactly what it says.",
    message: "40 credits per 30-second video. Start at $15, no commitment.",
    description:
      "A 30-second video costs 40 credits; lip-sync adds 20. Single video: $15 one-time for 49 credits. Starter: $49 per month for 200 credits (about 5 videos). Business: $119 per month for 600 credits (about 15 videos). The cost is shown before you create, and your balance is always on the dashboard. Prices are in USD; local tax may be added at checkout.",
    shots: [
      ["0–6s", "screens/02-pricing-top.png", "Price tag swing-in", "A thirty-second video is forty credits. No surprises.", "1 VIDEO = 40 CREDITS"],
      ["6–12s", "screens/02-pricing-top.png", "Zoom on $15", "Start with a single video for fifteen dollars, no commitment.", "$15 · NO COMMITMENT"],
      ["12–18s", "screens/02-pricing-plans.png", "Pan over Starter and Business", "Or go monthly: Starter is five videos, Business about fifteen.", "STARTER $49 · BUSINESS $119"],
      ["18–24s", "screens/24-create-summary-bar.png", "Zoom on the cost line", "The cost is shown before you create, every time.", "COST SHOWN UP FRONT"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Clear pricing at reelmino.com.", "reelmino.com"]
    ],
    notes: "Re-check prices on the live Pricing page before publishing. Scene 3 uses 02-pricing-plans.png (Starter and Business cards cropped from 02-pricing-full.png).",
    copy: {
      youtubeTitle: "A 30-second business video for $15. No subscription. #Shorts",
      youtubeDescription:
        "Reelmino pricing is simple: 40 credits per 30-second video. Single video $15 (49 credits), Starter $49/month (200 credits), Business $119/month (600 credits). Prices in USD; local tax may apply.\n\nhttps://reelmino.com/pricing",
      tiktokCaption: "What a 30-sec business video actually costs (no hidden fees).",
      hashtags: ["#smallbusiness", "#marketingbudget", "#videomarketing", "#pricing", "#entrepreneur"],
      telegram:
        "Credits, not surprises.\n\n• 30-second video = 40 credits (lip-sync +20)\n• Single video — $15 one-time, 49 credits\n• Starter — $49/month, 200 credits (~5 videos)\n• Business — $119/month, 600 credits (~15 videos)\n\nThe cost is shown before you create. Prices in USD; local tax may apply.\n\n→ https://reelmino.com/pricing",
      x: "Video pricing without the fine print:\n\n30-sec video = 40 credits\nSingle: $15 (49 credits)\nStarter: $49/mo (200)\nBusiness: $119/mo (600)\n\nCost shown before you create.\n\nhttps://reelmino.com/pricing"
    }
  },
  {
    id: "13",
    slug: "library-download-share",
    name: "All your videos, one place",
    feature: "Dashboard library, filters, final video, download and share",
    audience: "Teams producing videos regularly",
    hook: "Where did that video go?",
    message: "Every project in one library, ready to download and share.",
    description:
      "My studio lists every project with its status: drafts, in production, ready, needs action. Search and filter, open a project to watch the final video, then download the MP4, share it, or create another version from the Actions menu.",
    shots: [
      ["0–6s", "screens/10-dashboard-library.png", "Library scroll", "Every project in one place: drafts, ready, or needing you.", "ONE LIBRARY"],
      ["6–12s", "screens/50-run-pizza-top.png", "Tap play", "Open any project to watch the final video.", "WATCH"],
      ["12–18s", "demo/pixar-b.png", "Real Reelmino video, full screen", "Thirty seconds, with your brand on it.", "YOUR FINAL VIDEO"],
      ["18–24s", "screens/62-actions-menu.png", "Tap Download", "Download it, share it, or create another version.", "DOWNLOAD · SHARE · REMIX"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Your video studio, in your pocket.", "reelmino.com"]
    ],
    copy: {
      youtubeTitle: "My whole video studio fits in my pocket #Shorts",
      youtubeDescription:
        "Every Reelmino project lives in one library — drafts, in production, ready and needs action. Watch the final video, download the MP4, share it, or create another version.\n\nhttps://reelmino.com",
      tiktokCaption: "Every video I've made for my business — in one place, ready to post.",
      hashtags: ["#contentcalendar", "#socialmedia", "#smallbusiness", "#videomarketing", "#productivity"],
      telegram:
        "All your videos, one place.\n\nMy studio shows every project with its status. Watch the final video, download the MP4, share it, or create another version from the Actions menu.\n\n→ https://reelmino.com",
      x: "Your video studio, in your pocket.\n\nEvery Reelmino project in one library → filter by draft / ready / needs action → download the MP4, share, or spin off another version.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "14",
    slug: "one-idea-many-styles",
    name: "One idea, any style",
    feature: "Design / animation style: Pixar-style 3D, LEGO, claymation, anime, cinematic, UGC and more",
    audience: "Brands that want their videos to stand out in the feed",
    hook: "Same idea. Which look stops the scroll?",
    message: "Pick a visual style and the whole video follows it, from cast to lighting.",
    description:
      "Under More adjustments → Visual style you choose the design or animation style: Pixar-style 3D, LEGO characters, claymation, anime, 2D, cinematic film, documentary, phone-style UGC, retro, paper cutout and more, plus color palette, realism and lighting. All footage in this ad is from real Reelmino videos of the same bakery idea.",
    shots: [
      ["0–6s", "screens/82-style-options.png", "Scroll the style list", "One bakery idea. Now pick the look.", "ONE IDEA · DOZENS OF LOOKS"],
      ["6–12s", "demo/pixar-a.png", "Real Reelmino video, full screen", "Pixar-style 3D, in warm sunrise light.", "PIXAR-STYLE 3D"],
      ["12–18s", "demo/lego-a.png", "Real Reelmino video, full screen", "LEGO characters, brick by brick.", "LEGO CHARACTERS"],
      ["18–24s", "demo/clay-a.png", "Real Reelmino video, full screen", "Handmade claymation, or anime, cinematic, even phone-style.", "CLAYMATION · ANIME · CINEMATIC"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. One idea, any style.", "reelmino.com"]
    ],
    notes: "All footage comes from demo/ — real Reelmino videos made from one bakery idea with different Visual style settings (see demos.mjs).",
    copy: {
      youtubeTitle: "Same bakery ad in Pixar, LEGO and claymation style #Shorts",
      youtubeDescription:
        "One idea, produced by Reelmino in different visual styles: Pixar-style 3D, LEGO characters, claymation, anime, cinematic and phone-style UGC. Pick the look under Visual style and the whole video follows it.\n\nhttps://reelmino.com",
      tiktokCaption: "Same bakery ad. Pixar, LEGO or claymation? Pick your fighter 👇",
      hashtags: ["#aivideo", "#pixarstyle", "#lego", "#claymation", "#animation", "#smallbusiness"],
      telegram:
        "One idea, any style.\n\nWe made the same bakery ad with Reelmino in Pixar-style 3D, LEGO characters, claymation, anime and cinematic film. Choose the visual style, color palette, realism and lighting — the whole video follows.\n\n→ https://reelmino.com",
      x: "Same bakery ad, made with Reelmino in:\n\n· Pixar-style 3D\n· LEGO characters\n· Claymation\n· Anime\n· Cinematic film\n\nPick the look, the whole video follows.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "15",
    slug: "cast-and-wardrobe",
    name: "Cast it, dress it",
    feature: "Character type, age, wardrobe and expression",
    audience: "Businesses that want a presenter who looks like their customers",
    hook: "Who should be in your video — and what are they wearing?",
    message: "Choose the character, the age, the outfit and the expression.",
    description:
      "Under More adjustments → Script & scenes you pick the character type (business owner, customer, expert, presenter, doctor, DJ, mascot, LEGO figure and more), the age group, the wardrobe (casual, business, formal, smart casual, sporty, workwear, medical uniform, futuristic…), the expression and the action. The same character stays consistent across every scene.",
    shots: [
      ["0–6s", "screens/85-character-options.png", "Scroll the character list", "Choose who's on screen: an owner, an expert, a DJ or a mascot.", "PICK YOUR CAST"],
      ["6–12s", "screens/84-wardrobe-options.png", "Tap through the wardrobe list", "Then dress them: workwear, smart casual, formal or sporty.", "PICK THE WARDROBE"],
      ["12–18s", "demo/formal-a.png", "Real Reelmino video, full screen", "The same baker in a formal suit…", "FORMAL"],
      ["18–24s", "demo/sporty-a.png", "Real Reelmino video, full screen", "…or sporty at sunrise. Same face in every scene.", "SPORTY · SAME FACE EVERY SCENE"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. Cast it your way.", "reelmino.com"]
    ],
    notes: "Scenes 3–4 are real Reelmino videos of the bakery idea with Wardrobe set to Formal and Sporty (demos.mjs).",
    copy: {
      youtubeTitle: "I changed my presenter's outfit with one tap #Shorts",
      youtubeDescription:
        "Reelmino lets you pick the character type, age group, wardrobe and expression for your video — formal, sporty, workwear, smart casual and more — and keeps the same person in every scene.\n\nhttps://reelmino.com",
      tiktokCaption: "Formal or sporty? Same baker, one tap.",
      hashtags: ["#aivideo", "#wardrobe", "#videomarketing", "#smallbusiness", "#contentcreator"],
      telegram:
        "Cast it, dress it.\n\nIn Reelmino you choose who appears in your video — owner, customer, expert, presenter, mascot — plus age, wardrobe and expression. The same character stays consistent in every scene.\n\n→ https://reelmino.com",
      x: "Who's in your video, and what are they wearing?\n\nReelmino: pick the character, age, wardrobe (formal, sporty, workwear…) and expression. Same face in every scene.\n\nhttps://reelmino.com"
    }
  },
  {
    id: "16",
    slug: "set-the-scene",
    name: "You're the director",
    feature: "Location, time of day, weather, lighting, camera, effects and transitions",
    audience: "Marketers who want cinematic control without a crew",
    hook: "Sunrise or neon night? You call the shot.",
    message: "Set the location, the light, the camera and the effects, without a crew.",
    description:
      "Script & scenes sets the location (store, street, office, home, nature, studio), time of day and weather. Cinematography & editing sets the shot type, camera angle and movement, effects (bokeh, slow motion, light rays, film grain, split screen…), scene transitions and caption style.",
    shots: [
      ["0–6s", "screens/86-scene-setting.png", "Highlight location and time", "Set the scene: store, street, office, studio or nature.", "LOCATION · TIME · WEATHER"],
      ["6–12s", "screens/88-effects-options.png", "Scroll the effects list", "Add camera moves and effects: bokeh, slow motion, light rays.", "CAMERA · EFFECTS"],
      ["12–18s", "demo/anime-a.png", "Real Reelmino video, full screen", "An anime street at sunset, with light rays.", "SUNSET · LIGHT RAYS"],
      ["18–24s", "demo/cinematic-a.png", "Real Reelmino video, full screen", "Or a cinematic close-up in slow motion.", "CLOSE-UP · SLOW MOTION"],
      ["24–30s", "END CARD", "Logo + URL", "Reelmino. You're the director.", "reelmino.com"]
    ],
    notes: "Scenes 3–4 are real Reelmino videos (demos.mjs: anime at sunset with light rays; cinematic close-up with slow motion).",
    copy: {
      youtubeTitle: "Directing a commercial from my phone #Shorts",
      youtubeDescription:
        "Pick the location, time of day, weather, lighting, camera movement, effects and transitions — Reelmino shoots it. Bokeh, slow motion, light rays, film grain and more.\n\nhttps://reelmino.com",
      tiktokCaption: "Sunrise, slow motion, light rays. Directed from my phone.",
      hashtags: ["#filmmaking", "#aivideo", "#cinematic", "#videomarketing", "#director"],
      telegram:
        "You're the director.\n\nChoose the location, time of day and weather, then the shot type, camera movement, effects and transitions. Reelmino shoots every scene the way you set it.\n\n→ https://reelmino.com",
      x: "You're the director:\n\n· Location, time of day, weather\n· Lighting and camera moves\n· Bokeh, slow motion, light rays\n· Transitions and caption style\n\nNo crew. https://reelmino.com"
    }
  },
  {
    id: "17",
    slug: "making-of",
    name: "Watch me make one",
    feature: "Live walkthrough: one line + chosen settings → the real finished video",
    audience: "People who want to see it actually work",
    hook: "Watch me make an ad in three taps.",
    message: "One line, a few settings, and this is the real result.",
    description:
      "A making-of: type one line about a bakery, choose Pixar-style 3D with warm colors and cinematic light, a baker in workwear in the store at sunrise, then create. The last part of the ad is the actual video Reelmino produced from exactly those settings, spliced in as-is.",
    shots: [
      ["0–6s", "screens/90-making-of-prompt.png", "Typing animation", "Watch me make one. One line: a bakery at sunrise.", "1 · ONE LINE"],
      ["6–12s", "screens/81-visual-style.png", "Tap Pixar-style, warm colors, cinematic", "Pixar-style 3D, warm colors, cinematic light.", "2 · PICK THE STYLE"],
      ["12–18s", "screens/83-cast-wardrobe.png", "Tap the cast settings", "A baker in workwear, in the store, at sunrise. Create.", "3 · CAST · WARDROBE · PLACE"],
      ["18–24s", "demo/clip-pixar.mp4", "The real result, spliced in with its own sound", "", "THE RESULT · MADE WITH REELMINO"],
      ["24–30s", "END CARD", "Logo + URL", "Your turn at reelmino.com.", "reelmino.com"]
    ],
    insert: { file: "demo/clip-pixar.mp4", at: 18, audio: "clip" },
    notes: "Scene 4 is not generated: it is 6 seconds of the real Pixar-style demo video (demo/clip-pixar.mp4), spliced in with its original audio.",
    copy: {
      youtubeTitle: "I made this bakery ad in 3 taps (real result) #Shorts",
      youtubeDescription:
        "One line, then Pixar-style 3D, warm colors, cinematic light, a baker in workwear at sunrise. The end of this video is the real result Reelmino produced from exactly those settings.\n\nhttps://reelmino.com",
      tiktokCaption: "3 taps → this. The ending is the real result 🥐",
      hashtags: ["#aivideo", "#makingof", "#pixarstyle", "#smallbusiness", "#bakery", "#behindthescenes"],
      telegram:
        "Watch me make one.\n\nOne line about a bakery → Pixar-style 3D, warm colors, cinematic light → a baker in workwear at sunrise → Create. The ending is the actual video Reelmino produced.\n\n→ https://reelmino.com",
      x: "Watch me make an ad in 3 taps:\n\n1. One line: a bakery at sunrise\n2. Pixar-style, warm, cinematic\n3. Baker in workwear → Create\n\nThe ending is the real result.\n\nhttps://reelmino.com"
    }
  }
];
