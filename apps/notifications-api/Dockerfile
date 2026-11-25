# syntax=docker/dockerfile:1.29

FROM node:26.13.1-alpine3.24 AS build
WORKDIR /repo
COPY package.json ./
RUN npm install --global --no-fund --no-audit --no-update-notifier "$(node -p "require('./package.json').packageManager.split('+')[0]")"
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm --filter "notifications-api^..." --if-present run build \
    && pnpm --filter notifications-api deploy --prod /out

FROM node:26.13.1-alpine3.24
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/src ./src
COPY --from=build /out/drizzle ./drizzle
COPY --from=build /out/flags.json ./flags.json
USER node
EXPOSE 3000
CMD ["node", "--import", "@zigordev/otel/register", "src/main.ts"]
