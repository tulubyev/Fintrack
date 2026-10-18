# syntax=docker/dockerfile:1
# API FinTrack (Express, бандл esbuild). Образ собирает GitHub Actions
# (.github/workflows/build-images.yml) и публикует в GHCR; на VPS ничего не собирается.

FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @workspace/api-server...
RUN pnpm --filter @workspace/api-server run build
# bcrypt, sharp и nodemailer вынесены из бандла (см. build.mjs) — в рантайме нужны prod-зависимости
RUN pnpm --filter @workspace/api-server deploy --legacy --prod /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DOCUMENTS_DIR=/data/documents \
    UPLOADS_DIR=/data/uploads
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/artifacts/api-server/dist ./dist
# SQL-миграции для dist/scripts/migrations-sql.mjs (docs/DEPLOY.md, «Миграции схемы»)
COPY --from=build /repo/lib/db/migrations ./migrations
# /data — именованный том: зашифрованные документы и фото профилей
RUN mkdir -p /data/documents /data/uploads && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
