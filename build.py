"""Build the hosted page from the game source.

cheek-pouch.html is the source (it is also what gets published on claude.ai,
which adds its own document wrapper). This wraps it as a complete page and
writes index.html for GitHub Pages or any static host.

Run: python3 build.py
"""
from pathlib import Path

# The site's public address, e.g. "https://play.example.com/" (keep the
# trailing slash). Link previews on X, Discord and Telegram need the full
# address of the cover image, so set this once the domain is live and rebuild.
SITE_URL = "https://cheek-pouch.live/"

ROOT = Path(__file__).parent
TITLE = "Cheek Pouch"
DESCRIPTION = "An endless hamster arcade game run by a real hamster's wheel on Squeekchain."
COVER = SITE_URL + "art/cheek-pouch-cover.png"

HEAD = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{TITLE}</title>
<meta name="description" content="{DESCRIPTION}">
<meta name="squeekchain-project" content="430e9294-1c8e-4e18-aacc-e1dab9dd0462">
<link rel="icon" type="image/png" href="art/cheek-pouch-icon.png">
<link rel="apple-touch-icon" href="art/cheek-pouch-icon.png">
<meta property="og:type" content="website">
<meta property="og:title" content="{TITLE}">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:image" content="{COVER}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A crowned hamster with stuffed cheeks catching sunflower seeds at night">
{f'<meta property="og:url" content="{SITE_URL}">' if SITE_URL else ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{TITLE}">
<meta name="twitter:description" content="{DESCRIPTION}">
<meta name="twitter:image" content="{COVER}">
<style>body{{margin:0}}img{{max-width:100%}}</style></head><body>
"""

source = (ROOT / "cheek-pouch.html").read_text(encoding="utf-8")
# the head above carries the charset and title, so drop the source's copies
source = source.replace('<meta charset="utf-8">\n', "").replace("<title>Cheek Pouch</title>\n", "", 1)
(ROOT / "index.html").write_text(HEAD + source + "\n</body></html>\n", encoding="utf-8")
print("wrote index.html" + ("" if SITE_URL else " (set SITE_URL for full link previews)"))
