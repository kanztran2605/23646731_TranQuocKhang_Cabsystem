FROM node:20-alpine

WORKDIR /app

COPY services/customer-service/package*.json ./services/customer-service/

RUN cd services/customer-service \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/customer-service/src ./services/customer-service/src

WORKDIR /app/services/customer-service

ENV NODE_ENV=production

EXPOSE 3002 50052

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||3002)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]