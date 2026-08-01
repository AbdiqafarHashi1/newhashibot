FROM node:20.20.2-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig*.json ./
COPY cloud ./cloud
ARG SERVICE=health
ARG BUILD_ID=unknown
ARG REVISION=unknown
RUN test -f "cloud/services/${SERVICE}/index.ts" && \
    npx esbuild "cloud/services/${SERVICE}/index.ts" --bundle --platform=node --format=esm --target=node20 --outfile=/out/service.mjs && \
    printf '{"service":"%s","build_id":"%s","revision":"%s"}\n' "$SERVICE" "$BUILD_ID" "$REVISION" > /out/build-metadata.json

FROM node:20.20.2-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
RUN groupadd --system --gid 10001 hashibot && useradd --system --uid 10001 --gid hashibot --no-create-home hashibot
COPY --from=build --chown=hashibot:hashibot /out /app
USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["node", "/app/service.mjs"]
