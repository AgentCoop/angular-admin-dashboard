# Dockerfile.dev
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps to avoid conflicts
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Expose port
EXPOSE 4200

# Start Angular dev server
CMD ["npm", "start"]