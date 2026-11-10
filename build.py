"""Build the hosted page from the game source.

cheek-pouch.html is the source (it is also what gets published on claude.ai,
which adds its own document wrapper). This wraps it as a complete page and
writes index.html for GitHub Pages or any static host.

Run: python3 build.py
"""
from pathlib import Path

ROOT = Path(__file__).parent
HEAD = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    '<meta name="description" content="An endless hamster arcade game driven by Squeektoshi\'s live wheel on Squeekchain.">'
    '<style>body{margin:0}img{max-width:100%}</style></head><body>\n'
)

source = (ROOT / "cheek-pouch.html").read_text(encoding="utf-8")
source = source.replace('<meta charset="utf-8">\n', "")
(ROOT / "index.html").write_text(HEAD + source + "\n</body></html>\n", encoding="utf-8")
print("wrote index.html")
