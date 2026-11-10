# google-gws-mcp tasks
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

CXX := "clang++"
CXXFLAGS := "-std=c++26 -Wall -Wextra -Wno-unused-parameter -Isrc -I../../slimr-cpp/include -I../../vendor/glaze/include -I../../vendor"
LDFLAGS := "-lcurl"

# List recipes
_:
    @just --list

# Run comprehensive test suite with AddressSanitizer and UndefinedBehaviorSanitizer
test:
    mkdir -p bin
    {{CXX}} {{CXXFLAGS}} -fsanitize=address,undefined -g tests/test_main.cpp {{LDFLAGS}} -o bin/test_runner
    ./bin/test_runner

# Build optimized release binary
build:
    mkdir -p dist ../../dist
    {{CXX}} {{CXXFLAGS}} -O3 -flto src/main.cpp {{LDFLAGS}} -o dist/google-gws-mcp
    cp dist/google-gws-mcp ../../dist/google-gws-mcp

# Clean build artifacts
clean:
    rm -rf bin dist *.o *.gch
