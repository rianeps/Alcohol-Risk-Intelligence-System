import json
import csv
import random
import os

# ── Path config ───────────────────────────────────────────────────────────────
# Place both files in a data/ folder inside your ari project directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON_PATH = os.path.join(BASE_DIR, 'data', 'newcastle_lsoas.geojson')
LOOKUP_PATH  = os.path.join(BASE_DIR, 'data', 'lsoa_ward_lookup.csv')


def _build_ward_lookup():
    """Build a dict of LSOA21CD -> ward name from the ONS lookup CSV."""
    lookup = {}
    with open(LOOKUP_PATH, encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row.get('LAD22CD') == 'E08000021':
                lookup[row['LSOA21CD']] = row['WD22NM']
    return lookup


def _fallback_ward(lsoa_name: str) -> str:
    """
    For LSOAs not in the lookup, derive a rough ward label from the LSOA name.
    e.g. 'Newcastle upon Tyne 027A' -> 'Zone 027'
    """
    suffix = lsoa_name.replace('Newcastle upon Tyne ', '').strip()
    number = ''.join(c for c in suffix if c.isdigit())
    return f'Zone {number}' if number else 'Unknown'


def generate_lsoas() -> list:
    """
    Load real Newcastle LSOA boundaries from GeoJSON and join ward names
    from the ONS LSOA-to-Ward lookup CSV.

    Scores are still synthetic — replace the random.random() calls with
    real data sources when available.
    """
    ward_lookup = _build_ward_lookup()

    with open(GEOJSON_PATH, encoding='utf-8') as f:
        geo = json.load(f)

    lsoas = []
    for feature in geo['features']:
        props    = feature['properties']
        lsoa_id  = props['LSOA21CD']
        name     = props['LSOA21NM']
        ward     = ward_lookup.get(lsoa_id) or _fallback_ward(name)

        lsoas.append({
            'lsoa_id':  lsoa_id,
            'name':     name,
            'ward_name': ward,
            'geometry': feature['geometry'],
            # ── REPLACE these with real data sources ──────────────────────
            'imd':      random.random(),   # Source: MHCLG IMD 2019
            'crime':    random.random(),   # Source: data.police.uk
            'density':  random.random(),   # Source: NCC licensing register
            'health':   random.random(),   # Source: NHS Fingertips LAPE
            # ─────────────────────────────────────────────────────────────
        })

    return lsoas

def generate_premises():
    ON  = ["Bar","Pub","Nightclub","Restaurant","Hotel Bar","Live Music Venue"]
    OFF = ["Off-licence","Supermarket","Convenience Store","Wine Shop"]
    clusters = [
        (-1.613,54.975,80,.65),(-1.596,54.977,20,.75),(-1.633,54.972,25,.55),
        (-1.682,54.965,16,.25),(-1.548,54.970,14,.30),(-1.573,54.974,16,.40),
        (-1.661,54.984,14,.30),(-1.607,54.993,12,.80),(-1.622,55.012,10,.70),
        (-1.646,54.975,14,.35),(-1.585,54.986,12,.60),(-1.730,54.984,7,.25),
        (-1.672,55.004,7,.35), (-1.658,54.997,7,.30),
    ]
    rows, pid = [], 1
    for clon,clat,n,prob in clusters:
        for _ in range(n):
            on = random.random()<prob
            t  = random.choice(ON if on else OFF)
            rows.append({"id":f"P{pid:04d}","type":t,"trade":"on" if on else "off",
                "lon":round(clon+random.gauss(0,.004),5),
                "lat":round(clat+random.gauss(0,.003),5),
                "eco": t in ["Restaurant","Live Music Venue","Hotel Bar"]})
            pid+=1
    return rows

def generate_schools():
    return [
        {"name":"Westgate Hill Primary",    "lon":-1.643,"lat":54.974},
        {"name":"Walker Riverside Academy", "lon":-1.540,"lat":54.968},
        {"name":"Byker Primary",            "lon":-1.573,"lat":54.972},
        {"name":"Benwell Hill School",      "lon":-1.685,"lat":54.963},
        {"name":"Elswick Primary",          "lon":-1.640,"lat":54.969},
        {"name":"Heaton Manor School",      "lon":-1.581,"lat":54.988},
        {"name":"Gosforth Academy",         "lon":-1.617,"lat":55.015},
        {"name":"Sacred Heart High",        "lon":-1.657,"lat":54.977},
        {"name":"Kenton School",            "lon":-1.675,"lat":55.003},
        {"name":"Fenham Primary",           "lon":-1.663,"lat":54.982},
        {"name":"Wingrove Primary",         "lon":-1.637,"lat":54.981},
        {"name":"Arthur's Hill School",     "lon":-1.648,"lat":54.973},
        {"name":"Jesmond Park Academy",     "lon":-1.603,"lat":54.998},
        {"name":"South Gosforth First",     "lon":-1.613,"lat":55.006},
        {"name":"Walkergate Primary",       "lon":-1.564,"lat":54.979},
        {"name":"Manor Park Primary",       "lon":-1.558,"lat":54.989},
        {"name":"Kingston Park Academy",    "lon":-1.680,"lat":55.018},
        {"name":"Callerton Academy",        "lon":-1.762,"lat":55.009},
        {"name":"Lemington Spencer",        "lon":-1.732,"lat":54.982},
        {"name":"Newburn Grange",           "lon":-1.758,"lat":54.988},
    ]
