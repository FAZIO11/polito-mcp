# syntax=docker/dockerfile:1.7

# --- 1. install deps (with dev deps for build) ---
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
COPY apps/server/package.json ./apps/server/
RUN npm ci

# --- 2. build TypeScript ---
FROM deps AS build
WORKDIR /app
COPY apps ./apps
RUN npm run build --workspace apps/server

# --- 3. trim to production deps ---
FROM node:20-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
COPY apps/server/package.json ./apps/server/
RUN npm ci --omit=dev

# --- 4. runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini ca-certificates \
 && adduser -D -H -s /sbin/nologin app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY apps/server/package.json ./apps/server/package.json
COPY package.json ./package.json
RUN mkdir -p /data && chown app:app /data
USER app
EXPOSE 8080
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","apps/server/dist/index.js"]
