# ── Stage 1: Build the NestJS API ──
#
# Build context = monorepo root (`.`) so we can copy `bun.lock` from the
# workspace root. The Dockerfile path in compose is `apps/api/Dockerfile`.
FROM oven/bun:1-slim AS builder

WORKDIR /app

# Prisma's default engine binary is built against OpenSSL. The slim Debian
# base image doesn't ship it, so install it before `prisma generate` runs.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy the workspace package files first so Docker can cache the
# dependency layer when only source files change.
#
# We have to copy *every* workspace package.json (not just apps/api/),
# otherwise `bun install --frozen-lockfile` thinks the workspace is
# inconsistent and refuses to install. Bun resolves the lockfile against
# the full set of workspace packages declared in the root package.json
# (`workspaces: ["apps/*"]`), so leaving any of them out makes the
# resolved lockfile drift from the committed one.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Install all dependencies (dev included — we need them for `nest build`
# and `prisma generate`). `--frozen-lockfile` ensures reproducible builds.
RUN bun install --frozen-lockfile

# Copy the rest of the API source. The root .dockerignore prevents
# node_modules / dist / .env from leaking in.
COPY apps/api/ apps/api/

# Generate the Prisma client into node_modules. The schema lives at
# apps/api/prisma/schema.prisma; bunx prisma reads it via the --schema flag.
RUN bunx prisma generate --schema=apps/api/prisma/schema.prisma

# Compile TypeScript -> dist/. The nest-cli.json `assets` config also
# copies seed/sample-documents/** into dist/seed/sample-documents/ so
# the seeder finds them at runtime via __dirname.
WORKDIR /app/apps/api
RUN bun run build


# ── Stage 2: Runtime image ──
#
# Smaller image with just the compiled output, the Prisma client, the
# schema (so `migrate deploy` can run on container start), and the
# transitive node_modules.
FROM oven/bun:1-slim AS runtime

WORKDIR /app/apps/api

# Prisma's runtime engine also needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy the production-relevant artifacts from the builder stage.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./package.json

ENV NODE_ENV=production
ENV API_PORT=3001
EXPOSE 3001

# `prisma migrate deploy` is the production-safe variant of `migrate dev`:
# - no schema drift detection
# - no interactive prompts
# - applies pending migrations idempotently
# Safe to run on every container start.
CMD ["sh", "-c", "bunx prisma migrate deploy --schema=prisma/schema.prisma && bun dist/main.js"]
