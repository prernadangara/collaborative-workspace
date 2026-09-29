FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# prisma.config.ts reads DATABASE_URL at load time; generate needs no real DB.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./

EXPOSE 5000
# Applies pending migrations, then starts API + socket server + worker.
CMD ["npm", "run", "start:prod"]
