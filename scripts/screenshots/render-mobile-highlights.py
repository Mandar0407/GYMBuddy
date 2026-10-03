"""Create listing graphics from real, isolated Expo preview captures."""
from pathlib import Path
import subprocess
import tempfile
import zipfile
import struct

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "screenshots/gym-buddy-highlights"
OUTPUT = SOURCE / "listing-graphics"
OUTPUT.mkdir(parents=True, exist_ok=True)
FONT_DIR = ROOT / "artifacts/fitpulse-mobile/node_modules/@expo-google-fonts/dm-sans"
BOLD = FONT_DIR / "700Bold/DMSans_700Bold.ttf"
REGULAR = FONT_DIR / "400Regular/DMSans_400Regular.ttf"
DISPLAY = ROOT / "artifacts/fitpulse-mobile/assets/fonts/gym-buddy-display.ttf"
ICON = ROOT / "artifacts/fitpulse-mobile/assets/images/gym-buddy-icon.png"

SCREENS = [
    ("01-water-intake", "Build your\nhydration habit.", "Quick-add glasses. Follow your daily goal."),
    ("02-intermittent-fasting", "Your fast.\nYour rhythm.", "A real-time countdown for your chosen window."),
    ("03-barcode-nutrition", "Barcode to\nnutrition.", "Look up a product. Review your portion."),
    ("04-review-log-meal", "Log your meals.\nKnow your day.", "Record calories, protein, carbs and fat."),
    ("05-calories-and-macros", "Your macros.\nAt a glance.", "See what you’ve logged and what remains."),
    ("06-recipe-builder", "Make your\nrecipes repeatable.", "Build recipes from ingredients and servings."),
    ("07-favourite-meals", "Keep your\nfavourites close.", "Save regular meals and review repeat portions."),
    ("08-interval-timer", "Your workout.\nYour pace.", "Work and rest intervals. Pause when you need."),
    ("09-guided-workout", "Train with\na plan.", "Follow your routine. Log weights and reps."),
    ("10-exercise-alternatives", "A different move.\nMore options.", "Explore alternatives for your equipment."),
]

NOTES = """GYM Buddy — feature-focused screenshot collection

Each image is a portrait RGB PNG, 1320 x 2868 pixels, without transparency.
Apple lists this as an accepted 6.9-inch iPhone screenshot size:
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

IMPORTANT: These are actual Expo WEB-PREVIEW captures, not native iPhone or
iOS simulator screenshots. Native controls, spacing, sensor support and
camera interfaces may differ. Check them against your final iOS build before
submission; replace the captures with native ones wherever they differ.
Correct dimensions do not guarantee App Store approval.

The listing graphics add promotional headings around actual app captures;
the underlying UI is not redesigned or fabricated. The plain set contains
the same feature screens without these headings. Choose a maximum of ten
images for one App Store screenshot set, not both sets together.

All sample meals, water entries, recipes, routines and timers were created
in an isolated browser profile for this collection. Their example nutrition
values are illustrative, not verified food recommendations. The barcode
screen used a real Open Food Facts lookup (Nutella, barcode 3017620422003);
it shows typed barcode lookup, not a native camera scan.

No changes were made to the app UI, user journals or paired device data.
The overview image is for reviewing the collection, not an upload screenshot.
"""

def run(*args):
    subprocess.run(["magick", *map(str, args)], check=True)

with tempfile.TemporaryDirectory(prefix="gym-buddy-listing-") as temp:
    temp = Path(temp)
    for name, headline, subtitle in SCREENS:
        source = SOURCE / f"{name}.png"
        source_data = source.read_bytes()
        assert struct.unpack(">II", source_data[16:24]) == (1320, 2868)
        run(source, "-alpha", "off", "-define", "png:color-type=2", source)
        title = temp / "title.png"
        sub = temp / "subtitle.png"
        shot = temp / "shot.png"
        run("-background", "none", "-fill", "#27241f", "-font", BOLD,
            "-pointsize", "94", "-interline-spacing", "-6", "-size", "1160x244",
            f"caption:{headline}", title)
        run("-background", "none", "-fill", "#636258", "-font", REGULAR,
            "-pointsize", "38", "-size", "1136x116", f"caption:{subtitle}", sub)
        run(source, "-resize", "976x2121", "(", "-size", "976x2121", "xc:none",
            "-fill", "white", "-draw", "roundrectangle 0,0 975,2120 42,42", ")",
            "-alpha", "off", "-compose", "CopyOpacity", "-composite", shot)
        out = OUTPUT / f"{name}.png"
        run("-size", "1320x2868", "xc:#f5f1e5",
            "-fill", "#e9eedc", "-draw", "circle 1240,80 890,80",
            "(", ICON, "-resize", "64x64", ")", "-geometry", "+88+64", "-composite",
            "-fill", "#27241f", "-font", DISPLAY, "-pointsize", "42",
            "-draw", "text 170,113 'GYM Buddy'",
            title, "-geometry", "+88+168", "-composite",
            sub, "-geometry", "+92+436", "-composite",
            "-fill", "#28261f", "-draw", "roundrectangle 152,602 1168,2762 62,62",
            shot, "-geometry", "+172+622", "-composite",
            "-alpha", "off", "-define", "png:color-type=2", out)
        print(out.relative_to(ROOT))

(SOURCE / "README.txt").write_text(NOTES)
for directory, archive in [
    (OUTPUT, "gym-buddy-feature-highlights.zip"),
    (SOURCE, "gym-buddy-feature-plain-screenshots.zip"),
]:
    with zipfile.ZipFile(ROOT / "screenshots" / archive, "w", zipfile.ZIP_DEFLATED) as z:
        for name, _, _ in SCREENS:
            f = directory / f"{name}.png"
            data = f.read_bytes()
            assert struct.unpack(">II", data[16:24]) == (1320, 2868)
            assert data[25] == 2, "All deliverables must be RGB without alpha"
            z.write(f, f.name)
        z.writestr("README.txt", NOTES)

run("montage", "-font", REGULAR, *[OUTPUT / f"{name}.png" for name, _, _ in SCREENS],
    "-thumbnail", "264x574", "-tile", "5x2", "-geometry", "+12+12",
    "-background", "#eee8db", SOURCE / "listing-overview.jpg")
print("Verified ten listing graphics and ten plain captures; both ZIPs created.")