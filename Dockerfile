# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV COREPACK_HOME=/root/.cache/node/corepack
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ai-core/package.json packages/ai-core/package.json
RUN --mount=type=cache,id=clara-pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .

ARG API_ORIGIN=http://api:4311
ENV API_ORIGIN=${API_ORIGIN}
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm build

FROM build AS api-package
RUN pnpm deploy --filter @clinicas/api --prod /out/api

FROM node:24-bookworm-slim AS api-runtime
LABEL org.opencontainers.image.source="https://github.com/hayax0/clara-clinicas"
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=api-package --chown=node:node /out/api ./
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /workspace/apps/api/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 4311

FROM node:24-bookworm-slim AS web-runtime
LABEL org.opencontainers.image.source="https://github.com/hayax0/clara-clinicas"
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4310
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
USER node
EXPOSE 4310
CMD ["node", "apps/web/server.js"]
