#!/bin/bash
set -e

DIST="dist"
SAMPLE="sample"

echo "=== Parascope Canvas Build ==="

# clean
rm -rf "$DIST"
mkdir -p "$DIST/pretext"

# --- Masonry ---
echo "[build] masonry"
cd "$SAMPLE/masonry"
bun install --frozen-lockfile 2>/dev/null || bun install
bun build ./index.ts --outdir "../../$DIST/pretext/masonry" --minify
cd ../..
# copy HTML with .ts → .js replacement
sed 's|src="./index.ts"|src="./index.js"|g' "$SAMPLE/masonry/index.html" > "$DIST/pretext/masonry/index.html"

# --- Editorial Engine ---
echo "[build] editorial-engine"
cd "$SAMPLE/editorial-engine"
bun install --frozen-lockfile 2>/dev/null || bun install
bun build ./editorial-engine.ts --outdir "../../$DIST/pretext/editorial-engine" --minify
cd ../..
sed 's|src="./editorial-engine.ts"|src="./editorial-engine.js"|g' "$SAMPLE/editorial-engine/index.html" > "$DIST/pretext/editorial-engine/index.html"

# --- Fluid Smoke ---
echo "[build] fluid-smoke"
cd "$SAMPLE/fluid-smoke"
bun install --frozen-lockfile 2>/dev/null || bun install
bun build ./fluid-smoke.ts --outdir "../../$DIST/pretext/fluid-smoke" --minify
cd ../..
sed 's|src="./fluid-smoke.ts"|src="./fluid-smoke.js"|g' "$SAMPLE/fluid-smoke/index.html" > "$DIST/pretext/fluid-smoke/index.html"

# --- Index pages ---
echo "[build] index pages"
cp src/index.html "$DIST/index.html"
cp src/pretext/index.html "$DIST/pretext/index.html"

echo "=== Build complete → $DIST/ ==="
ls -R "$DIST"
