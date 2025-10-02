#!/bin/bash

# Install Playwright browsers if not already installed
echo "Installing Playwright browsers..."
npx playwright install chromium

# Start the server
echo "Starting server..."
node src/api/server.js
