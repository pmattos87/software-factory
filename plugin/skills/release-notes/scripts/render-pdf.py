"""Render a band of a PDF page to PNG for a slide.

usage: python -I render-pdf.py <in.pdf> <out.png> [top=0.0] [bottom=1.0] [page=1]
top/bottom are fractions of the page height, e.g. 0 0.52 for a contrato's header and item table.
"""
import sys

import pymupdf

src, out = sys.argv[1], sys.argv[2]
top = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
bottom = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
page = int(sys.argv[5]) - 1 if len(sys.argv) > 5 else 0

p = pymupdf.open(src)[page]
r = p.rect
p.get_pixmap(dpi=200, clip=pymupdf.Rect(0, r.height * top, r.width, r.height * bottom)).save(out)
print(out)
