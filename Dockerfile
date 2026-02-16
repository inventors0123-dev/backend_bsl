FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
