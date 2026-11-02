# The API image. Built from the repository root, since the server bundles the
# shared domain package: docker build -f server/Dockerfile .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server
COPY packages/domain packages/domain
COPY server server
RUN npm run build -w server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --omit=dev
COPY --from=build /app/server/dist server/dist
USER node
CMD ["node", "server/dist/main.js"]
