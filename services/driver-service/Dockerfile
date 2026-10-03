FROM node:20-alpine

WORKDIR /app

# Install dependencies at /app/node_modules.
#
# This is required because both:
#   /app/shared/*
#   /app/services/driver-service/*
# use the same dependencies.
#
# Node can resolve /app/node_modules from both locations.
COPY services/driver-service/package*.json ./

RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY proto ./proto
COPY shared ./shared
COPY services/driver-service/src ./services/driver-service/src

WORKDIR /app/services/driver-service

ENV NODE_ENV=production

EXPOSE 3003 50053

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||3003)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/server.js"]