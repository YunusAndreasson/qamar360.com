#!/usr/bin/env bash
# Regenerate the app's PNG icon assets from the source SVGs in assets/logo.
# Requires rsvg-convert (librsvg) and ImageMagick (convert). Run from repo root:
#   bash scripts/gen-icons.sh
set -euo pipefail

LOGO="assets/logo"
IMG="assets/images"
BG="#10131B"

# App icon — flattened onto the brand black (iOS icons must have no alpha).
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-icon.svg" \
  | convert - -background "$BG" -flatten -alpha off "PNG24:$IMG/icon.png"

# Transparent mark → splash + Android adaptive foreground.
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-mark.svg" -o "$IMG/splash-icon.png"
cp "$IMG/splash-icon.png" "$IMG/android-icon-foreground.png"

# Single-color silhouette → Android themed (monochrome) icon.
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-mono.svg" -o "$IMG/android-icon-monochrome.png"

# Status-bar notification icon (expo-notifications plugin). Android reads only the alpha
# channel and tints it with the plugin's `color`; docs want a 96×96 all-white transparent PNG —
# which qamar-mono already is.
rsvg-convert -w 96 -h 96 "$LOGO/qamar-mono.svg" -o "$IMG/notification-icon.png"

# Adaptive background — flat brand black.
convert -size 1024x1024 "xc:$BG" "$IMG/android-icon-background.png"

# Web favicon — flattened, small.
rsvg-convert -w 48 -h 48 "$LOGO/qamar-icon.svg" \
  | convert - -background "$BG" -flatten -alpha off "PNG24:$IMG/favicon.png"

echo "Regenerated icons in $IMG"
