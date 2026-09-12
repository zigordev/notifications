FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

FROM base AS deps-build
# HUSKY=0 and --ignore-scripts: the root `prepare` script installs git hooks
# and lives in scripts/, which this stage does not copy. Hooks are
# meaningless in an image anyway.
RUN HUSKY=0 npm ci --ignore-scripts

FROM deps-build AS build
COPY apps/api apps/api
RUN npm run build --workspace @notifications/api

FROM base AS deps-prod
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV OTEL_SERVICE_NAME=notifications-api
# apk upgrade pulls the latest Alpine security patches at build time rather
# than waiting on the upstream node:24-alpine tag to be rebuilt. The npm strip
# drops the bundled CLI (and its own separately-versioned dependencies) —
# this image only ever runs `node apps/api/dist/main.js`, so npm/npx/corepack
# are attack surface with no legitimate use here.
RUN apk upgrade --no-cache \
  && apk add --no-cache ca-certificates curl jq \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=deps-prod --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node apps/api/package.json ./apps/api/package.json
COPY --chown=node:node scripts/openbao-run.sh ./scripts/openbao-run.sh
RUN chmod +x ./scripts/openbao-run.sh
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]

FROM prod AS local

FROM deps-build AS dev
ENV NODE_ENV=development
ENV OTEL_SERVICE_NAME=notifications-api
RUN apk add --no-cache ca-certificates curl jq
COPY apps/api apps/api
COPY scripts/openbao-run.sh ./scripts/openbao-run.sh
RUN chmod +x ./scripts/openbao-run.sh
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["npm", "run", "start:dev"]
