FROM node:24-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --omit=dev

COPY server.js ./

USER node

EXPOSE 4000

CMD ["node", "server.js"]
