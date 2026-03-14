FROM node:22-alpine AS base

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN pnpm install --frozen-lockfile

FROM base AS frontend-builder

COPY packages/shared/ ./packages/shared/
COPY frontend/ ./frontend/
RUN pnpm --filter frontend build

FROM node:22-alpine

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
RUN pnpm install --frozen-lockfile --prod --filter backend

COPY packages/shared/src ./packages/shared/src
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
COPY --from=frontend-builder /workspace/frontend/dist ./backend/public

ENV NODE_ENV=production
WORKDIR /app/backend
EXPOSE 8000

CMD ["tsx", "src/index.ts"]
