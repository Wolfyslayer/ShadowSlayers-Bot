# Architecture Overview – ShadowSlayers – Legends of Elements

## 1. Hosting & Deployment Topology

| Component | Hosting Target | Responsibility |
| :--- | :--- | :--- |
| **Source of Truth** | GitHub | Monorepo source code, docs, tests, migrations, security rules, CI/CD workflows |
| **Discord Bot & API** | Lunafy (Persistent Node.js) | Single Discord Gateway client, slash-command handlers, AutoMod, XP engine, persistent task scheduler, Express REST API |
| **Primary Database** | Firebase Spark (Cloud Firestore) | Persistent server-isolated collections via `DatabaseAdapter` (with `LocalPersistentAdapter` for zero-config local/preview runtime) |
| **Fallback Backend** | Supabase (Only if needed) | Documented fallback if Lunafy cannot expose inbound HTTP or OAuth2 callback handling |
| **Web Dashboard** | GitHub Pages (Static SPA) | Responsive React + TypeScript administration UI connecting to trusted API via `VITE_API_BASE_URL` |

### Why Unified Node.js Runtime (`server.ts` + `apps/bot`)
- Running the Express HTTP API alongside the Discord Gateway client inside a single Node.js process on Lunafy avoids duplicate database connections, avoids paid extra services, and lets the persistent scheduler and Gateway cache share in-memory state cleanly.
- If Lunafy restricts inbound HTTP traffic on a given plan, the HTTP API + Discord OAuth2 callback layer can be split to Supabase Edge Functions or a free Node host while keeping the exact same `packages/database` abstraction.

## 2. Package & Directory Layout

```text
/
├── apps/
│   └── bot/src/              # Discord Gateway client, 39 slash commands, discovery, automod, xp, scheduler
├── packages/
│   ├── config/src/           # Safe env loading & validation
│   ├── database/src/         # DatabaseAdapter abstraction + LocalPersistentAdapter + guild seed
│   ├── localization/src/     # Deterministic non-AI multilingual engine & channel previewer
│   ├── permissions/src/      # Role hierarchy, clan vs language isolation, RBAC guards
│   └── shared/src/           # Shared TypeScript interfaces & Zod schemas
├── database/                 # Firestore Spark rules template & versioned schema migrations
├── docs/                     # Architecture, Database, Security, Deployment, Commands, Modules
├── src/                      # React + Vite Dark Fantasy Web Administration Dashboard
├── tests/                    # Automated Node test suite
├── .github/workflows/        # CI and GitHub Pages deployment workflows
└── server.ts                 # Unified Express + Vite server (port 3000)
```

## 3. Existing Discord Server Discovery Principle
Before any setup operation runs, `apps/bot/src/services/discovery.ts` scans the target guild against `packages/shared/src/legacy-template.ts`:
1. Matches all 9 legacy categories (`📜 01 — GATE OF SHADOWS` through `🏰 09 — CLAN VOICE`), 32 legacy text channels, 5 voice channels, uncategorized channels, and permission overwrites, while tracking optional extension channels (`📜・audit-logs`, `💡・suggestions`) separately.
2. Maps all 16 legacy roles (`👑 Shadow King` through `✅ Verified`) using exact match or single controlled alias, blocking automatic selection on ambiguous candidates (`conflicting`), and keeping `👑 Shadow King` manual-only (`excludeFromAutoSetup: true`).
3. Reports misplaced channels (`incorrectPlacements`), channel type mismatches (`incorrectTypes`), and permission drifts (`permissionDifferences`) without deleting, renaming, moving, or overwriting existing Discord resources. Only verified Discord API creations transition to `applied`. See `docs/LEGACY_COMPATIBILITY_AUDIT.md` and `docs/SETUP_MANAGER.md`.
