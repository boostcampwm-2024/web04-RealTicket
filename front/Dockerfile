FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
# Install dependencies
RUN npm install --legacy-peer-deps

COPY . .

# API 프록싱 활성화
RUN echo "VITE_API_PROXYING=true" >> .env

RUN npm run build

# Use nginx image for production stage
FROM nginx:stable-alpine

WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=build /app/dist/ .

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/conf.d/
ARG API_SERVER_URL
# proxy_pass 주입
RUN sed -i 's|proxy_pass .*|proxy_pass '"${API_SERVER_URL}"';|g' /etc/nginx/conf.d/nginx.conf

EXPOSE 80

# Run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
