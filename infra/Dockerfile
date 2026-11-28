FROM node:22-bookworm-slim AS base
WORKDIR /workspace
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci

FROM base AS api
COPY apps/api apps/api
RUN npm run build -w @logos/api
ENV HOST=0.0.0.0
USER node
CMD ["npm","start","-w","@logos/api"]

FROM base AS dashboard
ARG LOGOS_LOCAL_EMAIL_TEST=false
ARG NEXT_PUBLIC_PAIRING_ORIGIN
ENV LOGOS_LOCAL_EMAIL_TEST=$LOGOS_LOCAL_EMAIL_TEST
COPY apps/dashboard apps/dashboard
ENV API_ORIGIN=http://api:3001 NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @logos/dashboard
WORKDIR /workspace/apps/dashboard
USER node
CMD ["node","../../node_modules/next/dist/bin/next","start","--hostname","0.0.0.0"]
