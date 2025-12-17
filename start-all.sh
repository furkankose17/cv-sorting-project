#!/bin/bash

# CV Sorting Application Startup Script

echo "🚀 Starting CV Sorting Application..."
echo ""

# Start ML Service
echo "1️⃣  Starting ML Service (port 8000)..."
cd python-ml-service
source venv/bin/activate
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/ml-service.log 2>&1 &
ML_PID=$!
echo "   ✓ ML Service started (PID: $ML_PID)"
cd ..

# Wait for ML service to initialize
sleep 5

# Start CAP Server
echo ""
echo "2️⃣  Starting CAP Server (port 4004)..."
nohup npm start > /tmp/cds-server.log 2>&1 &
CAP_PID=$!
echo "   ✓ CAP Server started (PID: $CAP_PID)"

# Wait for CAP server to initialize
sleep 8

# Check health
echo ""
echo "3️⃣  Checking services health..."
ML_STATUS=$(curl -s http://localhost:8000/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
CAP_STATUS=$(curl -s http://localhost:4004/ready | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

echo "   ML Service: $ML_STATUS"
echo "   CAP Server: $CAP_STATUS"

# Open browser
echo ""
echo "4️⃣  Opening application in browser..."
sleep 2
open "http://localhost:4004/cvmanagement/index.html"

echo ""
echo "✅ All services started!"
echo ""
echo "📊 Logs:"
echo "   ML Service: tail -f /tmp/ml-service.log"
echo "   CAP Server: tail -f /tmp/cds-server.log"
echo ""
echo "🛑 To stop all services:"
echo "   ./stop-all.sh"
echo ""
