FROM node:24-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/logger/package.json ./packages/logger/
COPY packages/jwt/package.json ./packages/jwt/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY services/cart/package.json ./services/cart/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/logger ./packages/logger
COPY packages/jwt ./packages/jwt
COPY packages/types ./packages/types
COPY packages/utils ./packages/utils
COPY services/cart ./services/cart

RUN npm run build -w @shop/logger \
  && npm run build -w @shop/jwt \
  && npm run build -w @shop/types \
  && npm run build -w @shop/utils \
  && npm run build -w @shop/cart

RUN npm prune --omit=dev


FROM node:24-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./

COPY --from=builder --chown=node:node /app/packages/logger/package.json ./packages/logger/
COPY --from=builder --chown=node:node /app/packages/logger/dist ./packages/logger/dist

COPY --from=builder --chown=node:node /app/packages/jwt/package.json ./packages/jwt/
COPY --from=builder --chown=node:node /app/packages/jwt/dist ./packages/jwt/dist

COPY --from=builder --chown=node:node /app/packages/types/package.json ./packages/types/
COPY --from=builder --chown=node:node /app/packages/types/dist ./packages/types/dist

COPY --from=builder --chown=node:node /app/packages/utils/package.json ./packages/utils/
COPY --from=builder --chown=node:node /app/packages/utils/dist ./packages/utils/dist

COPY --from=builder --chown=node:node /app/services/cart/package.json ./services/cart/
COPY --from=builder --chown=node:node /app/services/cart/dist ./services/cart/dist

USER node

EXPOSE 3002

CMD ["node", "services/cart/dist/index.js"]
