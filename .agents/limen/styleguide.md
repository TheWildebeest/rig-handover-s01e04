# Styleguide

Follow `docs/styleguide.md` and `AGENTS.md`.

- TypeScript strict, no `any`. Pure logic in `src/<feature>/`, views in `src/views/`, routes in `src/app.tsx`.
- Server-rendered `hono/jsx` only. No client JS.
- Never edit `runs/`. Never commit `.env`, tokens or previews.
- Required checks before finishing: `pnpm typecheck` and `pnpm test`.
- Small commits, `closes #n` in the message.
