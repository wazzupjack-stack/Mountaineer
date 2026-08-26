# Build context is the repo root (see docker-compose.yml) so this image
# can include both the backend source and the sibling public/ client.
FROM node:20-slim

WORKDIR /app

COPY backend/package.json ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY backend/migrations ./migrations
COPY public ./public

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]
