#!/usr/bin/env python3
"""Build the shipped font cuts in assets/fonts/ from pinned google/fonts variable sources.

Like gen-palette.mjs, this is a rarely-run generator whose OUTPUT is committed — the app
never builds fonts at install time. Run it only to change faces, weights, or subset ranges,
then re-run `npm run test` (font-contract.test.ts gates the result).

Pipeline per cut: download pinned variable TTF (sha256-verified) → instance the wght axis
to a static weight → subset to the app's character repertoire → write assets/fonts/<Name>.ttf.

Requires: Python 3.10+ with fontTools (`pip install fonttools`).
"""

from __future__ import annotations

import hashlib
import io
import sys
import urllib.request
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Pinned google/fonts commit — bump deliberately, hashes below must match.
PIN_COMMIT = "389b770410cc0b7c21c85673bfa2077420fe7f65"
RAW = f"https://raw.githubusercontent.com/google/fonts/{PIN_COMMIT}"

# source key -> (repo path, sha256)
SOURCES = {
    "Inter[opsz,wght].ttf": (
        "ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
        "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
    ),
}

# (source key, axis pins, output basename). Output name == the fontFamily the app uses
# (expo-font registers each file under its FontAssets key, which must equal this name).
# Inter replaced the Cormorant serif system 2026-07-18 same-day: the user rejected the serif
# on-device as unreadable — the target voice is product-grade UI sans (Linear/Notion). opsz
# is pinned to 14, the text-optical design (= the "Inter" everyone knows; Linear's choice) —
# display sizes get their fit from letterSpacing in theme.ts, not the opsz 32 display cuts.
CUTS = [
    ("Inter[opsz,wght].ttf", {"wght": 400, "opsz": 14}, "Inter-Regular"),
    ("Inter[opsz,wght].ttf", {"wght": 600, "opsz": 14}, "Inter-SemiBold"),
    ("Inter[opsz,wght].ttf", {"wght": 700, "opsz": 14}, "Inter-Bold"),
]

# Block-level ranges, not exact strings, so routine copy edits can't fall outside the subset:
# Basic Latin + Latin-1 + Extended A/B (° · × müsst-style européen text), modifier letters
# (ʾ U+02BE, ʿ U+02BF), combining marks (NFD input), Latin Extended Additional (ḥ ṣ ḍ ṭ +
# macron precomposed), general punctuation (– — … ' ' " "), minus, check (kept if present).
UNICODE_RANGES = [
    (0x0000, 0x024F),
    (0x02B9, 0x02BF),
    (0x0300, 0x036F),
    (0x1E00, 0x1EFF),
    (0x2000, 0x206F),
    (0x2212, 0x2212),
    (0x2713, 0x2713),
]

# Shaping + the figure features the app relies on: lnum/tnum back fontVariant
# ['lining-nums','tabular-nums'] on the display readout; onum keeps the almanac text figures.
LAYOUT_FEATURES = [
    "ccmp", "mark", "mkmk", "kern", "liga", "calt", "case", "locl",
    "lnum", "onum", "pnum", "tnum",
]

# A must-cover probe — the script fails loudly if a cut loses these (the jest contract
# test re-checks the committed files with the live repertoire).
PROBE = "ʿĀʾ ḥṣḍṭ ḤṢṬ āīū Alḥamdulillāh Ramaḍān 0123456789 ° · × – — … ''"

CACHE = Path.home() / ".cache" / "qamar360-fonts" / PIN_COMMIT
OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts"


def fetch(name: str) -> Path:
    repo_path, want_sha = SOURCES[name]
    dest = CACHE / name
    if not (dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == want_sha):
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"  downloading {name} …")
        with urllib.request.urlopen(f"{RAW}/{repo_path}") as r:
            data = r.read()
        got = hashlib.sha256(data).hexdigest()
        if got != want_sha:
            sys.exit(f"sha256 mismatch for {name}: got {got}, want {want_sha}")
        dest.write_bytes(data)
    return dest


def build(source: str, axes: dict[str, int], out_name: str) -> None:
    font = TTFont(fetch(source))
    try:
        instancer.instantiateVariableFont(font, axes, inplace=True, updateFontNames=True)
    except Exception:  # a source without a full STAT table — names are cosmetic for expo-font
        font = TTFont(fetch(source))
        instancer.instantiateVariableFont(font, axes, inplace=True)
    assert font["OS/2"].usWeightClass == axes["wght"], f"{out_name}: usWeightClass != {axes['wght']}"

    opts = Options()
    opts.name_IDs = ["*"]
    opts.layout_features = list(LAYOUT_FEATURES)
    opts.notdef_outline = True
    subsetter = Subsetter(options=opts)
    unicodes = [cp for lo, hi in UNICODE_RANGES for cp in range(lo, hi + 1)]
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)

    cmap = font.getBestCmap()
    missing = sorted({ch for ch in PROBE if ch != " " and ord(ch) not in cmap})
    if missing:
        sys.exit(f"{out_name}: probe glyphs missing after subset: {missing}")

    buf = io.BytesIO()
    font.save(buf)
    out = OUT / f"{out_name}.ttf"
    out.write_bytes(buf.getvalue())
    print(f"  {out.name}: {out.stat().st_size // 1024} KB, wght {axes['wght']}, {len(cmap)} codepoints")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"google/fonts @ {PIN_COMMIT[:12]}")
    for source, axes, out_name in CUTS:
        build(source, axes, out_name)


if __name__ == "__main__":
    main()
