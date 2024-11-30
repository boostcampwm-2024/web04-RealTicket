FROM node:20 AS build
WORKDIR /app
COPY package*.json ./ 
# Install dependencies
RUN npm install --legacy-peer-deps

COPY . .
ARG VITE_ENVIRONMENT
ARG VITE_API_URL

# Vite가 빌드 시점에 사용할 수 있도록 환경 변수 생성
RUN echo "VITE_ENVIRONMENT=${VITE_ENVIRONMENT}" >> .env && \
echo "VITE_API_URL=${VITE_API_URL}" >> .env

RUN npm run build

# Use nginx image for production stage
FROM nginx:stable-alpine 
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=build /app/dist/ .
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/conf.d/
EXPOSE 80

# Run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]