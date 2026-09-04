from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

root = Path(r"d:\Code\PythonProject\boguanjia")
svg_path = root / "assets" / "icon.svg"
svg = svg_path.read_text(encoding="utf-8")

html = f"""<!DOCTYPE html><html><body style="margin:0;background:#000000">
{svg}
</body></html>"""

out_png = root / "assets" / "icon.png"
out_ico = root / "assets" / "icon.ico"
fav_dir = root / "desktop" / "public"

with sync_playwright() as p:
    browser = None
    for channel in ("msedge", "chrome", "chromium"):
        try:
            browser = p.chromium.launch(channel=channel) if channel != "chromium" else p.chromium.launch()
            print("using browser:", channel)
            break
        except Exception as e:
            print("skip", channel, e)
    if browser is None:
        raise RuntimeError("No browser available to render icon")
    page = browser.new_page(viewport={"width": 512, "height": 512}, device_scale_factor=1)
    page.set_content(html, wait_until="load")
    page.locator("svg").screenshot(path=str(out_png), omit_background=False)
    browser.close()

im = Image.open(out_png).convert("RGBA")
if im.size != (512, 512):
    im = im.resize((512, 512), Image.Resampling.LANCZOS)
im.save(out_png, "PNG")

sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
im.save(out_ico, format="ICO", sizes=sizes)

fav_dir.mkdir(parents=True, exist_ok=True)
(fav_dir / "favicon.svg").write_text(svg, encoding="utf-8")
im.save(fav_dir / "favicon.png", "PNG")
im.save(fav_dir / "favicon.ico", format="ICO", sizes=sizes)

print("wrote", out_png, out_png.stat().st_size)
print("wrote", out_ico, out_ico.stat().st_size)
print("updated desktop/public favicon.*")
