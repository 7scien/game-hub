from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
icons = root / "public" / "icons"
source = root / "work" / "duo-party-icon-source-1024.png"
image = Image.open(source).convert("RGB")

for filename, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
    image.resize((size, size), Image.Resampling.LANCZOS).save(icons / filename, optimize=True)

# Maskable icons need extra safe padding because launchers may crop them into circles.
maskable = Image.new("RGB", (512, 512), "#081333")
foreground = image.resize((410, 410), Image.Resampling.LANCZOS)
maskable.paste(foreground, (51, 51))
maskable.save(icons / "icon-maskable-512.png", optimize=True)
