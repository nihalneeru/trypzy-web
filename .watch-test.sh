#!/bin/bash
# Watch mode script that runs tests on file changes
# Usage: ./watch-test.sh

echo "🔍 Starting test watcher..."
echo "Press Ctrl+C to stop"
echo ""

# Run tests in watch mode
npm run test:watch

