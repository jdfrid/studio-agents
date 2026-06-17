# Studio Agents

**GitHub:** https://github.com/jdfrid/studio-agents  

**התקנה מפורטת (Windows):** [SETUP.md](./SETUP.md)

Modular 7-agent video production pipeline. Each step (Brief → Script → Audio → Asset → Package → Render → Series) is an independent TypeScript agent with strict Zod contracts, persisted state, and Google Cloud Storage for all artifacts.

## Architecture

```
apps/
  api/        Fastify HTTP API + approval/rerun endpoints
  worker/     BullMQ runner — one worker per stage
  web/        Vite + React minimal UI (runs list + per-stage panels)
packages/
  shared/         Zod schemas, enums, AgentContext, Logger
  providers/      Gemini-first adapters (text, TTS, image, music, Veo video), legacy adapters, GCS, AES-GCM crypto
  orchestrator/   BullMQ queues, state machine, repos, registry
  agents/
    brief/        Free-form brief → structured BriefOutput JSON
    script/       BriefOutput → SceneSpec[]
    audio/        TTS per scene + music → GCS
    asset/        Gemini reference frames OR user-uploaded GCS path
    package/      manifest.json + instructions.md + timeline.json + gemini-render-plan.json
    render/       Gemini/Veo generate_videos → operation polling → ffmpeg mux/concat → GCS
    series/       Stitch finished runs; optional Veo intro/outro → mega-video
infra/
  prisma/         schema.prisma + client + seed
  docker-compose.yml  postgres + redis
```

### Stage dependency graph

```
brief → script → audio ┐
                       ├→ package → render → series
       script → asset  ┘
```

### Per-stage approval policy

`brief`, `script`, `asset`, `package` wait for human approval before continuing. `audio`, `render`, `series` auto-progress. Adjust in `packages/shared/src/schemas/run.ts` → `STAGE_REQUIRES_APPROVAL`.

## Prerequisites

See **[SETUP.md](./SETUP.md)** for a full install checklist (Node, pnpm via `corepack`, Docker, Gemini, GCS).

- Node.js 20+
- pnpm 9 (`corepack enable` then `corepack prepare pnpm@9 --activate`)
- Docker Desktop (for Postgres + Redis)
- A Google Cloud Storage bucket and a service-account JSON with object-create + signed-url permission
- Gemini API key from Google AI Studio, plus GCS credentials.

## Getting started

```bash
pnpm install
cp .env.example .env
# Edit .env: set GEMINI_API_KEY, GCS_BUCKET, SECRETS_KEY_BASE64,
# GOOGLE_APPLICATION_CREDENTIALS (or GCS_CREDENTIALS_JSON)
pnpm infra:up
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

Generate `SECRETS_KEY_BASE64`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run all three services in parallel terminals:

```bash
pnpm dev:api      # http://localhost:4000
pnpm dev:worker
pnpm dev:web      # http://localhost:5173
```

## Configuring providers

Provider credentials live in the `ProviderCredential` table per tenant. The primary provider is now `type=GEMINI`, `provider=gemini`.

Minimal dev option: put the API key directly in `.env`:

```bash
GEMINI_API_KEY=your_google_ai_studio_key
```

Production option: insert one encrypted ProviderCredential row:

| field          | description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| tenantId       | the demo tenant from the seed                                            |
| type           | `GEMINI`                                                                 |
| provider       | `gemini`                                                                 |
| priority       | integer; **lowest wins** if multiple Gemini credentials exist            |
| enabled        | bool                                                                     |
| encryptedKey   | use `encryptSecret()` from `@studio/providers`                           |
| config         | model/capability JSON; see below                                         |

Example config:

```json
{
  "models": {
    "text": "gemini-2.5-pro",
    "tts": "gemini-2.5-flash-preview-tts",
    "image": "gemini-3.1-flash-image",
    "music": "lyria-3-clip-preview",
    "video": "veo-3.1-generate-preview"
  },
  "capabilities": {
    "music": false
  },
  "videoTimeoutSeconds": 900,
  "videoPollIntervalMs": 8000
}
```

Render uses **Gemini/Veo only**. There is no silent placeholder fallback. If Veo fails, the scene fails with `lastProviderError`/operation metadata and the UI shows the error.

### Recommended audio/render policy

- Veo is responsible for visual generation.
- Gemini TTS is responsible for exact narration, especially Hebrew.
- Lyria is optional for music. If it is unavailable, the Audio Agent returns `requiresExternalMusic=true` instead of inventing a fallback.
- FFmpeg is used only for muxing/mixing and concatenation, never to generate replacement visuals.

## HTTP API

| Method | Path                                          | Purpose                                  |
| ------ | --------------------------------------------- | ---------------------------------------- |
| POST   | `/runs`                                       | Create run; body = `{ tenantSlug, brief }` |
| GET    | `/runs`                                       | List recent runs                         |
| GET    | `/runs/:id`                                   | Full run with stages                     |
| POST   | `/runs/:id/stages/:stage/approve`             | Approve & move to next stage             |
| POST   | `/runs/:id/stages/:stage/rerun`               | Reset + re-enqueue this stage            |
| GET    | `/runs/:id/artifacts`                         | List artifacts (per stage)               |
| GET    | `/artifacts/:id/signed-url`                   | Signed GCS URL for download              |
| GET    | `/gemini/capabilities`                        | Gemini model/capability status           |
| GET    | `/runs/:id/gemini-operations`                 | Stored Gemini/Veo operation artifacts    |
| POST   | `/runs/:id/scenes/:sceneId/regenerate-visual` | Rerun visual asset stage for the run      |
| POST   | `/runs/:id/scenes/:sceneId/regenerate-video`  | Rerun render stage for the run            |

## Tests

```bash
pnpm test
```

## Adding a new agent

1. Create `packages/agents/<name>` with `package.json`, `tsconfig.json`, and `src/index.ts` exporting an `Agent<I, O>`.
2. Register it in `apps/worker/src/index.ts` via `registerAgent()`.
3. If it introduces a new stage, add it to `STAGE_ORDER` in `packages/shared/src/enums.ts`, add a Prisma enum value, write a migration, and add the input collector branch in `packages/orchestrator/src/runner.ts`.
