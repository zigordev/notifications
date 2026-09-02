FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

FROM base AS deps
# HUSKY=0 and --ignore-scripts: the root `prepare` script installs git hooks
# and lives in scripts/, which this stage does not copy. Hooks are
# meaningless in an image anyway.
RUN HUSKY=0 npm ci --ignore-scripts

FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace @notifications/api

FROM base AS prod-deps
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV OTEL_SERVICE_NAME=notifications-api
RUN apk add --no-cache ca-certificates curl jq tini
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node apps/api/package.json ./apps/api/package.json
COPY --chown=node:node scripts/openbao-run.sh ./scripts/openbao-run.sh
RUN chmod +x ./scripts/openbao-run.sh
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=4 \
  CMD curl -fsS http://127.0.0.1:8080/health/readiness >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]

FROM prod AS local
