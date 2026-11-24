FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server.ts ./
COPY apps ./apps
COPY packages ./packages
COPY database ./database

RUN npm run build:api

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist-api ./dist-api

EXPOSE 8080
CMD ["npm", "run", "start:api"]
