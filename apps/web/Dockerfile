# ── Stage 1: Build the Next.js app ──
#
# Build context = monorepo root (`.`) so we can copy `bun.lock` from the
# workspace root. The Dockerfile path in compose is `apps/web/Dockerfile`.
#
# Why a Node-style runtime instead of nginx-serving-static:
#   Next.js with the App Router (like Nuxt with Nitro) is a *framework
#   server*, not an SPA. The home page, document list, document detail,
#   and providers pages are Server Components that run server-side fetches
#   on every request — they need a running Node.js process. The reference
#   projects (snap-and-describe / Vite / Angular) use nginx because they
#   are pure SPAs that compile to static HTML+JS; that pattern doesn't
#   apply to Next.js.
FROM oven/bun:1-slim AS builder

WORKDIR /app

# Copy the workspace package files first so Docker can cache the
# dependency layer when only source files change.
#
# We have to copy *every* workspace package.json (not just apps/web/),
# otherwise `bun install --frozen-lockfile` thinks the workspace is
# inconsistent and refuses to install. Bun resolves the lockfile against
# the full set of workspace packages declared in the root package.json
# (`workspaces: ["apps/*"]`), so leaving any of them out makes the
# resolved lockfile drift from the committed one.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Install all dependencies (dev included — needed for `next build`).
RUN bun install --frozen-lockfile

# Copy the rest of the web source.
COPY apps/web/ apps/web/

# `NEXT_PUBLIC_*` env vars are inlined into the JavaScript bundle at
# **build time**, not runtime — so the API URL has to be set here, not
# at `docker run`. The default points at the host port the API container
# publishes (the *browser* runs on the host, not inside Docker).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app/apps/web
RUN bun run build


# ── Stage 2: Runtime image ──
#
# `next.config.ts` has `output: 'standalone'` (added in Phase 1), so
# `next build` produces a self-contained `.next/standalone/` directory
# with the minimal node_modules the runtime needs. We don't have to
# `bun install` again here.
#
# Because the project sets `outputFileTracingRoot: path.join(__dirname,
# '../../')` (the monorepo root), the standalone output is structured as:
#   .next/standalone/
#     ├── apps/web/server.js     ← the entry point we run
#     ├── apps/web/.next/        ← server bundle
#     └── node_modules/          ← only the modules the server needs
FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Copy the standalone server (which already includes its node_modules)
# plus the static assets and the public folder Next.js doesn't bundle.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# The standalone server is a plain Node.js entry point — no Bun runtime
# needed. We could use `bun apps/web/server.js` too, but `node` is the
# Next.js team's official supported invocation.
CMD ["node", "apps/web/server.js"]
