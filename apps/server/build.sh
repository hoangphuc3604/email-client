#!/usr/bin/env bash
# exit on error
set -o errexit

pip install --upgrade pip

# Install PyTorch CPU-only first to avoid CUDA dependencies
# This significantly reduces build time and size on Render (no GPU packages)
# Installing CPU-only version prevents downloading ~2GB of CUDA libraries
echo "Installing PyTorch CPU-only (this may take a few minutes)..."
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
# sentence-transformers will detect torch is already installed and skip CUDA packages
echo "Installing other dependencies..."
pip install -r requirements.txt
