/**
 * static/js/app.js
 * Bootstraps the application — loads data from API, wires all controls.
 */

(async () => {
  'use strict';

  // ── Load data from Flask API ───────────────────────────────────────────────
  const [lsoas, premises, schools] = await Promise.all([
    d3.json('/api/lsoas'),
    d3.json('/api/premises'),
    d3.json('/api/schools'),
  ]);

  // ── Init modules ──────────────────────────────────────────────────────────
  MapModule.init(lsoas, premises, schools, props => {
    PanelModule.showLsoaDetail(props);
  });

  PanelModule.init(wardName => {
    // Find first LSOA in the ward and fly to it
    const feat = lsoas.features.find(f => f.properties.ward_name === wardName);
    if (feat) {
      MapModule.highlightLsoa(feat.properties.lsoa_id);
      MapModule.flyToById(feat.properties.lsoa_id);
    }
  });

  // ── Dimension buttons ─────────────────────────────────────────────────────
  document.querySelectorAll('.dim-btn[data-dim]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dim-btn[data-dim]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      MapModule.setDimension(btn.dataset.dim);
      document.getElementById('legend-title').textContent =
        btn.textContent.trim() + ' Score';
    });
  });

  // ── Layer toggles ─────────────────────────────────────────────────────────
  document.getElementById('tog-prem').addEventListener('click', function () {
    const on = this.classList.toggle('active');
    MapModule.togglePremises(on);
  });

  document.getElementById('tog-sch').addEventListener('click', function () {
    const on = this.classList.toggle('active');
    MapModule.toggleSchools(on);
  });

  // ── Reset ─────────────────────────────────────────────────────────────────
  document.getElementById('btn-reset').addEventListener('click', () => {
    MapModule.reset();
  });

})();
