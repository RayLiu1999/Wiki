FROM node:22.17.0-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.16.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY astro.config.mjs tsconfig.json ./
COPY scripts/ ./scripts/
COPY public/ ./public/
COPY src/ ./src/
# Vite 8 的打包器 rolldown 使用 mimalloc，預設會預先提交大塊記憶體而不歸還，
# 讓建置峰值從約 0.9 GB 變成約 1.6 GB；關掉後 768 MB 的主機也能建置。
ENV MIMALLOC_ARENA_EAGER_COMMIT=0 MIMALLOC_PURGE_DELAY=0
RUN pnpm build

FROM nginx:1.30.5-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
