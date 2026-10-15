# syntax=docker/dockerfile:1
# Build context: frontend/ (see ../docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked in at build time. The browser calls the API directly, so the URL is the host-visible one.
ARG VITE_API_BASE_URL=http://localhost:3000/api/v1
ARG VITE_DEMO_API_KEY=
ENV VITE_DATA_SOURCE=api \
    VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_DEMO_API_KEY=${VITE_DEMO_API_KEY}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
