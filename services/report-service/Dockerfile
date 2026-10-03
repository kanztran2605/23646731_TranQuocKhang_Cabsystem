FROM node:20-alpine

WORKDIR /app

COPY services/report-service/package*.json ./

RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/report-service/src ./services/report-service/src

WORKDIR /app/services/report-service

ENV NODE_ENV=production

EXPOSE 3009 50059

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||3009)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]