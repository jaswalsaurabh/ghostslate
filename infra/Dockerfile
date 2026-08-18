# syntax=docker/dockerfile:1
FROM node:24.19.0-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app

FROM base AS builder
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY .npmrc ./

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/tsconfig.base.json /app/.npmrc ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080
CMD ["node", "server/dist/index.js"]
