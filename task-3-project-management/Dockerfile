FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p /data && chown -R node:node /data /app
ENV HOST=0.0.0.0 PORT=3200 DB_PATH=/data/projects.sqlite COOKIE_SECURE=true
USER node
EXPOSE 3200
CMD ["npm", "start"]
