# התקנה והרצה — Studio Agents

**Repository:** https://github.com/jdfrid/studio-agents

## מה צריך להתקין (Windows)

| רכיב | חובה? | הערות |
|------|--------|--------|
| [Node.js LTS](https://nodejs.org) (≥ 20.10) | כן | כולל `npm` ו־`corepack` |
| **pnpm 9** | כן | אחרי Node — ראה למטה |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | כן לפיתוח מלא | Postgres + Redis |
| **Git** | כן | כבר בשימוש אם שיבצת את ה-repo |
| **Gemini API key** | כן לרינדור אמיתי | [Google AI Studio](https://aistudio.google.com/apikey) |
| **GCS** (bucket + service account JSON) | כן לרינדור אמיתי | ראה `scripts/setup-gcs.ps1` או ממשק GCP |
| GitHub CLI (`gh`) | לא | אופציונלי |

**לא** צריך להתקין ידנית: PostgreSQL, Redis, FFmpeg (מגיע דרך Docker / `ffmpeg-static`).

---

## 1. Node.js + pnpm

ב־PowerShell (אחרי התקנת Node — **סגור ופתח מחדש** את הטרמינל):

```powershell
node --version
npm --version
```

הפעלת pnpm דרך corepack:

```powershell
corepack enable
corepack prepare pnpm@9 --activate
pnpm --version
```

אם `corepack` לא עובד:

```powershell
npm install -g pnpm
pnpm --version
```

---

## 2. שיבוט והתקנת תלויות

```powershell
git clone https://github.com/jdfrid/studio-agents.git
cd studio-agents
pnpm install
```

אם כבר יש לך את התיקייה המקומית:

```powershell
cd C:\Users\jdfri\studio-agents
pnpm install
```

---

## 3. בדיקה מהירה (בלי Docker / Gemini)

```powershell
pnpm typecheck
pnpm test
```

---

## 4. סביבת פיתוח מלאה

```powershell
copy .env.example .env
```

ערוך `.env` — לפחות:

- `GEMINI_API_KEY` — מפתח מ־Google AI Studio
- `GCS_BUCKET` + `GOOGLE_APPLICATION_CREDENTIALS` — אחרי הגדרת GCS
- `SECRETS_KEY_BASE64` — מפתח הצפנה (ראה README)

הפעלת תשתית:

```powershell
pnpm infra:up
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

בשלושה חלונות PowerShell נפרדים:

```powershell
pnpm dev:api      # http://localhost:4000
pnpm dev:worker
pnpm dev:web      # http://localhost:5173
```

---

## 5. עדכון ב-GitHub

אחרי שינויים מקומיים:

```powershell
cd C:\Users\jdfri\studio-agents
git add .
git commit -m "תיאור השינוי"
git push origin main
```

---

## בעיות נפוצות

| שגיאה | פתרון |
|--------|--------|
| `pnpm is not recognized` | התקן Node LTS, הפעל מחדש טרמינל, הרץ `corepack enable` |
| `node is not recognized` | התקן Node.js LTS מ־nodejs.org |
| Docker לא עולה | הפעל Docker Desktop, המתן עד Ready, שוב `pnpm infra:up` |
| `gcloud is not recognized` | לא חובה — GCS אפשר להגדיר בממשק או `scripts/setup-gcs.ps1` |
