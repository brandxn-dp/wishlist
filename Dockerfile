# ---- build the web app (platform-independent output, so build natively) ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: Node + Chromium in one image ----
FROM node:22-alpine
# Chromium reads pages from stores that build them with JavaScript or block simple requests.
# tini reaps Chromium's child processes, since Node runs as PID 1.
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont tini
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
