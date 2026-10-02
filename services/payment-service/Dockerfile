FROM node:20-alpine

WORKDIR /app

COPY services/payment-service/package*.json ./services/payment-service/

RUN cd services/payment-service \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/payment-service/src ./services/payment-service/src

WORKDIR /app/services/payment-service

ENV NODE_ENV=production

EXPOSE 3006 50056

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||3006)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]