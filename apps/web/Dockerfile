# Multi-stage Dockerfile for SnapType Web Dashboard
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY tsconfig.json ./

RUN npm ci
RUN npm run build:packages
RUN npm run build -w apps/web

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
