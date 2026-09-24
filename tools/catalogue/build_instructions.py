"""Folds assets/markdown/<exercise id>.md into assets/instructions.json.

Metro cannot list a directory at runtime, so the how-tos ship as one JSON map,
imported lazily next to app_file.json and seeded into exercises.instructions.
Run after the markdown changes, then bump CATALOGUE_VERSION's suffix.
"""
import json
from pathlib import Path

assets = Path(__file__).resolve().parents[2] / 'apps/mobile/assets'
exercise_ids = {e['id'] for e in json.loads((assets / 'app_file.json').read_text())['exercises']}
out = {
    path.stem: path.read_text().strip()
    for path in sorted((assets / 'markdown').glob('*.md'))
    if path.stem in exercise_ids
}
(assets / 'instructions.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(f'{len(out)} exercises → {assets / "instructions.json"}')
