# ---- build stage: frontend bundle + server bundle ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# ---- runtime stage: production deps only ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 3001
CMD ["node", "dist-server/boot.js"]
