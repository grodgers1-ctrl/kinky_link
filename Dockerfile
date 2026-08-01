# linklight MCP server — Glama/self-host Dockerfile
# Build:   docker build -t linklight .
# Run:     docker run -p 3000:3000 \
#            -e NEXT_PUBLIC_SUPABASE_URL=... \
#            -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
#            -e SUPABASE_SERVICE_ROLE_KEY=... \
#            -e AUTH_SECRET=... \
#            -e AUTH_URL=http://localhost:3000 \
#            -e MCP_TEST_KEY=sk_ll_testkey ... \
#            linklight
# Probe:   curl http://localhost:3000/api/mcp   (GET returns {"status":"ok",...})

FROM node:22-alpine AS base
WORKDIR /app

# --- deps: full install (dev deps needed for build) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- builder ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined at build time; pass any needed as build args.
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
# Prune dev deps for a leaner image
RUN npm prune --omit=dev
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/mcp > /dev/null 2>&1 || exit 1
CMD ["npx", "next", "start"]
