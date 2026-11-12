"""Store screenshots: one line from the homepage over a real screen of the app.

Usage:
  uv run --no-project --with pillow python scripts/store-screens.py <spec.json> <out-dir> [ios|play ...]

spec.json is a list of {"screen": "<capture.png>", "title": "...", "sub": "..." (optional), "name": "01-today"}.
Every entry is rendered for both stores:
  ios/   1320x2868, the 6.9" iPhone size App Store Connect asks for
  play/  1080x1920, inside Google Play's 2:1 limit (a 1080x2400 capture alone is over it)

The night is the app's own background (#060910) and the type is the app's Inter, so the frame
around the screen says nothing the screen does not.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / 'assets' / 'fonts'
NIGHT = (6, 9, 16)
TITLE = (236, 239, 245)
SUB = (150, 160, 182)
EDGE = (40, 46, 62)

SIZES = {'ios': (1320, 2868), 'play': (1080, 1920)}


def wrap(draw, text, font, width):
    words, lines, line = text.split(), [], ''
    for w in words:
        trial = f'{line} {w}'.strip()
        if draw.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    lines.append(line)
    if len(lines) == 2:  # balance two lines, so no word is left alone under a full one
        splits = [(' '.join(words[:i]), ' '.join(words[i:])) for i in range(1, len(words))]
        fits = [s for s in splits if max(draw.textlength(p, font=font) for p in s) <= width]
        if fits:
            lines = list(min(fits, key=lambda s: max(draw.textlength(p, font=font) for p in s)))
    return lines


def render(entry, size):
    W, H = size
    u = W / 1320  # one design unit, so both sizes keep the same proportions
    canvas = Image.new('RGB', size, NIGHT)
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(str(FONTS / 'Inter-SemiBold.ttf'), round(84 * u))
    sub_font = ImageFont.truetype(str(FONTS / 'Inter-Regular.ttf'), round(46 * u))
    margin = round(110 * u)
    y = round((200 if W / H < 0.5 else 130) * u)
    for line in wrap(draw, entry['title'], title_font, W - 2 * margin):
        draw.text((W / 2, y), line, font=title_font, fill=TITLE, anchor='ma')
        y += round(104 * u)
    if entry.get('sub'):
        y += round(14 * u)
        for line in wrap(draw, entry['sub'], sub_font, W - 2 * margin):
            draw.text((W / 2, y), line, font=sub_font, fill=SUB, anchor='ma')
            y += round(62 * u)
    y += round(70 * u)

    shot = Image.open(entry['screen']).convert('RGB')
    sw = round(W * 0.80)
    sh = round(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    radius = round(sw * 0.075)
    mask = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), radius, fill=255)
    x = (W - sw) // 2
    border = round(3 * u)
    draw.rounded_rectangle((x - border, y - border, x + sw + border - 1, y + sh + border - 1), radius + border,
                           fill=EDGE)
    canvas.paste(shot, (x, y), mask)
    return canvas


def main():
    spec, out = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2])
    base = Path(sys.argv[1]).parent
    stores = sys.argv[3:] or list(SIZES)  # iOS captures for `ios`, Android ones for `play`
    for store in stores:
        size = SIZES[store]
        (out / store).mkdir(parents=True, exist_ok=True)
        for entry in spec:
            entry = {**entry, 'screen': str(base / entry['screen'])}
            render(entry, size).save(out / store / f"{entry['name']}.png", optimize=True)
            print(out / store / f"{entry['name']}.png")


if __name__ == '__main__':
    main()
