# trading-backend/Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate the client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the backend source code
COPY . .

# Expose the API port
EXPOSE 3000

# Ensure schema is present in Cloud SQL before booting the API.
CMD ["sh", "-c", "npx prisma db push && npm run start"]