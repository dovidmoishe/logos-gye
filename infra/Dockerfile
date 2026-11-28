FROM node:22-bookworm-slim AS base
WORKDIR /workspace
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/

FROM base AS build
RUN npm ci

FROM build AS api-build
COPY apps/api apps/api
RUN npm run build -w @logos/api

FROM base AS api
ENV NODE_ENV=production HOST=0.0.0.0
RUN npm ci --omit=dev -w @logos/api && npm cache clean --force
COPY --from=api-build /workspace/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/data apps/api/data
USER node
CMD ["node","apps/api/dist/main.js"]

FROM build AS dashboard-build
ARG LOGOS_LOCAL_EMAIL_TEST=false
ARG NEXT_PUBLIC_PAIRING_ORIGIN
ENV LOGOS_LOCAL_EMAIL_TEST=$LOGOS_LOCAL_EMAIL_TEST API_ORIGIN=http://api:3001 NEXT_TELEMETRY_DISABLED=1
COPY apps/dashboard apps/dashboard
RUN npm run build -w @logos/dashboard

FROM node:22-bookworm-slim AS dashboard
WORKDIR /workspace
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=dashboard-build --chown=node:node /workspace/apps/dashboard/.next/standalone ./
COPY --from=dashboard-build --chown=node:node /workspace/apps/dashboard/.next/static apps/dashboard/.next/static
COPY --from=dashboard-build --chown=node:node /workspace/apps/dashboard/public apps/dashboard/public
USER node
CMD ["node","apps/dashboard/server.js"]
