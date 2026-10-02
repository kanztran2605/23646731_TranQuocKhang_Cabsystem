FROM node:20-alpine

WORKDIR /app

COPY services/auth-service/package*.json ./services/auth-service/

RUN cd services/auth-service \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/auth-service/src ./services/auth-service/src

WORKDIR /app/services/auth-service

ENV NODE_ENV=production

EXPOSE 3001 50051

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]