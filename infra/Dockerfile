FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:${PATH} \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

FROM base AS dependencies

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm prisma:generate \
  && pnpm --filter @mvp/shared build \
  && pnpm --filter @mvp/api build \
  && pnpm --filter @mvp/web build

FROM base AS runtime

ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node

FROM runtime AS api
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

FROM runtime AS worker
CMD ["node", "apps/api/dist/worker.js"]

FROM runtime AS web
EXPOSE 3000
CMD ["pnpm", "--filter", "@mvp/web", "start"]
