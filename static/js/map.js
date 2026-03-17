

const MapModule = (() => {
  'use strict';

  let map, svgLayer, g, pathGen;
  let geojson, premisesData, schoolsData;
  let activeDim = 'composite';
  let premLayer = null, schLayer = null, ringLayer = null;
  let onClickCallback = null;
  let pcMarker = null;

  const DIMS = {
    composite: p => p.composite,
    imd:       p => p.imd,
    crime:     p => p.crime,
    density:   p => p.density,
    health:    p => p.health,
  };

  const colorScale = d3.scaleSequential()
    .domain([0, 1])
    .interpolator(d3.interpolateRgbBasis([
      '#0f2a3a', '#1a4a3a', '#4a6a1a', '#e3a008', '#cf0144'
    ]));

  function tierColor(t) {
    return t === 'high' ? '#cf0144' : t === 'medium' ? '#e3a008' : '#3fb950';
  }

  // ── project a [lon,lat] to Leaflet layer point ─────────────────────────────
  function projectPoint(lon, lat) {
    const pt = map.latLngToLayerPoint(L.latLng(lat, lon));
    this.stream.point(pt.x, pt.y);
  }

  function getTransform() {
    return d3.geoTransform({ point: projectPoint });
  }

  // ── init ───────────────────────────────────────────────────────────────────
  function init(gj, premises, schools, onClick) {
    geojson       = gj;
    premisesData  = premises.features;
    schoolsData   = schools;
    onClickCallback = onClick;

    // Leaflet map centred on Newcastle
    map = L.map('map-wrap', {
      center:  [54.978, -1.617],
      zoom:    12,
      zoomControl: true,
      attributionControl: true,
    });

    // CartoDB Dark Matter — no API key needed
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // D3 SVG overlay
    svgLayer = L.svg({ pane: 'overlayPane' }).addTo(map);
    const svgEl = svgLayer._container;
    svgEl.style.pointerEvents = 'auto';
    g.style('pointer-events', 'auto');

    g = d3.select(svgEl).append('g').attr('class', 'leaflet-zoom-hide');

    buildLsoaLayer();

    // Redraw D3 paths whenever Leaflet moves
    map.on('zoomend moveend', redrawPaths);
    redrawPaths();
  }

  // ── LSOA layer ─────────────────────────────────────────────────────────────
  function buildLsoaLayer() {
    g.selectAll('.lsoa').remove();
    g.selectAll('.lsoa')
      .data(geojson.features)
      .join('path')
        .attr('class', 'lsoa')
        .attr('fill',         d => colorScale(DIMS[activeDim](d.properties)))
        .attr('fill-opacity', 0.7)
        .attr('stroke',       '#080d14')
        .attr('stroke-width', 0.6)
        .style('cursor', 'pointer')
        .on('mouseover', handleOver)
        .on('mousemove', handleMove)
        .on('mouseout',  handleOut)
        .on('click',     handleClick);
  }

  function redrawPaths() {
    pathGen = d3.geoPath().projection(getTransform());
    g.selectAll('.lsoa').attr('d', pathGen);
  }

  // ── tooltip ────────────────────────────────────────────────────────────────
  const tt = document.getElementById('tt');
  function pct(v) { return Math.round(v * 100) + '%'; }

  function dimBar(label, val, col) {
    return `<div class="tt-dim-row">
      <span class="tt-dim-lbl">${label}</span>
      <div class="tt-dim-track">
        <div class="tt-dim-fill" style="width:${Math.round(val*100)}%;background:${col}"></div>
      </div>
      <span class="tt-dim-val" style="color:${col}">${Math.round(val*100)}%</span>
    </div>`;
  }

  function handleOver(event, d) {
    const p = d.properties;
    const col = tierColor(p.tier);
    d3.select(this).raise()
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('fill-opacity', 0.9);
    tt.innerHTML = `
      <div class="tt-label">${p.ward_name}</div>
      <div class="tt-title">${p.lsoa_id}</div>
      <div class="tt-composite-row">
        <span>Composite Score</span>
        <span class="tt-composite-val" style="color:${col}">${pct(p.composite)}</span>
        <span class="pill ${p.tier}">${p.tier.toUpperCase()}</span>
      </div>
      <div class="tt-dims">
        ${dimBar('Deprivation', p.imd,     '#e3a008')}
        ${dimBar('Crime',       p.crime,   '#cf0144')}
        ${dimBar('Density',     p.density, '#a31c4f')}
        ${dimBar('Health',      p.health,  '#388bfd')}
      </div>
      <div class="tt-flags">
        ${p.glass_flag ? '<span class="tt-flag warn">⚠ Glass flag</span>' : ''}
        ${p.eco_bonus  ? '<span class="tt-flag ok">✓ Eco bonus</span>'    : ''}
      </div>`;
    tt.style.display = 'block';
    posTT(event);
  }

  function handleMove(event) { posTT(event); }

  function handleOut() {
    d3.select(this)
      .attr('stroke', '#080d14')
      .attr('stroke-width', 0.6)
      .attr('fill-opacity', 0.7);
    tt.style.display = 'none';
  }

  function handleClick(event, d) {
    highlightLsoa(d.properties.lsoa_id);
    if (onClickCallback) onClickCallback(d.properties);
  }

  function posTT(e) {
    tt.style.left = Math.min(e.clientX + 14, window.innerWidth  - 230) + 'px';
    tt.style.top  = Math.min(e.clientY - 10, window.innerHeight - 185) + 'px';
  }

  // ── highlight ──────────────────────────────────────────────────────────────
  function highlightLsoa(id) {
    g.selectAll('.lsoa')
      .attr('stroke',       d => d.properties.lsoa_id === id ? '#fff' : '#080d14')
      .attr('stroke-width', d => d.properties.lsoa_id === id ? 2 : 0.6);
  }

  // ── fly to LSOA ────────────────────────────────────────────────────────────
  function flyToById(id) {
    const feat = geojson.features.find(f => f.properties.lsoa_id === id);
    if (!feat) return;
    const coords = feat.geometry.coordinates[0];
    const lats = coords.map(c => c[1]), lons = coords.map(c => c[0]);
    const bounds = L.latLngBounds(
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)]
    );
    map.fitBounds(bounds.pad(0.5));
    highlightLsoa(id);
  }

  // ── dimension switch ───────────────────────────────────────────────────────
  function setDimension(dim) {
    activeDim = dim;
    g.selectAll('.lsoa')
      .transition().duration(300)
      .attr('fill', d => colorScale(DIMS[dim](d.properties)));
  }

  // ── premises layer ─────────────────────────────────────────────────────────
  function togglePremises(on) {
    if (premLayer) { map.removeLayer(premLayer); premLayer = null; }
    if (!on) return;
    premLayer = L.layerGroup(
      premisesData.map(f => {
        const [lon, lat] = f.geometry.coordinates;
        return L.circleMarker([lat, lon], {
          radius: 4,
          fillColor:   f.properties.trade === 'on' ? '#a31c4f' : '#303e92',
          color:       '#080d14',
          weight:      0.5,
          fillOpacity: 0.85,
        }).bindTooltip(`${f.properties.type} (${f.properties.trade}-trade)`, { sticky: true });
      })
    ).addTo(map);
  }

  // ── schools + 800m rings ───────────────────────────────────────────────────
  function toggleSchools(on) {
    if (schLayer)  { map.removeLayer(schLayer);  schLayer  = null; }
    if (ringLayer) { map.removeLayer(ringLayer); ringLayer = null; }
    document.getElementById('leg-sch') .style.display = on ? 'flex' : 'none';
    document.getElementById('leg-ring').style.display = on ? 'flex' : 'none';
    if (!on) return;

    ringLayer = L.layerGroup(
      schoolsData.map(s => L.circle([s.lat, s.lon], {
        radius:      800,
        color:       '#a31c4f',
        weight:      1,
        dashArray:   '4 3',
        fillColor:   '#a31c4f',
        fillOpacity: 0.05,
      }))
    ).addTo(map);

    schLayer = L.layerGroup(
      schoolsData.map(s => L.circleMarker([s.lat, s.lon], {
        radius: 5,
        fillColor: '#3fb950',
        color: '#080d14',
        weight: 1,
        fillOpacity: 1,
      }).bindTooltip(s.name, { sticky: true }))
    ).addTo(map);
  }

  // ── postcode flash ─────────────────────────────────────────────────────────
  function flashPostcode(lon, lat) {
    if (pcMarker) map.removeLayer(pcMarker);
    pcMarker = L.circleMarker([lat, lon], {
      radius: 8, fillColor: '#39c5cf', color: '#fff', weight: 2, fillOpacity: 1,
    }).addTo(map);
  }

  // ── reset ──────────────────────────────────────────────────────────────────
  function reset() {
    map.setView([54.978, -1.617], 12);
    g.selectAll('.lsoa').attr('stroke', '#080d14').attr('stroke-width', 0.6);
    if (pcMarker) { map.removeLayer(pcMarker); pcMarker = null; }
  }

  return {
    init, setDimension, togglePremises, toggleSchools,
    highlightLsoa, flyToById, flashPostcode, reset,
  };
})();
