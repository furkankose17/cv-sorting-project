#!/bin/bash

# CV Sorting Application Shutdown Script

echo "🛑 Stopping CV Sorting Application..."
echo ""

# Stop CAP Server
echo "1️⃣  Stopping CAP Server..."
lsof -ti:4004 | xargs kill -9 2>/dev/null
pkill -9 -f "cds watch" 2>/dev/null
echo "   ✓ CAP Server stopped"

# Stop ML Service
echo ""
echo "2️⃣  Stopping ML Service..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
pkill -9 -f "uvicorn" 2>/dev/null
echo "   ✓ ML Service stopped"

# Verify
echo ""
echo "3️⃣  Verifying all services stopped..."
if lsof -i :4004 >/dev/null 2>&1 || lsof -i :8000 >/dev/null 2>&1; then
    echo "   ⚠️  Some services may still be running"
else
    echo "   ✅ All services stopped successfully"
fi

echo ""
