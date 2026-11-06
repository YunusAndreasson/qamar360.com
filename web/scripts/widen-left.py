"""Widen a photograph to the left over its own dark, out-of-focus edge, so a 2.39:1 crop can hold
the whole scene, from the sky in a window to the rug on the floor (the Maghrib still). The new strip
is made only from that dark edge (the columns before the light rises): reflected back and forth,
defocused, falling off toward the frame's edge as a lens does, with the edge's own grain, and
feathered in over a wide seam. Nothing is generated, and nothing from beyond the dark edge (a
doorway, a coat) can be copied out.

Usage: uv run --no-project --with opencv-python-headless --with numpy python scripts/widen-left.py <in.png> <out.png> <extra_px>
"""
import sys

import cv2
import numpy as np

src, dst, extra = sys.argv[1], sys.argv[2], int(sys.argv[3])
img = cv2.imread(src).astype(np.float32)
h, w, _ = img.shape
luma = img @ np.array([0.114, 0.587, 0.299], np.float32)
col = cv2.GaussianBlur(luma[int(h * 0.1) : int(h * 0.9)].mean(axis=0)[None, :], (0, 0), 6)[0]
base = col[:80].mean()
dark = int(np.argmax(col > max(base * 1.6, base + 6)))  # first column where the light rises
dark = max(dark - 40, 120)  # keep clear of the rise itself
seam = min(360, dark)
need = extra + seam
# Reflect the dark edge back and forth until it covers the strip and the seam.
idx = np.arange(need)
period = 2 * dark
idx = idx % period
idx = np.where(idx < dark, idx, period - 1 - idx)
strip = img[:, :dark][:, idx][:, ::-1]  # its right end meets the original's left edge
soft = cv2.GaussianBlur(strip, (0, 0), 18)
edge = img[:, :dark]
sd = (edge - cv2.GaussianBlur(edge, (0, 0), 2)).std(axis=(0, 1))
rng = np.random.default_rng(7)
grain = cv2.GaussianBlur(rng.normal(0, 1, soft.shape), (0, 0), 0.5) * sd * 1.15
x = np.linspace(0, 1, need)[None, :, None]
ext = soft * (0.72 + 0.28 * x) + grain
out = np.concatenate([ext[:, :extra], img], axis=1)
t = (np.linspace(0, 1, seam) ** 1.5)[None, :, None]
out[:, extra : extra + seam] = ext[:, extra:need] * (1 - t) + img[:, :seam] * t
cv2.imwrite(dst, np.clip(out + 0.5, 0, 255).astype(np.uint8))
print(f'{dst}: {w}x{h} -> {w + extra}x{h}; dark edge {dark}px, seam {seam}px')
