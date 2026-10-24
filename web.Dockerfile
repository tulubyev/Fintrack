# syntax=docker/dockerfile:1
# Фронтенд FinTrack: веб-приложение (Vite) и публичный сайт (Astro) + nginx. Образ собирает GitHub Actions.

FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @workspace/fintrack... --filter @workspace/site...
RUN pnpm --filter @workspace/fintrack run build
# Публичный сайт (E1.8): статический HTML; раздаётся по имени хоста, когда включено разделение доменов (D21)
RUN pnpm --filter @workspace/site run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
# Скрипты /docker-entrypoint.d/ образ nginx запускает перед стартом: здесь — файлы App Links из окружения
COPY --chmod=755 deploy/40-app-links.sh /docker-entrypoint.d/40-app-links.sh
COPY --from=build /repo/artifacts/fintrack/dist/public /usr/share/nginx/html
COPY --from=build /repo/artifacts/site/dist /usr/share/nginx/site
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
