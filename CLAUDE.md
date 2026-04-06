# EDI Document Assistant — Claude Code Conventions

## Project Overview

AI-Powered EDI Document Understanding with Multi-Provider Support. Upload EDI documents (EDIFACT, XML, JSON, CSV), get instant human-readable explanations, ask follow-up questions, and compare documents side by side.

**Stack:** Bun + NestJS + Next.js (App Router) + LangChain.js + LangGraph + LangSmith + PostgreSQL + Prisma + MinIO + shadcn/ui + Tailwind CSS + TanStack Query

## Project Structure

```
edi-document-assistant/
├── apps/
│   ├── api/              # NestJS backend (TypeScript, Bun runtime)
│   │   ├── src/
│   │   │   ├── ai-providers/     # AiProviders entity, service, controller
│   │   │   ├── formats/          # Formats entity, service, controller
│   │   │   ├── documents/        # Documents entity, upload, service, controller
│   │   │   ├── processes/        # Processes entity, service
│   │   │   ├── analyses/         # Analyses entity, service, controller
│   │   │   ├── comparisons/      # Comparisons entity, service, controller
│   │   │   ├── messages/         # Messages entity, chat service, controller
│   │   │   ├── langchain/        # LangChain.js integration
│   │   │   ├── langgraph/        # LangGraph agent workflows
│   │   │   ├── streaming/        # SSE streaming endpoints
│   │   │   ├── storage/          # MinIO client wrapper
│   │   │   ├── search/           # Search across documents
│   │   │   ├── seed/             # Seed data service
│   │   │   ├── common/           # Code generator, shared utilities
│   │   │   ├── prisma/           # Prisma client module
│   │   │   └── main.ts           # NestJS app entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Database schema
│   │   │   └── migrations/       # Prisma migrations
│   │   ├── tests/                # Vitest tests
│   │   └── http/                 # VS Code REST Client .http files
│   └── web/              # Next.js App Router frontend
│       ├── app/                  # File-based routing
│       ├── components/           # shadcn/ui + custom components
│       ├── hooks/                # TanStack Query hooks
│       ├── types/                # TypeScript interfaces
│       └── lib/                  # Utilities
├── docker-compose.yml    # PostgreSQL + MinIO + API + Web
├── .env.example          # Environment variable template
└── package.json          # Root — Bun workspaces
```

## Conventions

### TypeScript / Backend (NestJS)

- Use Bun as package manager and runtime
- NestJS 11.x with TypeScript strict mode
- Prisma ORM for database access — auto-generated types, migrations
- Organize by domain: each entity gets its own NestJS module with controller, service, and DTOs
- Use UUID primary keys for all tables
- Auto-generate sequential codes (e.g., `DOC-2026-04-000001`) for human-readable identifiers
- Use `createdAt` / `updatedAt` timestamps on all tables
- REST API with SSE for streaming AI responses

### TypeScript / Frontend (Next.js)

- Next.js 15.x with App Router and Server Components
- shadcn/ui with Tailwind CSS v4 for styling
- TanStack Query for server state management and caching
- React Suspense for streaming AI responses via SSE

### AI Integration

- LangChain.js for all AI interactions — chains, prompts, output parsers
- LangGraph for multi-step agent workflows (Parse → Classify → Explain → Suggest)
- LangSmith for tracing and observability
- Multi-provider support: Anthropic Claude, OpenAI GPT, Google Gemini — switchable per request

### Database

- PostgreSQL 16 via Docker
- Prisma ORM for schema definition and migrations
- JSON/JSONB columns for flexible metadata (tags, models, results)
- Foreign keys with proper relationships

### Testing

- Vitest for both API and Web tests
- Mock external services (AI providers, MinIO) in tests

### Docker

- Docker Compose for local development: PostgreSQL + MinIO + API + Web
- MinIO for S3-compatible local object storage
- MinIO Console at http://localhost:9001

## Common Commands

### Backend (from `apps/api/`)

```bash
bun run start:dev         # Start API server in dev mode
bun run test              # Run tests
bunx prisma generate      # Generate Prisma client
bunx prisma migrate dev   # Run migrations
bunx prisma studio        # Open Prisma Studio
```

### Frontend (from `apps/web/`)

```bash
bun run dev               # Start Next.js dev server
bun run test              # Run tests
bun run build             # Production build
```

### Full Stack (from root)

```bash
bun run dev               # Start both API and Web in dev mode
bun run dc:up             # Start Docker services (PostgreSQL + MinIO)
bun run dc:down           # Stop Docker services
bun run db:migrate        # Run Prisma migrations
bun run db:seed           # Seed database
```
