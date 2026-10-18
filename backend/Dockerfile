# syntax=docker/dockerfile:1
# Build context: backend/ (see ../docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Type-checks, then bundles src/ into dist/ together with the SQL migrations.
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/ready" >/dev/null || exit 1
# Migrations and the idempotent seed run inside server startup.
CMD ["node", "dist/server.js"]
