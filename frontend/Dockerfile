# syntax=docker/dockerfile:1
# Build context: frontend/ (see ../docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked in at build time. Default: same origin; nginx forwards /api/* to the API container.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_DEMO_API_KEY=
ENV VITE_DATA_SOURCE=api \
    VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_DEMO_API_KEY=${VITE_DEMO_API_KEY}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# Extra API origin the browser may call (CSP connect-src). Empty: the API is same-origin (/api).
ARG API_ORIGIN=
ENV API_ORIGIN=${API_ORIGIN}
# The image renders /etc/nginx/templates/*.template into conf.d at start (envsubst).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
