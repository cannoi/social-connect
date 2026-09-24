FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ build-base sqlite-dev
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps || npm install --legacy-peer-deps
COPY . .
EXPOSE 8080
ENV PORT=8080
CMD ["npm", "start"]