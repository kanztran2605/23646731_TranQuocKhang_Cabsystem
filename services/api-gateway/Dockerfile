FROM node:20-alpine

WORKDIR /app

# Install this component's dependencies at /app/node_modules.
#
# This location is intentional:
# both /app/shared/* and /app/services/api-gateway/*
# can resolve the same dependencies by Node's normal
# upward module-resolution algorithm.
COPY services/api-gateway/package*.json ./

RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/api-gateway/src ./services/api-gateway/src

WORKDIR /app/services/api-gateway

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.GATEWAY_PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]
