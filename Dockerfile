FROM node:20-alpine
WORKDIR /app
COPY . .
RUN cd server && npm install --production
EXPOSE 3001
CMD ["node", "server/index.js"]
