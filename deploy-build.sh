#!/bin/bash

# Deployment Build Script
# This script handles the build directory mismatch between vite output and server expectations

echo "Building application..."
npm run build

echo "Creating server/public directory if it doesn't exist..."
mkdir -p server/public

echo "Copying built files from dist/public to server/public..."
cp -r dist/public/* server/public/

echo "Build complete! Files are now available for production deployment."
echo "Health check endpoint available at: /health"