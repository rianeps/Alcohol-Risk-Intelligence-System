# Newcastle Alcohol Risk Intelligence — Dashboard

Flask + D3.js dashboard for evidence-based licensing decisions.

## Quick start

```bash
# 1. Create a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run
python app.py
```

Open http://localhost:5000

## Project structure

```
ari/
├── app.py                  # Flask app — all API routes
├── requirements.txt
├── pipeline/
│   ├── generate.py         # Data generation (swap for real data here)
│   └── score.py            # Composite scoring + conditions engine
├── static/
│   ├── css/styles.css
│   └── js/
│       ├── map.js          # D3 choropleth map
│       ├── panel.js        # Panel views (overview, lookup, checker)
│       └── app.js          # Bootstrap + wiring
└── templates/
    └── index.html
```

## Swapping in real data

Each data source is isolated in `pipeline/generate.py`.
Replace the relevant function with real data loading:

| Function             | Replace with                          |
|----------------------|---------------------------------------|
| `generate_lsoas()`   | Load real GeoJSON + join IMD CSV      |
| `generate_premises()`| Load NCC licensing register CSV       |
| `generate_schools()` | Load GIAS school data CSV             |

The scoring formula lives in `pipeline/score.py` — adjust
weights and thresholds there independently of data loading.

## API endpoints

| Endpoint               | Returns                              |
|------------------------|--------------------------------------|
| `GET /api/stats`       | City-wide summary stats              |
| `GET /api/lsoas`       | GeoJSON FeatureCollection + scores   |
| `GET /api/lsoa/<id>`   | Single LSOA detail + conditions      |
| `GET /api/premises`    | GeoJSON premises points              |
| `GET /api/schools`     | School locations array               |
| `GET /api/wards`       | Ward averages, ranked                |
| `GET /api/postcode/<pc>` | LSOA match for postcode            |
| `GET /api/check`       | Application checker result           |

## Deploying to Render (free tier)

1. Push to a GitHub repo
2. New Web Service on render.com → connect repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Done — live URL in ~2 minutes
