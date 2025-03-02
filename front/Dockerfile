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
EXPOSE 80

# Run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
