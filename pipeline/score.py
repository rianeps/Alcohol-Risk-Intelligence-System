"""
pipeline/score.py
Computes composite risk scores, tiers, and condition recommendations.
All scoring logic lives here — swap data sources in generate.py independently.
"""


CONDITIONS = [
    {
        "id":          "C01",
        "name":        "Polycarbonate-only Vessels",
        "trigger":     "glass_flag",
        "trigger_label": "Glass injury spike detected in LSOA",
        "description": "All drinks served in polycarbonate or toughened glass from 22:00. "
                       "Evidenced by A&E data or police injury records exceeding local baseline.",
        "type":        "Safety",
        "color":       "#cf0144",
    },
    {
        "id":          "C02",
        "name":        "Door Staff Ratio Requirement",
        "trigger":     "composite_high",
        "trigger_label": "Composite risk > 65% and outlet density > 60%",
        "description": "Minimum 1 SIA-licensed door staff per 75 persons capacity "
                       "from 21:00 on Friday and Saturday nights.",
        "type":        "Staffing",
        "color":       "#388bfd",
    },
    {
        "id":          "C03",
        "name":        "Challenge 25 & Mandatory Training",
        "trigger":     "school_proximity",
        "trigger_label": "High outlet density in school proximity zone",
        "description": "All staff complete annual accredited responsible service training. "
                       "Challenge 25 required as enforceable licence condition.",
        "type":        "Training",
        "color":       "#a371f7",
    },
    {
        "id":          "C04",
        "name":        "Diversification Licence Condition",
        "trigger":     "eco_bonus",
        "trigger_label": "Economic bonus application submitted",
        "description": "Food service or cultural programming must be attached as an "
                       "enforceable licence condition to qualify for the score offset.",
        "type":        "Bonus",
        "color":       "#3fb950",
    },
]

THRESHOLDS = {
    "high":              0.60,
    "medium":            0.38,
    "composite_high":    0.65,
    "density_high":      0.60,
    "density_challenge": 0.55,
}


def compute_composite(lsoas: list) -> list:
    """
    Takes a list of LSOA dicts with keys: imd, crime, density, health.
    Adds composite, tier, glass_flag and eco_bonus in-place and returns the list.
    """
    for l in lsoas:
        composite = round((l["imd"] + l["crime"] + l["density"] + l["health"]) / 4, 3)
        composite = max(0.03, min(0.96, composite))
        l["composite"] = composite
        l["glass_flag"] = l["crime"] > 0.58
        l["eco_bonus"] = l["density"] > 0.50 and l["crime"] < 0.65
        l["tier"] = ("high"   if composite >= THRESHOLDS["high"]
                else "medium" if composite >= THRESHOLDS["medium"]
                else "low")
    return lsoas


def match_conditions(props: dict, trade: str = "on") -> list:
    """
    Given an LSOA's properties dict and trade type,
    return the list of condition dicts that fire.
    """
    matched = []
    for c in CONDITIONS:
        fire = False
        t = c["trigger"]
        if t == "glass_flag":
            fire = bool(props.get("glass_flag"))
        elif t == "composite_high":
            fire = (props.get("composite", 0) >= THRESHOLDS["composite_high"] and
                    props.get("density",   0) >= THRESHOLDS["density_high"])
        elif t == "school_proximity":
            fire = props.get("density", 0) >= THRESHOLDS["density_challenge"]
        elif t == "eco_bonus":
            fire = bool(props.get("eco_bonus"))
        if fire:
            matched.append(c)
    return matched


def apply_eco_bonus(composite: float, has_food: bool, has_music: bool) -> float:
    reduction = (0.08 if has_food else 0) + (0.06 if has_music else 0)
    return round(max(0.03, composite - reduction), 3)
