# Root Dockerfile for Cloud Build triggers that expect /workspace/Dockerfile
# This builds and runs the backend service from trading-backend/
FROM node:20-alpine

WORKDIR /app

# Install backend dependencies
COPY trading-backend/package*.json ./
RUN npm install

# Generate Prisma client
COPY trading-backend/prisma ./prisma/
RUN npx prisma generate

# Copy backend source
COPY trading-backend ./

EXPOSE 3000

CMD ["npm", "run", "start"]