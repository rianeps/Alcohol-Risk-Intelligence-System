from flask import Flask, jsonify, render_template, request, abort
from pipeline.generate import generate_lsoas, generate_premises, generate_schools
from pipeline.score    import compute_composite, match_conditions, apply_eco_bonus, CONDITIONS, THRESHOLDS

app = Flask(__name__)

# ── boot ──────────────────────────────────────────────────────────────────────
print("Loading pipeline...")
_lsoas    = generate_lsoas()
_lsoas    = compute_composite(_lsoas)
_premises = generate_premises()
_schools  = generate_schools()
_lsoa_map = {l["lsoa_id"]: l for l in _lsoas}
print(f"  LSOAs:{len(_lsoas)}  Premises:{len(_premises)}  Schools:{len(_schools)}")

def _stats():
    high = sum(1 for l in _lsoas if l["tier"]=="high")
    med  = sum(1 for l in _lsoas if l["tier"]=="medium")
    low  = sum(1 for l in _lsoas if l["tier"]=="low")
    return {
        "total_lsoas": len(_lsoas), "high_risk_lsoas":high,
        "medium_risk_lsoas":med,    "low_risk_lsoas":low,
        "glass_flag_lsoas": sum(1 for l in _lsoas if l["glass_flag"]),
        "avg_composite": round(sum(l["composite"] for l in _lsoas)/len(_lsoas),3),
        "total_premises": len(_premises),
        "on_trade":  sum(1 for p in _premises if p["trade"]=="on"),
        "off_trade": sum(1 for p in _premises if p["trade"]=="off"),
    }
_summary = _stats()

# ── point-in-bbox (good enough for rectangular synthetic LSOAs) ───────────────
def lsoa_at_point(lon: float, lat: float):
    for l in _lsoas:
        geom = l["geometry"]
        # handle both Polygon and MultiPolygon
        if geom["type"] == "Polygon":
            rings = [geom["coordinates"][0]]
        else:
            rings = [part[0] for part in geom["coordinates"]]
        
        for coords in rings:
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            if min(lons) <= lon <= max(lons) and min(lats) <= lat <= max(lats):
                return l
    return None

# ── routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stats")
def api_stats():
    return jsonify(_summary)

@app.route("/api/lsoas")
def api_lsoas():
    features = [
        {
            "type": "Feature",
            "geometry": l["geometry"],
            "properties": {k: v for k, v in l.items() if k != "geometry"}
        }
        for l in _lsoas
    ]
    return jsonify({"type": "FeatureCollection", "features": features})

@app.route("/api/lsoa/<lsoa_id>")
def api_lsoa(lsoa_id):
    l = _lsoa_map.get(lsoa_id)
    if not l: abort(404)
    out = {k:v for k,v in l.items() if k!="geometry"}
    out["conditions"] = match_conditions(out)
    return jsonify(out)

@app.route("/api/premises")
def api_premises():
    features = [{"type":"Feature",
                 "geometry":{"type":"Point","coordinates":[p["lon"],p["lat"]]},
                 "properties":{k:v for k,v in p.items() if k not in("lon","lat")}}
                for p in _premises]
    return jsonify({"type":"FeatureCollection","features":features})

@app.route("/api/schools")
def api_schools():
    return jsonify(_schools)

@app.route("/api/wards")
def api_wards():
    ward_map = {}
    for l in _lsoas:
        ward_map.setdefault(l["ward_name"], []).append(l["composite"])
    wards = sorted([
        {"ward_name":name,
         "avg_composite": round(sum(scores)/len(scores),3),
         "lsoa_count": len(scores),
         "tier": ("high" if sum(scores)/len(scores)>=THRESHOLDS["high"]
                  else "medium" if sum(scores)/len(scores)>=THRESHOLDS["medium"]
                  else "low")}
        for name,scores in ward_map.items()
    ], key=lambda w: -w["avg_composite"])
    return jsonify(wards)

@app.route("/api/lsoa-at-point")
def api_lsoa_at_point():
    # Geocoding happens browser-side (postcodes.io called from JS).
    # This endpoint receives lon/lat and returns the matching LSOA.
    try:
        lon = float(request.args.get("lon"))
        lat = float(request.args.get("lat"))
    except (TypeError, ValueError):
        return jsonify({"error": "lon and lat query params required"}), 400
    if not (-1.85 < lon < -1.45 and 54.88 < lat < 55.12):
        return jsonify({"error": "Location is outside Newcastle"}), 400
    l = lsoa_at_point(lon, lat)
    if not l:
        return jsonify({"error": "Location not matched to an LSOA"}), 404
    out = {k: v for k, v in l.items() if k != "geometry"}
    out["conditions"] = match_conditions(out)
    out["lon"], out["lat"] = lon, lat
    return jsonify(out)

@app.route("/api/check")
def api_check():
    ward      = request.args.get("ward","")
    trade     = request.args.get("trade","on")
    has_food  = request.args.get("food","false").lower()=="true"
    has_music = request.args.get("music","false").lower()=="true"
    if not ward:
        return jsonify({"error":"ward required"}), 400
    ward_lsoas = [l for l in _lsoas if l["ward_name"]==ward]
    if not ward_lsoas:
        return jsonify({"error":f"Ward '{ward}' not found"}), 404
    worst = max(ward_lsoas, key=lambda l: l["composite"])
    props = {k:v for k,v in worst.items() if k!="geometry"}
    props["eco_bonus"] = has_food or has_music
    adjusted = apply_eco_bonus(props["composite"], has_food, has_music)
    props["composite_adjusted"] = adjusted
    props["eco_reduction"] = round(props["composite"]-adjusted, 3)
    props["tier_adjusted"] = ("high" if adjusted>=THRESHOLDS["high"]
                              else "medium" if adjusted>=THRESHOLDS["medium"] else "low")
    props["conditions"] = match_conditions({**props,"composite":adjusted}, trade)
    props["trade"]=trade; props["has_food"]=has_food; props["has_music"]=has_music
    return jsonify(props)

@app.route("/api/conditions")
def api_conditions():
    return jsonify(CONDITIONS)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
