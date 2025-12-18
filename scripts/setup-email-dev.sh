#!/bin/bash
# Setup script for n8n email automation development environment

set -e

echo "🚀 Setting up n8n email automation development environment..."

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start services
echo "📦 Starting n8n and Mailhog containers..."
docker-compose up -d n8n mailhog

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Check n8n is ready
until curl -s http://localhost:5678/healthz > /dev/null 2>&1; do
    echo "  Waiting for n8n..."
    sleep 2
done

# Check Mailhog is ready
until curl -s http://localhost:8025 > /dev/null 2>&1; do
    echo "  Waiting for Mailhog..."
    sleep 2
done

echo ""
echo "✅ Services are ready!"
echo ""
echo "📧 Mailhog UI:     http://localhost:8025"
echo "🔧 n8n UI:         http://localhost:5678"
echo "   Username:       admin"
echo "   Password:       admin123"
echo ""
echo "Next steps:"
echo "1. Open n8n UI and import workflows from n8n-workflows/"
echo "2. Configure credentials in n8n (CAP Service, SMTP)"
echo "3. Activate workflows"
echo "4. Set ENABLE_WEBHOOKS=true in your .env file"
echo ""
