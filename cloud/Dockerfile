# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY cloud/worker ./cloud/worker
COPY supabase/functions/_shared ./supabase/functions/_shared
COPY src/lib ./src/lib
RUN ./node_modules/.bin/esbuild cloud/worker/index.ts --bundle --platform=node --format=esm --target=node24 --packages=external --outfile=worker.mjs
RUN npm prune --omit=dev --ignore-scripts
FROM node:24-bookworm-slim
WORKDIR /app
ARG REVISION=local
ENV HASHIBOT_REVISION=$REVISION HASHIBOT_WORKER_MODE=check LIVE_EXECUTION_ENABLED=false DELIVERY_ENABLED=false SCHEDULES_ENABLED=false
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/worker.mjs ./worker.mjs
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD HASHIBOT_WORKER_MODE=check node worker.mjs
CMD ["node","worker.mjs"]
