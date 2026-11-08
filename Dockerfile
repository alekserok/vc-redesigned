FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
COPY public ./public
EXPOSE 8810
CMD ["node","server.mjs"]
