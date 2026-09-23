"""Turns the two Vecteezy anatomy SVGs into the region JSON the heatmap renders.

The art nests unnamed <path> elements inside named <g> groups, sometimes two
deep (`front-forearms` > `front-forearm-left` > paths). Each path is attributed
to its NEAREST named ancestor, so a wrapper group does not duplicate the
children it contains.

Source: Vecteezy (free licence — commercial use permitted with attribution).
Regenerate with: python3 tools/anatomy/build.py
"""
import json
import re
import xml.etree.ElementTree as ET

NS = '{http://www.w3.org/2000/svg}'
FILES = [('FRONT', 'muscleheatmap-front.svg'), ('BACK', 'muscleheatmap-back.svg')]

# The silhouette underneath the muscles. Drawn, but never lit.
BACKDROP = {'front-darker-area', 'front-gray-area', 'back-darker-area', 'back-grey-area'}



# --- bounds ------------------------------------------------------------------
# The artwork's own viewBox is a square canvas the figure sits inside with a lot
# of empty margin, so rendering it whole leaves the body tiny. Tightening the
# box to the ink needs the real extent of the path data, which is written with
# relative commands — a naive scan of the numbers gives nonsense.
#
# Curves are bounded by their control points rather than solved exactly: the
# result is never too small, only at most a few units too generous, which is all
# a viewBox needs. There are no arc (A/a) commands in this artwork; assert it.
TOKEN = re.compile(r'([MmLlHhVvCcSsQqTtAaZz])|(-?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)')
ARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7, 'Z': 0}


def path_points(d):
    """Every point the path passes through or is pulled towards, absolute."""
    tokens = [(m.group(1), m.group(2)) for m in TOKEN.finditer(d)]
    x = y = 0.0
    start = (0.0, 0.0)
    cmd = None
    i = 0
    while i < len(tokens):
        letter, number = tokens[i]
        if letter:
            cmd = letter
            i += 1
            if cmd in 'Zz':
                x, y = start
                yield (x, y)
                continue
        if cmd is None:
            raise ValueError('path data starts with a number')
        if cmd in 'Aa':
            raise ValueError('arc commands are not supported')
        n = ARGS[cmd.upper()]
        nums = []
        while len(nums) < n:
            if i >= len(tokens) or tokens[i][0]:
                raise ValueError(f'{cmd} wants {n} numbers, got {len(nums)}')
            nums.append(float(tokens[i][1]))
            i += 1
        rel = cmd.islower()
        if cmd.upper() == 'H':
            x = x + nums[0] if rel else nums[0]
            yield (x, y)
        elif cmd.upper() == 'V':
            y = y + nums[0] if rel else nums[0]
            yield (x, y)
        else:
            ox, oy = x, y
            for j in range(0, n, 2):
                px = ox + nums[j] if rel else nums[j]
                py = oy + nums[j + 1] if rel else nums[j + 1]
                yield (px, py)
            x, y = px, py
        if cmd.upper() == 'M':
            start = (x, y)
            # A second coordinate pair after M is an implicit L, per the spec.
            cmd = 'l' if rel else 'L'


def view_box(paths, pad=20.0):
    xs, ys = [], []
    for d in paths:
        for px, py in path_points(d):
            xs.append(px)
            ys.append(py)
    minx, maxx = min(xs) - pad, max(xs) + pad
    miny, maxy = min(ys) - pad, max(ys) + pad
    return f'{minx:.2f} {miny:.2f} {maxx - minx:.2f} {maxy - miny:.2f}'


def collect(node, view, inherited_id, out):
    for child in node:
        tag = child.tag.replace(NS, '')
        own = child.get('id') or inherited_id
        if tag == 'path' and child.get('d'):
            out.append({'region': own, 'view': view, 'path': child.get('d')})
        elif tag in ('g', 'svg'):
            collect(child, view, own, out)


def selfcheck():
    """Relative commands, implicit repeats and the implicit-L after M."""
    # 10,10 -> 20,10 (relative l) -> 20,30 (implicit repeat) -> back to start.
    assert view_box(['M10,10 l10,0 0,20 Z'], pad=0) == '10.00 10.00 10.00 20.00'
    # Cubic control points count towards the box; H/V move one axis only.
    assert view_box(['M0,0 C0,-5 10,15 10,0 H-5 V3'], pad=0) == '-5.00 -5.00 15.00 20.00'
    # The second pair after M is a lineto, not another moveto.
    assert view_box(['M0,0 5,40'], pad=0) == '0.00 0.00 5.00 40.00'


def main():
    selfcheck()
    regions = []
    for view, filename in FILES:
        root = ET.parse(filename).getroot()
        collect(root, view, root.get('id') or view.lower(), regions)

    # One entry per named region, holding every path that belongs to it.
    merged = {}
    for item in regions:
        key = (item['region'], item['view'])
        merged.setdefault(key, {'id': item['region'], 'view': item['view'], 'paths': []})
        merged[key]['paths'].append(item['path'])

    # Document order, NOT sorted by id: SVG paints back to front, and the two
    # backdrop silhouettes sit part-way up the stack. Sorting alphabetically
    # moved them over the glutes and hamstrings, which then never lit up.
    out = list(merged.values())
    for region in out:
        region['backdrop'] = region['id'] in BACKDROP

    # Front and back get their own box: the two figures are not the same
    # height in the source, and one shared box shrinks both to the larger.
    view_boxes = {
        view: view_box([d for r in out if r['view'] == view for d in r['paths']])
        for view, _ in FILES
    }

    with open('tools/anatomy/regions.json', 'w', encoding='utf-8') as f:
        json.dump({
            'source': 'Vecteezy — free licence, commercial use with attribution',
            'viewBoxes': view_boxes,
            'regions': out,
        }, f, indent=2)
        f.write('\n')

    for view, box in view_boxes.items():
        print(f'{view} viewBox: {box}')
    total = sum(len(r['paths']) for r in out)
    print(f'{len(out)} regions, {total} paths')
    for r in out:
        print(f"  {r['view']:5} {r['id']:30} {len(r['paths'])} path(s){' [backdrop]' if r['backdrop'] else ''}")


if __name__ == '__main__':
    main()
