#!/bin/bash
set -e
echo "Installing system dependencies for Linux..."
sudo apt-get update
sudo apt-get install -y libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev \
                        build-essential g++ pkg-config python3 python3-pip
