"""Make the emulator's capture read as the phone it emulates.

Usage: uv run --no-project --with opencv-python-headless --with numpy python scripts/finish-screen.py <raw.png> <out.png>

Capture on the `pixel` AVD (1080x2400) with the centred punch-hole cutout on
(`cmd overlay enable com.android.internal.display.cutout.emulation.emu01`), so Android draws a real
phone's status bar height, plus the demo-mode status bar (web/AGENTS.md, "Images").

1. The gesture handle is painted out: it sits on the tab bar's flat night (#060910), so the fill is
   exact, and in a still it reads as a stray white stroke.
2. The camera hole is drawn where the device reports it (emu01 cutout: centre 540,64, r 33), since a
   screencap leaves the cutout area as the app drew it.
"""
import sys
import cv2
import numpy as np

src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src)
H, W = im.shape[:2]
night = np.array([16, 9, 6], np.uint8)  # BGR of #060910
# Everything round the handle (above and below it, and either side) must be the flat night.
ring = np.concatenate([im[H - 60 : H - 44, 360:720].reshape(-1, 3), im[H - 22 : H - 12, 360:720].reshape(-1, 3),
                       im[H - 60 : H - 12, 360:390].reshape(-1, 3), im[H - 60 : H - 12, 690:720].reshape(-1, 3)])
assert (np.abs(ring.astype(int) - night).sum(1) <= 3).all(), 'the bar round the handle is not flat night'
im[H - 60 : H - 12, 360:720] = night

# The hole, drawn at 4x and reduced so its edge is antialiased like the glass around a real one.
S = 4
mask = np.zeros((200 * S, 200 * S), np.uint8)
cv2.circle(mask, (100 * S, 100 * S), 33 * S, 255, -1, lineType=cv2.LINE_AA)
mask = cv2.resize(mask, (200, 200), interpolation=cv2.INTER_AREA).astype(np.float32)[..., None] / 255
x0, y0 = 540 - 100, 64 - 100
y0c = max(0, y0)
patch = im[y0c : y0 + 200, x0 : x0 + 200].astype(np.float32)
m = mask[y0c - y0 :]
im[y0c : y0 + 200, x0 : x0 + 200] = (patch * (1 - m)).astype(np.uint8)
cv2.imwrite(out, im)
print(out)
