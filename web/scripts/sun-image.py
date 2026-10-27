"""Make the site's sun from NASA's Solar Dynamics Observatory: a visible-light (HMI continuum)
picture of the whole disc, recoloured in the site's own warm, as the moon is drawn in the app's
moonlight.

Usage: uv run --no-project --with opencv-python-headless --with numpy python scripts/sun-image.py <hmi.jpg> <out.png>

Source: https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg (NASA imagery, free to
use with credit; the credit is on the page). The picture's orange is NASA's colouring; only its
light is kept: the brightness across the disc, which is the sun's real limb darkening. The disc is
cut out with an anti-aliased edge (which also drops NASA's caption in the corner), and the light
is mapped from a deep amber at the limb to the app's moonlight (#FFF6E1) at the centre.
"""
import sys

import cv2
import numpy as np

src, out = sys.argv[1], sys.argv[2]
img = cv2.imread(src).astype(np.float32) / 255
luma = img @ np.array([0.0722, 0.7152, 0.2126], np.float32)  # BGR weights

# The disc: everything brighter than the dark sky, as one circle.
mask = (luma > 0.08).astype(np.uint8)
n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
disc = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
cx, cy = centroids[disc]
r = np.sqrt(stats[disc, cv2.CC_STAT_AREA] / np.pi)

size = int(np.ceil(r)) * 2 + 4
x0, y0 = int(round(cx)) - size // 2, int(round(cy)) - size // 2
light = luma[y0 : y0 + size, x0 : x0 + size]
yy, xx = np.mgrid[:size, :size]
dist = np.hypot(xx - (cx - x0), yy - (cy - y0))
alpha = np.clip(r - dist + 0.5, 0, 1)  # one-pixel anti-aliased edge

# Light, 0 at the darkest limb to 1 at the centre.
inside = alpha > 0.99
lo, hi = np.percentile(light[inside], [0.5, 99.8])
t = np.clip((light - lo) / (hi - lo), 0, 1)

# Limb amber -> warm gold -> moonlight. BGR.
stops = np.array([[0.0, 30, 78, 168], [0.55, 96, 178, 236], [1.0, 225, 246, 255]], np.float32)
color = np.stack([np.interp(t, stops[:, 0], stops[:, c]) for c in (1, 2, 3)], -1)

rgba = np.dstack([color, alpha * 255]).clip(0, 255).astype(np.uint8)
cv2.imwrite(out, rgba)
print(f'disc r={r:.1f}px at ({cx:.0f},{cy:.0f}); limb..centre light {lo:.3f}..{hi:.3f}; wrote {size}px')
