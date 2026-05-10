# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Python**: 3.11 (for Whisper transcription)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   │   ├── src/routes/captions.ts  # Caption processing API
│   │   ├── uploads/        # Temp uploaded videos
│   │   ├── outputs/        # Processed SRT + captioned MP4 files
│   │   └── whisper_transcribe.py   # Python Whisper transcription script
│   └── captiongen/         # React + Vite frontend (at /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # pnpm workspace config
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package
```

## Applications

### CaptionGen (`artifacts/captiongen`)

A full-stack video captioning SaaS app. Users upload a short video (max 60s, 100MB), the app:
1. Validates upload (duration + size)
2. Extracts audio with FFmpeg
3. Transcribes with OpenAI Whisper (base model, runs locally)
4. Generates a `.srt` subtitle file
5. Burns subtitles into the video with FFmpeg
6. Returns preview + download links for captioned MP4 and SRT

- Frontend: React + Vite, at `/`
- Backend: Express API at `/api/captions/process` and `/api/captions/download/:filename`
- Python runtime: Whisper transcription via `whisper_transcribe.py`
- No login, no DB, no payments

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/`.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes:
  - `src/routes/health.ts` — `GET /api/healthz`
  - `src/routes/captions.ts` — `POST /api/captions/process`, `GET /api/captions/download/:filename`
- `whisper_transcribe.py` — spawned by Node to run Whisper

### `artifacts/captiongen` (`@workspace/captiongen`)

React + Vite frontend for CaptionGen.

- Preview path: `/`
- Components: `UploadZone`, `ProcessingOverlay`, `ResultView`
- Page: `Home.tsx`

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec and Orval config.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
