# Side-by-side before/after: qa/polish/compare-<size>.png
from PIL import Image, ImageDraw, ImageFont
import sys
for size in ["1440", "390"]:
    a = Image.open(f"qa/polish/before-{size}.png").convert("RGB"); b = Image.open(f"qa/polish/after-{size}.png").convert("RGB")
    pad = 40 if size == "1440" else 30
    out = Image.new("RGB", (a.width + b.width + 24, a.height + pad), (32, 26, 20))
    out.paste(a, (0, pad)); out.paste(b, (a.width + 24, pad))
    d = ImageDraw.Draw(out)
    try: f = ImageFont.truetype("arial.ttf", 22 if size == "1440" else 16)
    except Exception: f = None
    d.text((10, 8), "Before", fill=(240, 232, 218), font=f); d.text((a.width + 34, 8), "After", fill=(240, 232, 218), font=f)
    out.save(f"qa/polish/compare-{size}.png")
print("ok")
