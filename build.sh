#!/usr/bin/env bash
# exit on error
set -o errexit

# Install backend dependencies
cd backend
npm install

# Build frontend
cd ../frontend
npm install
npm run build

# Copy frontend build to backend public folder
mkdir -p ../backend/public
cp -r build/* ../backend/public/
