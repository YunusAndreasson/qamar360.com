#!/usr/bin/env bash
# Regenerate the app's PNG icon assets from the source SVGs in assets/logo.
# Requires rsvg-convert (librsvg) and ImageMagick (convert). Run from repo root:
#   bash scripts/gen-icons.sh
set -euo pipefail

LOGO="assets/logo"
IMG="assets/images"
# The brand night-sky black — the same value as the splash's dark background, the adaptive icon's
# background colour and `Colors.dark.background` (theme-contract.test.ts pins the last two), so the
# home-screen icon, the splash and the first frame of the app are one continuous colour.
BG="#060910"

# App icon (iOS light appearance) — flattened onto the brand black (iOS icons must have no alpha).
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-icon.svg" \
  | convert - -background "$BG" -flatten -alpha off "PNG24:$IMG/icon.png"

# iOS dark and tinted appearances — the bare white mark on transparent, at the light icon's exact
# size and place. iOS draws its own dark backdrop under the dark one, and tints the tinted one by
# luminance, so a single white-on-transparent mark serves both.
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-mark.svg" -o "$IMG/icon-mark.png"

# Splash marks — white for the dark splash, night-12 for the light one.
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-mark.svg" -o "$IMG/splash-icon.png"
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-mark-dark.svg" -o "$IMG/splash-icon-light.png"

# Android adaptive foreground and themed (monochrome) layers — the mark scaled into the layer's
# safe zone. Not a copy of the splash mark: the splash shows the mark at full size, and an adaptive
# layer at full size loses the Q's tail to every circular launcher mask. The background is
# `adaptiveIcon.backgroundColor` in app.json — a flat colour needs no image.
rsvg-convert -w 1024 -h 1024 "$LOGO/qamar-adaptive.svg" -o "$IMG/android-icon-foreground.png"
cp "$IMG/android-icon-foreground.png" "$IMG/android-icon-monochrome.png"

# Status-bar notification icon (expo-notifications plugin). Android reads only the alpha
# channel and tints it with the plugin's `color`; docs want a 96×96 all-white transparent PNG —
# which qamar-mono already is. Unscaled: a status-bar glyph has no mask to clear.
rsvg-convert -w 96 -h 96 "$LOGO/qamar-mono.svg" -o "$IMG/notification-icon.png"

echo "Regenerated icons in $IMG"

# Moon phases attached to lunar update notifications on iOS — drawn from the app's own phase
# geometry rather than the logo SVGs, so they live in their own generator.
node scripts/gen-moons.mjs
