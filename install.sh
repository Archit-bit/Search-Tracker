#!/usr/bin/env bash
set -e

echo "🔧 Search → GitHub Tracker installer"
echo ""

# Determine script directory (repo root)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/search-tracker-backend"

if [ ! -d "$BACKEND_DIR" ]; then
  echo "❌ Could not find backend directory at:"
  echo "   $BACKEND_DIR"
  echo "   Make sure you run this script from the repo root (where install.sh is)."
  exit 1
fi

# Check Node
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed or not in PATH."
  echo "   Please install Node.js (v18+) and run this script again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is not installed or not in PATH."
  echo "   Please install npm and run this script again."
  exit 1
fi

echo "✅ Node.js and npm detected."
echo ""

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install

echo ""
echo "✅ Backend dependencies installed."
echo ""

# Create .env if missing
ENV_FILE="$BACKEND_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  echo "ℹ️  .env already exists at:"
  echo "    $ENV_FILE"
else
  cat > "$ENV_FILE" <<EOF
# Backend configuration
PORT=4000

# Optional: GitHub Personal Access Token (classic)
# If left empty, searches will be logged but GitHub repos will not be fetched.
GITHUB_TOKEN=
EOF

  echo "✅ Created default .env at:"
  echo "    $ENV_FILE"
fi

cd "$ROOT_DIR"

echo ""
echo "🎉 Install complete!"
echo ""
echo "Next steps:"
echo "1) Start the backend:"
echo "   cd search-tracker-backend"
echo "   npm start"
echo ""
echo "2) In Firefox, load the extension:"
echo "   - Open: about:debugging#/runtime/this-firefox"
echo "   - Click: 'Load Temporary Add-on...'"
echo "   - Select: firefox-search-tracker-extension/manifest.json"
echo ""
echo "3) Open a new tab in Firefox and search for something"
echo "   (e.g. 'docker compose tutorial')."
echo ""
echo "4) Open http://localhost:4000 to see your tracked searches."
echo ""
echo "Happy hacking! 🚀"
