#!/bin/bash

# E2E Test Runner for Seeker Device
# 
# Prerequisites:
# - Seeker device connected via USB
# - USB debugging enabled
# - estream-app installed on device
# - Local estream node running on port 5000

set -e

echo "========================================"
echo "eStream Seeker E2E Test Runner"
echo "========================================"
echo ""

# Check ADB connection
echo "Checking ADB connection..."
if ! command -v adb &> /dev/null; then
    echo "❌ ADB not found. Please install Android SDK Platform Tools."
    exit 1
fi

DEVICES=$(adb devices | grep -v "List" | grep "device" | wc -l)
if [ "$DEVICES" -eq 0 ]; then
    echo "❌ No device connected. Please connect Seeker via USB."
    exit 1
fi

echo "✅ Device connected"
echo ""

# Check if app is installed
echo "Checking if estream-app is installed..."
PACKAGE=$(adb shell pm list packages | grep "io.estream.app" || true)
if [ -z "$PACKAGE" ]; then
    echo "⚠️  estream-app not installed. Installing..."
    npm run android:build
    npm run android:install
else
    echo "✅ estream-app installed"
fi
echo ""

# Check if local node is running
echo "Checking if local estream node is running..."
if ! nc -z 127.0.0.1 5000 2>/dev/null; then
    echo "⚠️  Local estream node not running on port 5000"
    echo "   Please start the node with: cd estream && cargo run --bin estream-server"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Local estream node running"
fi
echo ""

# Setup port forwarding
echo "Setting up port forwarding..."
adb reverse tcp:5000 tcp:5000
echo "✅ Port 5000 forwarded"
echo ""

# Run tests
echo "Running E2E tests..."
echo "========================================"
echo ""

if [ -z "$1" ]; then
    # Run all E2E tests
    npm run test:e2e
else
    # Run specific test file
    npm run test:e2e -- "$1"
fi

echo ""
echo "========================================"
echo "E2E Tests Complete"
echo "========================================"

