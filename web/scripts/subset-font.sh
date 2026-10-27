#!/usr/bin/env bash
# Cuts Inter 4.1.1 (variable: opsz + wght) down to what qamar360.com sets: Latin, Latin-1, the
# transliteration letters (ā ī ū, ḍ ḥ ṣ ṭ ẓ, ʾ ʿ), punctuation, and only the OpenType features the CSS
# uses (kerning, contextual alternates, 'case' for the uppercase markers, tabular figures). One
# file, preloaded, instead of fontsource's per-script subsets, which split "wuḍūʾ" across two files
# (no kerning between them) and strip 'case'. Re-run after the copy gains a letter outside this set.
# Needs fonttools + brotli (pip install fonttools brotli). Usage: scripts/subset-font.sh
set -eu
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
curl -sL https://registry.npmjs.org/inter-ui/-/inter-ui-4.1.1.tgz | tar -xz -C "$work"
pyftsubset "$work/package/variable/InterVariable.woff2" \
  --unicodes='U+0020-007E,U+00A0-00FF,U+0100-0101,U+0112-0113,U+012A-012B,U+014C-014D,U+0152-0153,U+016A-016B,U+0131,U+02BB-02BF,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0308,U+0323,U+0331,U+1E0C-1E0D,U+1E24-1E25,U+1E62-1E63,U+1E6C-1E6D,U+1E92-1E93,U+2009-200B,U+2010-2014,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+2044,U+2060,U+20AC,U+2122,U+2190-2193,U+2212,U+FEFF' \
  --layout-features='calt,case,ccmp,locl,kern,mark,mkmk,tnum,pnum' \
  --name-IDs='*' --flavor=woff2 --output-file=public/fonts/inter-4.1.1.woff2
cp "$work/package/LICENSE.txt" public/fonts/OFL.txt
rm -r "$work"
ls -l public/fonts
