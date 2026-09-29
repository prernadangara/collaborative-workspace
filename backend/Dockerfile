FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

ENV DATABASE_URL="postgresql://workspace_user:workspace_password@localhost:5432/collaborative_workspace?schema=public"

RUN npx prisma generate
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]