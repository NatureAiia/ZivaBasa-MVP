# ZivaBasa frontend — Vite/React SPA, built to static assets and served by nginx. Vite env
# vars (VITE_*) are compiled into the JS bundle at build time, not read at container startup,
# so they must be supplied as build args, not runtime `environment:` entries — see
# docker-compose.yml.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Defaults match this repo's own local-dev defaults (frontend/src/lib/api.js's DEFAULT_BASE,
# frontend/.env.example) so `docker compose up` with no .env still produces a working build —
# Supabase-backed features (auth) will just show AuthGate's "not configured" state instead of
# failing the build (see supabaseClient.js's graceful-degradation comment).
ARG VITE_API_BASE=http://localhost:8000
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
