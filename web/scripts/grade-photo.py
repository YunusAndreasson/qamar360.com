"""Grade a still into the app's palette, in CIE Lab.

Usage: uv run --no-project --with opencv-python-headless --with numpy python scripts/grade-photo.py <in.png> <out.png> [--clarity 0.25] [--warm 0.62] [--cool 0.78] [--lift 0]

- Night: the darkest tones are pulled to the app's night (#060910): its black point and its
  indigo hue, so a photograph's shadows are the page's own.
- Warm: practical light keeps its warmth but loses the sodium orange; warm chroma is compressed
  (more at high chroma) and its hue turned toward the app's moonglow (#F4EACB).
- Cool: skies lose the saturated royal navy and turn toward the night's indigo.
- Clarity: the generated look's crunchy local contrast is relaxed (large-radius detail scaled down).
- Highlights roll off softly instead of clipping.
"""
import sys

import cv2
import numpy as np


def opt(name, default):
    return float(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


src, dst = sys.argv[1], sys.argv[2]
clarity = opt('--clarity', 0.25)
warm_k = opt('--warm', 0.62)
cool_k = opt('--cool', 0.78)
lift = opt('--lift', 0.0)


def to_lab(rgb8):
    return cv2.cvtColor(rgb8.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)


NIGHT = to_lab(np.array([[[16, 9, 6]]], np.uint8))[0, 0]  # BGR of #060910
MOON = to_lab(np.array([[[0xCB, 0xEA, 0xF4]]], np.uint8))[0, 0]
night_hue = np.degrees(np.arctan2(NIGHT[2], NIGHT[1])) % 360
moon_hue = np.degrees(np.arctan2(MOON[2], MOON[1])) % 360

img = cv2.imread(src)
lab = to_lab(img)
L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]

# Clarity: scale the large-radius local contrast down.
if clarity > 0:
    sigma = img.shape[1] / 90
    base = cv2.GaussianBlur(L, (0, 0), sigma)
    L = base + (L - base) * (1 - clarity)

C = np.hypot(a, b)
h = np.degrees(np.arctan2(b, a)) % 360


def band(h, lo, hi, soft=20):
    """1 inside [lo, hi] degrees of hue, easing to 0 over `soft` degrees outside."""
    inside_lo = np.clip((h - (lo - soft)) / soft, 0, 1)
    inside_hi = np.clip(((hi + soft) - h) / soft, 0, 1)
    return np.minimum(inside_lo, inside_hi)


warm = band(h, 25, 95)
cool = band(h, 230, 320)

# Warm: compress chroma with a soft knee (low chroma barely touched), turn toward moonglow.
knee = 18.0
warm_scale = np.where(C > knee, (knee + (C - knee) * warm_k) / np.maximum(C, 1e-6), 1.0)
turn = np.clip((moon_hue - h), -14, 14) * 0.55
h = h + warm * turn
C = C * (1 - warm + warm * warm_scale)

# Cool: less chroma in the blues, hue toward the night's indigo.
C = C * (1 - cool * (1 - cool_k))
h = h + cool * np.clip(((night_hue - h + 180) % 360) - 180, -12, 12) * 0.5

a = C * np.cos(np.radians(h))
b = C * np.sin(np.radians(h))

# Night: the darkest tones take the night's own hue and chroma.
w = np.clip(1 - L / 14, 0, 1) ** 1.4 * 0.75
a = a * (1 - w) + NIGHT[1] * w
b = b * (1 - w) + NIGHT[2] * w

# Tone: black point to the night, a soft shoulder above L 82.
p = np.percentile(L, 0.4)
L = NIGHT[0] + (L - p) * (100 - NIGHT[0]) / (100 - p) + lift
hi = 82.0
L = np.where(L > hi, hi + (100 - hi) * np.tanh((L - hi) / (100 - hi)), L)
L = np.clip(L, 0, 100)

out = cv2.cvtColor(np.dstack([L, a, b]).astype(np.float32), cv2.COLOR_LAB2BGR)
cv2.imwrite(dst, np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))
print(f'{dst}: night hue {night_hue:.0f}, moon hue {moon_hue:.0f}, black point L {p:.1f} -> {NIGHT[0]:.1f}')
