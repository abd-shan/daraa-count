FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
# The API prefix must stay same-origin: the session cookie is host-only and
# the backend enables no CORS. The container's own Nginx serves the static
# files and proxies /api, so the default relative prefix is correct.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build && test -s dist/index.html

# nginx:alpine runs as root only to bind port 80 and then drops to its worker
# user. The image carries no application dependencies and no build toolchain.
FROM nginx:stable-alpine AS runtime
# Replaces the stock default site; the app config is mounted or baked below.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY app.conf /etc/nginx/conf.d/count-daraa.conf
EXPOSE 80
