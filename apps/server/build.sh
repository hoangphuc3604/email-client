#!/usr/bin/env bash
# exit on error
set -o errexit

pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt
