# Stage 1: Build the Vite React application
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first for efficient caching
COPY package*.json ./
RUN npm ci

# Copy the rest of the application files and build
COPY . .

# Accept Supabase and Portal environment variables at build-time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_PORTAL_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_PORTAL_URL=$VITE_PORTAL_URL

# Accept Git Commit SHA, Branch, and Version at build-time
ARG VITE_GIT_SHA
ARG VITE_GIT_BRANCH
ARG VITE_APP_VERSION
ENV VITE_GIT_SHA=$VITE_GIT_SHA
ENV VITE_GIT_BRANCH=$VITE_GIT_BRANCH
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build

# Stage 2: Serve static files with gostatic
FROM pierrezemb/gostatic
COPY --from=build /app/dist /srv/http/
CMD ["-port", "8080", "-https-promote", "-enable-logging", "-fallback", "index.html"]
