FROM node:20-alpine

WORKDIR /app

COPY services/booking-service/package*.json ./

RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/booking-service/src ./services/booking-service/src

WORKDIR /app/services/booking-service

ENV NODE_ENV=production

EXPOSE 3004 50054

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||3004)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]