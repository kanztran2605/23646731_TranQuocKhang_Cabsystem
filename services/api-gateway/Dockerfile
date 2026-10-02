FROM node:20-alpine

WORKDIR /app

COPY services/api-gateway/package*.json ./services/api-gateway/

RUN cd services/api-gateway \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/api-gateway/src ./services/api-gateway/src

WORKDIR /app/services/api-gateway

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]