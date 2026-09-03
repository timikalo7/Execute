"""Cut the BUILD column out of a contact sheet into one file per screen.

The sheet is written by contact-sheet.mjs as paired cells, reference left and build right. The
lateral-motion check needs the build's screens as separate images, and these constants must match
that writer or the slices come out cut across rows.
"""
import sys, os
from PIL import Image

cs = Image.open(sys.argv[1])
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
cellW, cellH, gap, label = 360, 225, 6, 14
row = cellH + gap + label
n = (cs.height - gap) // row
for i in range(n):
    y = gap + i * row + label
    cs.crop((gap * 2 + cellW, y, gap * 2 + cellW * 2, y + cellH)).resize((640, 400)).save(
        os.path.join(out, f"b{i:02d}.jpg"), quality=85)
print(n)
