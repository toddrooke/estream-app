#!/bin/bash
# seeker-test.sh: Comprehensive Seeker device test runner
#
# Usage:
#   ./scripts/seeker-test.sh              # Full test (build + install + test)
#   ./scripts/seeker-test.sh --quick      # Skip build, just run tests
#   ./scripts/seeker-test.sh --build-only # Just build, don't run
#   ./scripts/seeker-test.sh --logs       # Just show device logs

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PACKAGE_NAME="io.estream.app"
APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
SCREENSHOTS_DIR="$PROJECT_DIR/screenshots/seeker-tests"
LOGS_DIR="$PROJECT_DIR/logs"

# Environment setup
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

# Create directories
mkdir -p "$SCREENSHOTS_DIR" "$LOGS_DIR"

echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   📱 eStream Seeker Test Runner                   ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# Parse arguments
QUICK_MODE=false
BUILD_ONLY=false
LOGS_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --quick|-q)
            QUICK_MODE=true
            shift
            ;;
        --build-only|-b)
            BUILD_ONLY=true
            shift
            ;;
        --logs|-l)
            LOGS_ONLY=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Function: Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
    
    # Check Java
    if ! command -v java &> /dev/null; then
        echo -e "${RED}  ✗ Java not found. Run: brew install openjdk@17${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ Java: $(java -version 2>&1 | head -1)${NC}"
    
    # Check ADB
    if ! command -v adb &> /dev/null; then
        echo -e "${RED}  ✗ ADB not found. Run: brew install --cask android-platform-tools${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ ADB: $(adb version | head -1)${NC}"
    
    # Check Node
    if ! command -v node &> /dev/null; then
        echo -e "${RED}  ✗ Node not found. Run: brew install node${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ Node: $(node --version)${NC}"
    
    echo ""
}

# Function: Check device connection
check_device() {
    echo -e "${YELLOW}📱 Checking Seeker device...${NC}"
    
    local devices=$(adb devices | grep -v "List" | grep "device$" | wc -l | tr -d ' ')
    
    if [ "$devices" -eq 0 ]; then
        echo -e "${RED}  ✗ No device connected${NC}"
        echo -e "${YELLOW}  Please connect your Seeker via USB and enable USB debugging${NC}"
        exit 1
    fi
    
    # Get device info
    local device_id=$(adb devices | grep "device$" | head -1 | awk '{print $1}')
    local model=$(adb -s "$device_id" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
    local android=$(adb -s "$device_id" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')
    local ip=$(adb -s "$device_id" shell ip addr show wlan0 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d/ -f1 | tr -d '\r')
    
    echo -e "${GREEN}  ✓ Device: $device_id${NC}"
    echo -e "${GREEN}  ✓ Model: $model${NC}"
    echo -e "${GREEN}  ✓ Android: $android${NC}"
    echo -e "${GREEN}  ✓ IP: ${ip:-'Not connected to WiFi'}${NC}"
    
    # Check if it's a Seeker
    if [[ "$model" == *"Seeker"* ]] || [[ "$model" == *"seeker"* ]]; then
        echo -e "${GREEN}  ✓ Device is Solana Seeker! 🎉${NC}"
    else
        echo -e "${YELLOW}  ⚠ Device may not be a Seeker (model: $model)${NC}"
    fi
    
    echo ""
    echo "$device_id"
}

# Function: Get Mac IP
get_mac_ip() {
    local ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
    echo "$ip"
}

# Function: Build the app
build_app() {
    echo -e "${YELLOW}🔨 Building Android app...${NC}"
    
    cd "$PROJECT_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}  Installing npm dependencies...${NC}"
        npm install
    fi
    
    # Set Android SDK path
    echo "sdk.dir=$ANDROID_HOME" > "$PROJECT_DIR/android/local.properties"
    
    cd "$PROJECT_DIR/android"
    
    echo -e "${BLUE}  Running Gradle build...${NC}"
    ./gradlew assembleDebug 2>&1 | tee "$LOGS_DIR/build.log" | tail -20
    
    if [ -f "$APK_PATH" ]; then
        local size=$(du -h "$APK_PATH" | awk '{print $1}')
        echo -e "${GREEN}  ✓ APK built: $size${NC}"
    else
        echo -e "${RED}  ✗ Build failed. Check $LOGS_DIR/build.log${NC}"
        exit 1
    fi
    
    echo ""
}

# Function: Install app on device
install_app() {
    local device_id="$1"
    
    echo -e "${YELLOW}📲 Installing app on device...${NC}"
    
    if [ ! -f "$APK_PATH" ]; then
        echo -e "${RED}  ✗ APK not found. Run build first.${NC}"
        exit 1
    fi
    
    adb -s "$device_id" install -r "$APK_PATH" 2>&1 | tail -3
    
    echo -e "${GREEN}  ✓ App installed${NC}"
    echo ""
}

# Function: Setup port forwarding
setup_ports() {
    local device_id="$1"
    local mac_ip="$2"
    
    echo -e "${YELLOW}🔌 Setting up port forwarding...${NC}"
    
    # Forward Metro bundler port
    adb -s "$device_id" reverse tcp:8081 tcp:8081 2>/dev/null || true
    echo -e "${GREEN}  ✓ Metro port (8081) forwarded${NC}"
    
    # Forward QUIC port
    adb -s "$device_id" reverse tcp:5000 tcp:5000 2>/dev/null || true
    echo -e "${GREEN}  ✓ QUIC port (5000) forwarded${NC}"
    
    # Forward estream node ports
    for port in 8081 8082 8083; do
        adb -s "$device_id" reverse tcp:$port tcp:$port 2>/dev/null || true
    done
    echo -e "${GREEN}  ✓ Node ports (8081-8083) forwarded${NC}"
    
    echo ""
}

# Function: Launch app
launch_app() {
    local device_id="$1"
    
    echo -e "${YELLOW}🚀 Launching app...${NC}"
    
    # Force stop first
    adb -s "$device_id" shell am force-stop "$PACKAGE_NAME" 2>/dev/null || true
    sleep 1
    
    # Launch main activity
    adb -s "$device_id" shell am start -n "$PACKAGE_NAME/.MainActivity" 2>/dev/null
    
    echo -e "${GREEN}  ✓ App launched${NC}"
    echo ""
}

# Function: Clear logs
clear_logs() {
    local device_id="$1"
    adb -s "$device_id" logcat -c 2>/dev/null || true
}

# Function: Capture logs
capture_logs() {
    local device_id="$1"
    local output_file="$2"
    
    adb -s "$device_id" logcat -d -s EstreamApp:V ReactNative:V ReactNativeJS:V > "$output_file" 2>/dev/null
}

# Function: Wait for test completion
wait_for_tests() {
    local device_id="$1"
    local timeout=120  # 2 minutes max
    local start_time=$(date +%s)
    
    echo -e "${YELLOW}⏳ Waiting for tests to complete...${NC}"
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -gt $timeout ]; then
            echo -e "${RED}  ✗ Timeout waiting for tests${NC}"
            return 1
        fi
        
        # Check for test completion marker in logs
        local log_check=$(adb -s "$device_id" logcat -d -s ReactNativeJS:V 2>/dev/null | grep -E "Test suite complete|screenshots saved" | tail -1)
        
        if [ -n "$log_check" ]; then
            echo -e "${GREEN}  ✓ Tests completed (${elapsed}s)${NC}"
            return 0
        fi
        
        # Show progress
        printf "\r  Running... ${elapsed}s"
        sleep 2
    done
}

# Function: Pull screenshots from device
pull_screenshots() {
    local device_id="$1"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    
    echo -e "${YELLOW}📸 Pulling screenshots...${NC}"
    
    # Get latest screenshots from camera roll
    local screenshots=$(adb -s "$device_id" shell ls -t /sdcard/DCIM/Camera/*.png 2>/dev/null | head -5)
    
    if [ -z "$screenshots" ]; then
        echo -e "${YELLOW}  ⚠ No screenshots found in camera roll${NC}"
        return
    fi
    
    local count=0
    for file in $screenshots; do
        file=$(echo "$file" | tr -d '\r')
        local basename=$(basename "$file")
        local dest="$SCREENSHOTS_DIR/seeker_${timestamp}_${count}.png"
        adb -s "$device_id" pull "$file" "$dest" 2>/dev/null
        ((count++))
    done
    
    echo -e "${GREEN}  ✓ Pulled $count screenshots to $SCREENSHOTS_DIR${NC}"
}

# Function: Parse and display test results
display_results() {
    local device_id="$1"
    
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   📊 Test Results                                 ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Capture full logs
    local log_file="$LOGS_DIR/test_$(date +%Y%m%d_%H%M%S).log"
    capture_logs "$device_id" "$log_file"
    
    # Parse results from logs
    local pass_count=$(grep -c "✓" "$log_file" 2>/dev/null || echo "0")
    local fail_count=$(grep -c "✗" "$log_file" 2>/dev/null || echo "0")
    local skip_count=$(grep -c "⊘" "$log_file" 2>/dev/null || echo "0")
    
    echo -e "  ${GREEN}Passed: $pass_count${NC}"
    echo -e "  ${RED}Failed: $fail_count${NC}"
    echo -e "  ${YELLOW}Skipped: $skip_count${NC}"
    echo ""
    
    # Show key test outcomes
    echo -e "${YELLOW}Key Results:${NC}"
    
    grep -E "(AsyncStorage|Key Generation|Signing|Verification|Seeker Detection|MWA Connect|MWA Sign)" "$log_file" | while read line; do
        if echo "$line" | grep -q "✓"; then
            echo -e "  ${GREEN}$line${NC}"
        elif echo "$line" | grep -q "✗"; then
            echo -e "  ${RED}$line${NC}"
        else
            echo -e "  ${YELLOW}$line${NC}"
        fi
    done
    
    echo ""
    echo -e "${BLUE}Full log saved to: $log_file${NC}"
}

# Function: Show live logs
show_logs() {
    local device_id="$1"
    
    echo -e "${YELLOW}📋 Showing device logs (Ctrl+C to stop)...${NC}"
    echo ""
    
    adb -s "$device_id" logcat -s EstreamApp:V ReactNative:V ReactNativeJS:V
}

# Main execution
main() {
    check_prerequisites
    
    # Get device
    local device_output=$(check_device)
    local device_id=$(echo "$device_output" | tail -1)
    
    # Logs only mode
    if [ "$LOGS_ONLY" = true ]; then
        show_logs "$device_id"
        exit 0
    fi
    
    local mac_ip=$(get_mac_ip)
    echo -e "${BLUE}Mac IP: $mac_ip${NC}"
    echo ""
    
    # Build if not quick mode
    if [ "$QUICK_MODE" = false ]; then
        build_app
        install_app "$device_id"
    fi
    
    # Exit if build-only
    if [ "$BUILD_ONLY" = true ]; then
        echo -e "${GREEN}✅ Build complete!${NC}"
        exit 0
    fi
    
    # Setup and run tests
    setup_ports "$device_id" "$mac_ip"
    clear_logs "$device_id"
    launch_app "$device_id"
    
    # Wait for tests
    echo -e "${YELLOW}Waiting 5 seconds for app to initialize...${NC}"
    sleep 5
    
    if wait_for_tests "$device_id"; then
        pull_screenshots "$device_id"
        display_results "$device_id"
        
        echo ""
        echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║   ✅ Seeker Test Complete!                        ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
    else
        display_results "$device_id"
        
        echo ""
        echo -e "${RED}╔═══════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║   ⚠️  Tests may have timed out                     ║${NC}"
        echo -e "${RED}╚═══════════════════════════════════════════════════╝${NC}"
    fi
}

# Run main
main "$@"

