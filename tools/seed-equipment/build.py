"""Turns equipments.csv into the seeded equipment catalogue.

The CSV's "Equipment Weights" column encodes four different things, and which
one it is decides how the gym screen lets you edit it:

  (empty)                        nothing to weigh           -> none
  "9 kg"                         the machine's own weight   -> base
  "7 kg, 15 kg, 20 kg"           the sizes you own          -> list
  "5 kg (Silver), 10 kg (Green)" sizes with a colour        -> list (labelled)
  "0 - 250 kg, 5 kg increments"  a stack                    -> range
  "Orange, Red, Blue"            band resistances           -> labels
"""
import csv, json, re, sys

CATEGORY_RULES = [
    # (category, [exact names]) — checked before the pattern rules below.
    ('cardio', [
        'Air Bike', 'Bike', 'Elliptical', 'Jacobs Ladder', 'Rowing Machine', 'SkiErg',
        'Stair Climber', 'Treadmill', 'VersaClimber', 'Jump Rope', 'Pool', 'Staircase',
    ]),
    ('free_weights', [
        'Dumbbells', 'Kettlebells', 'Medicine Ball', 'Weight Plates', 'Bumper Plates',
    ]),
    ('loaded_bars', [
        'Barbell', 'Axle Bar', 'Buffalo Bar', 'Cambered Bench Press Bar', 'Cambered Squat Bar',
        'EZ Bar', 'Marrs Bar', 'Open Trap Bar', 'Safety Squat Bar (SSB)', 'Strongman Log',
        'Swiss Bar', 'Trap Bar', 'Triceps Bar', 'Yoke', 'Smith Machine',
    ]),
    ('fixed_weight_bars', ['Fixed-Weight EZ Bar', 'Fixed-Weight Straight Bar']),
    ('bands_ropes', [
        'Long Resistance Bands', 'Short Resistance Band', 'Battle Ropes',
        'Suspension Trainer', 'Nordic Hamstring Curl Strap', 'Sled Pulling Belt/Harness',
        'Anchor Point For Resistance Band', 'Anchor Point For Suspension Trainer',
    ]),
    ('body_weights', [
        'Bodyweight Only', 'Another Human', 'Bed', 'Chair', 'Couch', 'Captain’s Chair',
        'Dip Bars', 'Straight Pull-Up Bar', 'Multi-Grip Pull-Up Bar', 'Gymnastics Rings',
        'Push-Up Handles', 'Ankle Weights', 'Weighted Vest', 'Dip/Pull-Up/Belt Squat Belt',
        'Neck Harness', 'Hand Gripper',
    ]),
    ('benches_racks', [
        'Adjustable Bench', 'Flat Bench', 'Decline Bench', 'Hip Thrust Bench',
        'Preacher Curl Bench', 'Seal Row Bench', 'Seated Bench', 'Nordic Hamstring Curl Bench',
        'Power Rack', 'Squat Stand', 'Flat Bench Press Station', 'Incline Bench Press Station',
        'Decline Bench Press Station', 'Seated Overhead Press Station', 'Roman Chair',
        'Glute Ham Developer', 'Sissy Squat Machine', 'Squat Box', 'Split Squat Roller Stand',
    ]),
    ('loaded_accessories', [
        'Farmer’s Handles', 'Fat Grip Attachments', 'T-Bell', 'Tib Bar Trainer',
        'Wrist Roller', 'Sled', 'Jammer', 'Slingshot',
    ]),
]

# Anything with a range is a stack: pin-loaded, or a cable machine.
CABLE_HINTS = ('Cable', 'Pulley', 'Crossover', 'Lat Pulldown', 'Functional Trainer')

ACCESSORY_HINTS = (
    'Attachment', 'Board', 'Block', 'Blocks', 'Wheel', 'Ball', 'Sliders', 'Rings',
    'Handles', 'Steps', 'Boxes', 'Strap', 'Harness', 'Bar', 'Grip',
)


def parse_weights(raw: str):
    raw = raw.strip()
    if not raw:
        return {'kind': 'none'}

    m = re.match(r'^([\d.]+)\s*-\s*([\d.]+)\s*kg,\s*([\d.]+)\s*kg increments$', raw)
    if m:
        return {'kind': 'range', 'minKg': float(m.group(1)), 'maxKg': float(m.group(2)),
                'incrementKg': float(m.group(3))}

    parts = [p.strip() for p in raw.split(',')]
    if all(re.match(r'^[\d.]+\s*kg', p) for p in parts):
        values = []
        for p in parts:
            mm = re.match(r'^([\d.]+)\s*kg(?:\s*\((.+)\))?$', p)
            entry = {'kg': float(mm.group(1))}
            if mm.group(2):
                entry['label'] = mm.group(2)
            values.append(entry)
        if len(values) == 1:
            return {'kind': 'base', 'baseKg': values[0]['kg']}
        return {'kind': 'list', 'values': values}

    # No numbers at all: band colours / resistances.
    return {'kind': 'labels', 'labels': parts}


def categorise(name: str, weights: dict) -> str:
    for category, names in CATEGORY_RULES:
        if name in names:
            return category
    if 'Pin-Loaded' in name or 'Pin Loaded' in name:
        return 'cable_machines' if any(h in name for h in CABLE_HINTS) else 'pin_loaded_machines'
    if 'Plate-Loaded' in name or 'Plate Loaded' in name:
        return 'plate_loaded_machines'
    if weights['kind'] == 'range':
        return 'cable_machines' if any(h in name for h in CABLE_HINTS) else 'pin_loaded_machines'
    if weights['kind'] == 'base':
        return 'plate_loaded_machines'
    if any(h in name for h in ACCESSORY_HINTS):
        return 'accessories_functional'
    return 'other'


# The weight kind is a property of the category, not of one row in the CSV:
# every loaded bar is edited as a list of bar weights even where the sheet
# happened to give only one. Coercing here keeps the gym screen to one editor
# per category instead of one per item.
KIND_BY_CATEGORY = {
    'free_weights': 'list', 'loaded_bars': 'list', 'fixed_weight_bars': 'list',
    'body_weights': 'list', 'bands_ropes': 'labels', 'loaded_accessories': 'base',
    'plate_loaded_machines': 'base', 'cable_machines': 'range',
    'pin_loaded_machines': 'range', 'benches_racks': 'none',
    'accessories_functional': 'none', 'cardio': 'none', 'other': 'none',
}


def coerce(item: dict) -> dict:
    want = KIND_BY_CATEGORY[item['category']]
    have = item['kind']
    if want == have:
        return item
    if want == 'list':
        if have == 'base':
            return {**item, 'kind': 'list', 'values': [{'kg': item['baseKg']}], 'baseKg': None}
        if have == 'none':
            return {**item, 'kind': 'list', 'values': []}
    if want == 'base' and have == 'none':
        return {**item, 'kind': 'base', 'baseKg': 0.0}
    if want == 'labels' and have == 'none':
        return {**item, 'kind': 'labels', 'labels': []}
    if want == 'none':
        return {'name': item['name'], 'category': item['category'], 'kind': 'none'}
    raise SystemExit(f"cannot coerce {item['name']}: {have} -> {want}")


# Which of the exercise catalogue's coarse equipment values this unlocks. The
# exercise rows say "barbell"/"cable"/"machine"; without this the 259-item gym
# list could not filter them at all.
def satisfies(item: dict) -> list:
    name, cat = item['name'], item['category']
    if cat in ('loaded_bars', 'fixed_weight_bars'):
        return ['e-z curl bar'] if 'EZ' in name else ['barbell']
    if cat == 'free_weights':
        if name == 'Dumbbells': return ['dumbbell']
        if name == 'Kettlebells': return ['kettlebells']
        if name == 'Medicine Ball': return ['medicine ball']
        return ['barbell']  # plates are only useful with a bar
    if cat == 'bands_ropes':
        return ['bands']
    if cat == 'cable_machines':
        return ['cable']
    if cat in ('pin_loaded_machines', 'plate_loaded_machines'):
        return ['machine']
    if name in ('Bosu Ball', 'Stability Ball'):
        return ['exercise ball']
    if cat == 'body_weights':
        return ['body only', 'none']
    return []


def main():
    rows = []
    with open('equipments.csv', encoding='utf-8-sig') as f:
        for r in csv.reader(f, delimiter=';'):
            if len(r) >= 5 and r[3].strip() and r[3].strip() != 'Equipment':
                rows.append((r[3].strip(), r[4].strip()))

    items = []
    for name, raw in rows:
        weights = parse_weights(raw)
        item = coerce({'name': name, 'category': categorise(name, weights), **weights})
        item['satisfies'] = satisfies(item)
        items.append({k: v for k, v in item.items() if v is not None})

    items.sort(key=lambda i: (i['category'], i['name']))
    with open('tools/seed-equipment/equipment.json', 'w', encoding='utf-8') as f:
        json.dump({'items': items}, f, ensure_ascii=False, indent=2)
        f.write('\n')
    for i in items:
        assert i['kind'] == KIND_BY_CATEGORY[i['category']], i
    print(f'{len(items)} items written')


if __name__ == '__main__':
    main()
