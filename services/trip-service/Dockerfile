FROM node:20-alpine

WORKDIR /app

COPY services/trip-service/package*.json ./services/trip-service/

RUN cd services/trip-service \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/trip-service/src ./services/trip-service/src

WORKDIR /app/services/trip-service

ENV NODE_ENV=production

EXPOSE 3005 50055

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||3005)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]