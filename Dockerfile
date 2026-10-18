# syntax=docker/dockerfile:1
FROM oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run typecheck && cd apps/web && bunx --bun vite build

FROM oven/bun:1.4.2 AS run
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data WEB_DIST=/app/apps/web/dist
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/runtime/package.json packages/runtime/
RUN bun install --frozen-lockfile --production
COPY packages packages
COPY apps/server apps/server
COPY --from=build /app/apps/web/dist apps/web/dist
VOLUME /data
EXPOSE 8787
CMD ["bun", "apps/server/src/index.ts"]
