FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/
COPY server/ ./server/
COPY public/ ./public/
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server/ ./server/
COPY src/sim/save-validation.ts ./src/sim/save-validation.ts
ENV NODE_ENV=production
ENV PORT=8090
USER node
EXPOSE 8090
CMD ["node", "server/index.ts"]
