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
    # Bands & ropes is exactly these three: the anchors, straps and harnesses
    # that go with them are accessories, not the resistance itself.
    ('bands_ropes', ['Long Resistance Bands', 'Short Resistance Band', 'Battle Ropes']),
    # Body weight is exactly these two: things you strap on to make bodyweight
    # work heavier. The bars and rings you hang off are accessories; a belt or a
    # harness you hang plates from is a loaded accessory.
    ('body_weights', ['Ankle Weights', 'Weighted Vest']),
    ('other', [
        'Another Human', 'Bed', 'Chair', 'Couch', 'Furniture Sliders',
        'Sissy Squat Machine', 'Bodyweight Only', 'Captain’s Chair',
    ]),
    ('benches_racks', [
        'Adjustable Bench', 'Flat Bench', 'Decline Bench', 'Hip Thrust Bench',
        'Preacher Curl Bench', 'Seal Row Bench', 'Seated Bench', 'Nordic Hamstring Curl Bench',
        'Power Rack', 'Squat Stand', 'Flat Bench Press Station', 'Incline Bench Press Station',
        'Decline Bench Press Station', 'Seated Overhead Press Station', 'Roman Chair',
        'Glute Ham Developer', 'Sissy Squat Machine', 'Squat Box', 'Split Squat Roller Stand',
    ]),
    # Loaded accessories is exactly these: things you hang or clamp plates onto.
    ('loaded_accessories', [
        'Dip/Pull-Up/Belt Squat Belt', 'Farmer’s Handles', 'Fat Grip Attachments',
        'Neck Harness', 'Plate-Loaded Wrist Bar', 'T-Bell', 'Tib Bar Trainer',
        'Wrist Roller',
    ]),
    # Displaced by the rules above and not named anywhere: a jammer and a sled
    # are loaded with plates like a machine; the rest are things you hold, hang
    # off or stand on.
    ('plate_loaded_machines', ['Jammer', 'Sled']),
    ('accessories_functional', [
        'Slingshot', 'Suspension Trainer', 'Nordic Hamstring Curl Strap',
        'Sled Pulling Belt/Harness', 'Anchor Point For Resistance Band',
        'Anchor Point For Suspension Trainer', 'Dip Bars', 'Straight Pull-Up Bar',
        'Multi-Grip Pull-Up Bar', 'Gymnastics Rings', 'Push-Up Handles',
    ]),
    # Keeps its eleven resistance settings, which accessories_functional would
    # discard. Move it if that reads wrong.
    ('free_weights_extra', ['Hand Gripper']),
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
            return 'free_weights' if category == 'free_weights_extra' else category
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


# Bodyweight movements need one of these to be possible, and they no longer
# live in the body_weights group. Without this list the catalogue would unlock
# no bodyweight exercise at all.
BODYWEIGHT_APPARATUS = {
    'Bodyweight Only', 'Another Human', 'Bed', 'Chair', 'Couch', 'Captain’s Chair',
    'Dip Bars', 'Straight Pull-Up Bar', 'Multi-Grip Pull-Up Bar', 'Gymnastics Rings',
    'Push-Up Handles', 'Floor', 'Staircase', 'Yoga Blocks',
}


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
    if name in BODYWEIGHT_APPARATUS:
        return ['body only', 'none']
    return []


# Pre-fill presets offered when you add a gym. Membership is by group, with a
# few explicit names for the small ones. These are starting points the user
# edits afterwards, not claims about any real gym.
PRESETS = [
    ('everything', 'Everything Gym', {'all': True}),
    ('commercial', 'Commercial Gym', {'categories': [
        'free_weights', 'loaded_bars', 'fixed_weight_bars', 'bands_ropes', 'body_weights',
        'benches_racks', 'accessories_functional', 'cable_machines',
        'pin_loaded_machines', 'plate_loaded_machines', 'cardio',
    ], 'exclude': [
        'Strongman Log', 'Yoke', 'Sled', 'Axle Bar', 'Marrs Bar', 'Buffalo Bar',
        'Cambered Squat Bar', 'Cambered Bench Press Bar',
    ]}),
    ('warehouse', 'Warehouse Gym', {'categories': [
        'free_weights', 'loaded_bars', 'fixed_weight_bars', 'bands_ropes', 'body_weights',
        'benches_racks', 'accessories_functional', 'loaded_accessories',
        'plate_loaded_machines',
    ]}),
    ('local', 'Local Gym', {'categories': [
        'free_weights', 'loaded_bars', 'bands_ropes', 'body_weights', 'benches_racks',
        'accessories_functional', 'cable_machines', 'pin_loaded_machines', 'cardio',
    ], 'exclude': ['Strongman Log', 'Yoke', 'Sled', 'Axle Bar', 'Marrs Bar']}),
    ('garage', 'Garage Gym', {'names': [
        'Barbell', 'Weight Plates', 'Bumper Plates', 'Dumbbells', 'Kettlebells', 'EZ Bar',
        'Trap Bar', 'Power Rack', 'Squat Stand', 'Flat Bench', 'Adjustable Bench',
        'Straight Pull-Up Bar', 'Dip Bars', 'Long Resistance Bands', 'Short Resistance Band',
        'Gymnastics Rings', 'Ab Wheel', 'Jump Rope', 'Weighted Vest', 'Ankle Weights',
        'Dip/Pull-Up/Belt Squat Belt', 'Farmer\u2019s Handles', 'Sled', 'Landmine Attachment/Wall Corner',
        'Plyometric Boxes', 'Slant Board', 'Yoga Blocks',
    ]}),
    ('home', 'Home Gym', {'names': [
        'Dumbbells', 'Kettlebells', 'Long Resistance Bands', 'Short Resistance Band',
        'Adjustable Bench', 'Flat Bench', 'Straight Pull-Up Bar', 'Push-Up Handles',
        'Ab Wheel', 'Jump Rope', 'Yoga Blocks', 'Stability Ball', 'Bosu Ball',
        'Suspension Trainer', 'Ankle Weights', 'Weighted Vest', 'Medicine Ball',
        'Bodyweight Only', 'Chair', 'Bed', 'Couch',
    ]}),
    ('blank', 'Start From Blank Slate', {'names': []}),
]


def preset_members(rule, items):
    if rule.get('all'):
        return [i['name'] for i in items]
    if 'names' in rule:
        known = {i['name'] for i in items}
        return [n for n in rule['names'] if n in known]
    exclude = set(rule.get('exclude', []))
    cats = set(rule['categories'])
    return [i['name'] for i in items if i['category'] in cats and i['name'] not in exclude]


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
    presets = [
        {'key': key, 'name': name, 'items': preset_members(rule, items)}
        for key, name, rule in PRESETS
    ]

    with open('tools/seed-equipment/equipment.json', 'w', encoding='utf-8') as f:
        json.dump({'items': items, 'presets': presets}, f, ensure_ascii=False, indent=2)
        f.write('\n')
    for i in items:
        assert i['kind'] == KIND_BY_CATEGORY[i['category']], i
    print(f'{len(items)} items written')


if __name__ == '__main__':
    main()
