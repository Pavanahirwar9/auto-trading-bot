# Root Dockerfile for Cloud Build triggers that expect /workspace/Dockerfile
# This builds and runs the backend service from trading-backend/
FROM node:20-alpine

WORKDIR /app

# Remove the trading-backend/ prefix since Cloud Build is now running *inside* this folder.

# Install backend dependencies
COPY package*.json ./
RUN npm install

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy backend source
COPY . ./

EXPOSE 3000

# Ensure schema is present in Cloud SQL before booting the API.
CMD ["sh", "-c", "npx prisma db push && npm run start"]