"""Convert existing screenshot packs to the App Store 6.5-inch slot."""
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SIZE = "1242x2688"

for kind in ("highlights", "plain-screenshots"):
    source = ROOT / f"screenshots/gym-buddy-final-15-{kind}.zip"
    destination = ROOT / f"screenshots/gym-buddy-6.5-inch-15-{kind}.zip"
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        with zipfile.ZipFile(source) as original, zipfile.ZipFile(
            destination, "w", zipfile.ZIP_DEFLATED
        ) as output:
            images = [name for name in original.namelist() if name.endswith(".png")]
            assert len(images) == 15, f"Expected 15 screenshots in {source}"
            for index, name in enumerate(images):
                src = temp / f"source-{index}.png"
                dst = temp / f"output-{index}.png"
                src.write_bytes(original.read(name))
                background = subprocess.check_output(
                    ["magick", str(src), "-format", "%[pixel:p{0,0}]", "info:"],
                    text=True,
                ).strip()
                subprocess.run(
                    [
                        "magick", str(src), "-resize", SIZE,
                        "-background", background, "-gravity", "center",
                        "-extent", SIZE, "-alpha", "off",
                        "-define", "png:color-type=2", str(dst),
                    ],
                    check=True,
                )
                dimensions = subprocess.check_output(
                    ["magick", "identify", "-format", "%wx%h", str(dst)], text=True
                ).strip()
                assert dimensions == SIZE, dimensions
                output.writestr(Path(name).name, dst.read_bytes())
            readme = next(n for n in original.namelist() if n.endswith("README.txt"))
            notes = original.read(readme).decode()
            notes = notes.replace("1320 x 2868", "1242 x 2688")
            notes = notes.replace("6.9-inch", "6.5-inch")
            notes = notes.replace(
                "Images 01–10 retain the exact approved graphics, without re-rendering them.",
                "All graphics retain their approved designs, resized proportionally for the 6.5-inch slot.",
            )
            notes += "\nUPLOAD: Unzip this pack and select up to ten PNGs in the iPhone 6.5-inch Display slot.\n"
            output.writestr("README.txt", notes)
    with zipfile.ZipFile(destination) as verified:
        assert verified.testzip() is None
    print(f"Verified: {destination.relative_to(ROOT)} — 15 RGB PNGs at {SIZE}")