#!/usr/bin/env bash
# Export one still for the site as public/images/<name>-<width>.avif and .webp (web/AGENTS.md).
#
#   export-photo.sh <source.png> <name> <width> [width ...]
#
# AVIF is 10-bit 4:2:0. At 8 bits the page's smooth, near-black shadows break into blocks that show
# on a bright screen in a dark room (measured on the Maghrib still's out-of-focus wall, 2026-11-06:
# 10-bit matched the source, 8-bit at any quality did not). 4:2:0 keeps it in AV1's Main profile,
# which every AVIF decoder reads. WebP, the fallback for a browser without AVIF, is 8-bit by nature
# and gets its gentlest settings.
set -euo pipefail

src=$1
name=$2
shift 2
out="$(dirname "$0")/../public/images"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for w in "$@"; do
  magick "$src" -filter Lanczos -resize "${w}x" -strip -colorspace sRGB "$tmp/$w.png"
  avifenc -d 10 -y 420 -q 70 -s 3 --ignore-exif --ignore-xmp "$tmp/$w.png" "$out/$name-$w.avif" > /dev/null
  magick "$tmp/$w.png" -quality 92 -define webp:method=6 -define webp:sns-strength=0 \
    -define webp:filter-strength=20 "$out/$name-$w.webp"
  echo "$name-$w $(magick identify -format %wx%h "$out/$name-$w.webp"): avif $(stat -c %s "$out/$name-$w.avif") B, webp $(stat -c %s "$out/$name-$w.webp") B"
done
