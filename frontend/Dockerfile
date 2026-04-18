FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm install

COPY . /app/
# Default image is LearnTogether Lite; use `docker build --build-arg BUILD_MODE=full` for Full.
ARG BUILD_MODE=lite
RUN npm run "build:${BUILD_MODE}"


FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

