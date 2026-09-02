# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml .npmrc ./
COPY server/package.json server/tsconfig.json ./server/
COPY web/package.json web/tsconfig*.json web/vite.config.ts ./web/

RUN pnpm install --frozen-lockfile

COPY sql ./sql
COPY server/src ./server/src
COPY web/index.html ./web/
COPY web/public ./web/public
COPY web/src ./web/src

RUN pnpm build
RUN pnpm --filter @ghostslate/server deploy --prod --legacy /prod/server

FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN apk upgrade --no-cache \
 && apk add --no-cache ffmpeg \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --chown=node:node --from=builder /prod/server/node_modules ./server/node_modules
COPY --chown=node:node --from=builder /app/server/package.json ./server/package.json
COPY --chown=node:node --from=builder /app/server/dist ./server/dist
COPY --chown=node:node --from=builder /app/sql ./sql
COPY --chown=node:node --from=builder /app/web/dist ./web/dist
COPY --chown=node:node --from=builder /app/web/public ./web/public

EXPOSE 8080
USER node
CMD ["node", "server/dist/index.js"]
