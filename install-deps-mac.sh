#!/bin/bash
set -e
echo "Installing system dependencies for macOS..."
brew install pkg-config cairo pango jpeg giflib

echo "Checking for binding.gyp..."
BINDING_GYP="binding.gyp"
MODULE_NAME="sage"
SRC_FILE="src/sage.ts"

if [ ! -f "$BINDING_GYP" ]; then
    echo "Creating missing binding.gyp..."
    cat <<EOF > $BINDING_GYP
{
  "targets": [
    {
      "target_name": "$MODULE_NAME",
      "sources": ["$SRC_FILE"],
    }
  ]
}
EOF
    echo "binding.gyp created successfully."
