FROM node:24-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/events/package.json ./packages/events/
COPY packages/logger/package.json ./packages/logger/
COPY packages/jwt/package.json ./packages/jwt/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY services/payment/package.json ./services/payment/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/events ./packages/events
COPY packages/logger ./packages/logger
COPY packages/jwt ./packages/jwt
COPY packages/types ./packages/types
COPY packages/utils ./packages/utils
COPY services/payment ./services/payment

RUN npm run build -w @shop/events \
  && npm run build -w @shop/logger \
  && npm run build -w @shop/jwt \
  && npm run build -w @shop/types \
  && npm run build -w @shop/utils \
  && npm run build -w @shop/payment

RUN npm prune --omit=dev


FROM node:24-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./

COPY --from=builder --chown=node:node /app/packages/events/package.json ./packages/events/
COPY --from=builder --chown=node:node /app/packages/events/dist ./packages/events/dist

COPY --from=builder --chown=node:node /app/packages/logger/package.json ./packages/logger/
COPY --from=builder --chown=node:node /app/packages/logger/dist ./packages/logger/dist

COPY --from=builder --chown=node:node /app/packages/jwt/package.json ./packages/jwt/
COPY --from=builder --chown=node:node /app/packages/jwt/dist ./packages/jwt/dist

COPY --from=builder --chown=node:node /app/packages/types/package.json ./packages/types/
COPY --from=builder --chown=node:node /app/packages/types/dist ./packages/types/dist

COPY --from=builder --chown=node:node /app/packages/utils/package.json ./packages/utils/
COPY --from=builder --chown=node:node /app/packages/utils/dist ./packages/utils/dist

COPY --from=builder --chown=node:node /app/services/payment/package.json ./services/payment/
COPY --from=builder --chown=node:node /app/services/payment/dist ./services/payment/dist

USER node

EXPOSE 3004

#  required because otel was initially designed around commonjs.
#  we use esm here and we need to use this flag for kafka autoinstrumentation to work properly
# read more about it here: https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md
# node prints an ExperimentalWarning for this flag on startup, thats expected. the suggested example has also been deprecated
CMD ["node","--experimental-loader=@opentelemetry/instrumentation/hook.mjs", "services/payment/dist/index.js"]
