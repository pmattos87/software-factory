"""Render every page of a PDF into one contact-sheet PNG, to check a deck page by page.

usage: python -I contact-sheet.py <in.pdf> <out.png> [columns=3] [width=640]
Each page becomes a thumbnail `width` pixels wide, numbered in its corner, in a grid.
"""
import sys

import pymupdf

src, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
width = int(sys.argv[4]) if len(sys.argv) > 4 else 640
gap = 24

doc = pymupdf.open(src)
first = doc[0].rect
scale = width / first.width
height = int(first.height * scale)
rows = (len(doc) + cols - 1) // cols

sheet = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, cols * width + (cols + 1) * gap, rows * height + (rows + 1) * gap), False)
sheet.set_rect(sheet.irect, (200, 200, 200))
for i, page in enumerate(doc):
    thumb = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale))
    x = gap + (i % cols) * (width + gap)
    y = gap + (i // cols) * (height + gap)
    thumb.set_origin(x, y)
    sheet.copy(thumb, thumb.irect)
sheet.save(out)

# Page numbers, drawn on a copy as a PDF page so text rendering needs no extra library.
out_doc = pymupdf.open()
img_page = out_doc.new_page(width=sheet.width, height=sheet.height)
img_page.insert_image(img_page.rect, filename=out)
for i in range(len(doc)):
    x = gap + (i % cols) * (width + gap)
    y = gap + (i // cols) * (height + gap)
    img_page.draw_rect(pymupdf.Rect(x, y, x + 46, y + 30), color=None, fill=(0, 0, 0))
    img_page.insert_text((x + 8, y + 22), f"{i + 1:02d}", fontsize=18, color=(1, 1, 1))
img_page.get_pixmap().save(out)
print(f"{out}: {len(doc)} pages")
