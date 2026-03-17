/**
 * static/js/panel.js
 * Panel views: overview, postcode lookup, application checker.
 *
 * New features:
 *  - Officer manual scores (4 sliders) blended into a final score
 *  - Flag LSOA for review (session-persisted, shown on overview)
 *  - Tooltip always shows composite + all four dimension bars
 */

const PanelModule = (() => {
  'use strict';

  let onFlyTo = null;

  // ── flagged LSOAs (session state) ──────────────────────────────────────────
  const flagged = new Map(); // lsoa_id → { lsoa_id, ward_name, composite, note, ts }

  // ── helpers ────────────────────────────────────────────────────────────────
  function pct(v) { return Math.round(v * 100) + '%'; }

  function scoreRow(label, val, col, bold = false) {
    return `<div class="score-row">
      <div class="score-hdr">
        <span${bold ? ' style="font-weight:700;color:var(--tx)"' : ''}>${label}</span>
        <span style="color:${col}">${pct(val)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct(val)};background:${col}"></div>
      </div>
    </div>`;
  }

  function condsList(conds) {
    if (!conds || !conds.length)
      return '<div class="no-conds">✓ No conditions triggered at current risk thresholds.</div>';
    return `<div class="cond-list">${conds.map(c => `
      <div class="cond fade" style="border-left-color:${c.color}">
        <div class="cond-trig">
          <div class="cond-dot" style="background:${c.color}"></div>
          <span style="color:${c.color}">${c.trigger_label}</span>
        </div>
        <div class="cond-name">${c.name}</div>
        <div class="cond-desc">${c.description}</div>
        <span class="cond-type" style="border-color:${c.color};color:${c.color}">${c.type} Condition</span>
      </div>`).join('')}</div>`;
  }

  function resultCard(props) {
    const t   = props.tier;
    const col = t === 'high' ? '#cf0144' : t === 'medium' ? '#e3a008' : '#3fb950';
    const isFlagged = flagged.has(props.lsoa_id);
    return `
      <div class="res-card ${t} fade">
        <div class="res-card-top">
          <div>
            <div class="res-id">${props.lsoa_id}</div>
            <div class="res-ward">${props.ward_name}</div>
          </div>
          <button class="flag-btn ${isFlagged ? 'flagged' : ''}"
                  data-id="${props.lsoa_id}"
                  data-ward="${props.ward_name}"
                  data-composite="${props.composite}"
                  title="${isFlagged ? 'Remove flag' : 'Flag for review'}">
            ${isFlagged ? '🚩 Flagged' : '⚑ Flag'}
          </button>
        </div>
        <span class="tier-badge ${t}">${t.toUpperCase()} RISK AREA</span>
        <div class="score-rows">
          ${scoreRow('Deprivation (IMD)', props.imd,       '#e3a008')}
          ${scoreRow('Crime & ASB',       props.crime,     '#cf0144')}
          ${scoreRow('Outlet Density',    props.density,   '#a31c4f')}
          ${scoreRow('Health Outcomes',   props.health,    '#388bfd')}
          ${scoreRow('Composite Score',   props.composite, col, true)}
        </div>
        ${props.glass_flag ? '<div class="flag-box warn">⚠ Glass injury flag active in this LSOA</div>' : ''}
        ${props.eco_bonus  ? '<div class="flag-box ok">✓ Economic bonus eligible premises present</div>'  : ''}
      </div>
      <div class="sec">Recommended Conditions</div>
      ${condsList(props.conditions)}`;
  }

  // Bind flag button after card is inserted into DOM
  function bindFlagBtn(container) {
    container.querySelectorAll('.flag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (flagged.has(id)) {
          flagged.delete(id);
          btn.classList.remove('flagged');
          btn.textContent = '⚑ Flag';
        } else {
          flagged.set(id, {
            lsoa_id:   id,
            ward_name: btn.dataset.ward,
            composite: parseFloat(btn.dataset.composite),
            ts:        new Date().toLocaleTimeString(),
          });
          btn.classList.add('flagged');
          btn.textContent = '🚩 Flagged';
        }
        renderFlaggedPanel();
      });
    });
  }

  // ── tab switching ──────────────────────────────────────────────────────────
  function switchView(v) {
    document.querySelectorAll('.tab') .forEach(b => b.classList.toggle('active', b.dataset.view === v));
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  }

  // ── overview ───────────────────────────────────────────────────────────────
  async function renderOverview() {
    const [stats, wards] = await Promise.all([
      d3.json('/api/stats'),
      d3.json('/api/wards'),
    ]);

    document.getElementById('overview-sub').textContent =
      `${stats.total_lsoas} LSOAs · ${wards.length} wards · Click any LSOA for full profile`;

    document.getElementById('stat-grid').innerHTML = `
      <div class="stat"><div class="stat-n" style="color:var(--red)">${stats.high_risk_lsoas}</div><div class="stat-l">High Risk LSOAs</div></div>
      <div class="stat"><div class="stat-n" style="color:var(--yel)">${stats.medium_risk_lsoas}</div><div class="stat-l">Medium Risk LSOAs</div></div>
      <div class="stat"><div class="stat-n" style="color:var(--grn)">${stats.low_risk_lsoas}</div><div class="stat-l">Low Risk LSOAs</div></div>
      <div class="stat"><div class="stat-n" style="color:var(--teal)">${stats.glass_flag_lsoas}</div><div class="stat-l">Glass Injury Flags</div></div>
      <div class="stat"><div class="stat-n" style="color:var(--pur)">${stats.total_premises}</div><div class="stat-l">Licensed Premises</div></div>
      <div class="stat"><div class="stat-n" style="color:var(--tx2)">${pct(stats.avg_composite)}</div><div class="stat-l">Avg Composite Score</div></div>`;

    document.getElementById('ward-list').innerHTML = wards.map(w => {
      const t   = w.tier;
      const col = t === 'high' ? '#cf0144' : t === 'medium' ? '#e3a008' : '#3fb950';
      return `<div class="ward" data-ward="${w.ward_name}">
        <div class="ward-dot" style="background:${col}"></div>
        <div class="ward-name">${w.ward_name}</div>
        <div class="ward-pct">${pct(w.avg_composite)}</div>
        <div class="tier-tag ${t}">${t}</div>
      </div>`;
    }).join('');

    document.querySelectorAll('.ward').forEach(el => {
      el.addEventListener('click', () => { if (onFlyTo) onFlyTo(el.dataset.ward); });
    });
  }

  // ── flagged panel (inside overview) ───────────────────────────────────────
  function renderFlaggedPanel() {
    let el = document.getElementById('flagged-section');
    if (!el) return;
    if (flagged.size === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="sec" style="color:var(--red)">⚑ Flagged for Review (${flagged.size})</div>
      ${[...flagged.values()].map(f => {
        const col = f.composite >= 0.60 ? '#cf0144' : f.composite >= 0.38 ? '#e3a008' : '#3fb950';
        return `<div class="flagged-row" data-id="${f.lsoa_id}">
          <div class="flagged-info">
            <div class="flagged-id">${f.lsoa_id}</div>
            <div class="flagged-ward">${f.ward_name}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.75rem;font-weight:700;color:${col}">${pct(f.composite)}</span>
            <button class="unflag-btn" data-id="${f.lsoa_id}" title="Remove flag">✕</button>
          </div>
        </div>`;
      }).join('')}`;

    el.querySelectorAll('.flagged-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.classList.contains('unflag-btn')) return;
        const id = row.dataset.id;
        if (onFlyTo) MapModule.flyToById(id);
      });
    });
    el.querySelectorAll('.unflag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        flagged.delete(btn.dataset.id);
        renderFlaggedPanel();
        // update any visible flag buttons
        document.querySelectorAll(`.flag-btn[data-id="${btn.dataset.id}"]`).forEach(b => {
          b.classList.remove('flagged');
          b.textContent = '⚑ Flag';
        });
      });
    });
  }

  // ── show LSOA detail ───────────────────────────────────────────────────────
  async function showLsoaDetail(props) {
    switchView('lookup');
    const out = document.getElementById('lookup-out');
    out.innerHTML = '<div style="color:var(--tx3);font-size:.7rem;padding:8px 0">Loading…</div>';
    try {
      const data = await d3.json(`/api/lsoa/${props.lsoa_id}`);
      out.innerHTML = resultCard(data);
      bindFlagBtn(out);
    } catch {
      out.innerHTML = '<div class="err-box">Could not load LSOA detail.</div>';
    }
  }

  // ── postcode lookup ────────────────────────────────────────────────────────
  function initLookup() {
    const btn = document.getElementById('pc-btn');
    const inp = document.getElementById('pc-in');
    const out = document.getElementById('lookup-out');

    const go = async () => {
      const pc = inp.value.trim();
      if (!pc) return;
      btn.textContent = '…'; btn.disabled = true; out.innerHTML = '';
      try {
        const clean = pc.replace(/\s/g, '').toUpperCase();
        const geo   = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
        if (!geo.ok) throw new Error('404');
        const { result } = await geo.json();
        const lon = result.longitude, lat = result.latitude;
        const data = await d3.json(`/api/lsoa-at-point?lon=${lon}&lat=${lat}`);
        out.innerHTML = resultCard(data);
        bindFlagBtn(out);
        MapModule.flashPostcode(data.lon, data.lat);
        MapModule.highlightLsoa(data.lsoa_id);
        MapModule.flyToById(data.lsoa_id);
      } catch (e) {
        const msg = e.message?.includes('404') ? 'Postcode not found. Please check and try again.'
                  : e.message?.includes('400') ? 'That postcode appears to be outside Newcastle.'
                  : 'Something went wrong. Please try again.';
        out.innerHTML = `<div class="err-box">${msg}</div>`;
      } finally {
        btn.textContent = 'Find'; btn.disabled = false;
      }
    };

    btn.addEventListener('click', go);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  // ── application checker ────────────────────────────────────────────────────
  async function initChecker() {
    const wards = await d3.json('/api/wards');
    const sel   = document.getElementById('ch-ward');
    sel.innerHTML = '<option value="">— Select ward —</option>' +
      wards.map(w => `<option value="${w.ward_name}">${w.ward_name}</option>`).join('');

    // Live slider label update
    document.querySelectorAll('.officer-slider').forEach(slider => {
      const lbl = document.getElementById(slider.id + '-val');
      slider.addEventListener('input', () => {
        if (lbl) lbl.textContent = slider.value;
        updateBlendedScore();
      });
    });

    document.getElementById('ch-run').addEventListener('click', async () => {
      const ward     = sel.value;
      const trade    = document.querySelector('input[name="trade"]:checked')?.value;
      const hasFood  = document.getElementById('ch-food').checked;
      const hasMusic = document.getElementById('ch-music').checked;
      if (!ward || !trade) {
        alert('Please select a ward and trade type.');
        return;
      }

      const params = new URLSearchParams({ ward, trade, food: hasFood, music: hasMusic });
      const res    = document.getElementById('ch-res');
      res.classList.add('show', 'fade');

      try {
        const data = await d3.json(`/api/check?${params}`);

        // ── Officer manual scores ────────────────────────────────────────────
        const oTrack    = parseInt(document.getElementById('o-track').value)    / 10;
        const oHistory  = parseInt(document.getElementById('o-history').value)  / 10;
        const oObjCount = parseInt(document.getElementById('o-objections').value) / 10;
        const oMgmt     = parseInt(document.getElementById('o-management').value) / 10;
        const officerAvg = (oTrack + oHistory + oObjCount + oMgmt) / 4;

        // Blend: 70% data composite + 30% officer assessment
        const blended = parseFloat(
          (data.composite_adjusted * 0.70 + officerAvg * 0.30).toFixed(3)
        );
        const blendedTier = blended >= 0.60 ? 'high' : blended >= 0.38 ? 'medium' : 'low';
        const col  = blendedTier === 'high' ? '#cf0144' : blendedTier === 'medium' ? '#e3a008' : '#3fb950';
        const colD = data.tier_adjusted === 'high' ? '#cf0144' : data.tier_adjusted === 'medium' ? '#e3a008' : '#3fb950';

        const ecoNote = data.eco_reduction > 0
          ? `<div class="flag-box ok">✓ Economic Bonus applied — composite reduced by ${pct(data.eco_reduction)}</div>`
          : '';

        const officerNote = officerAvg > 0
          ? `<div class="flag-box ${officerAvg >= 0.60 ? 'warn' : officerAvg >= 0.38 ? 'med' : 'ok'}">
               Officer assessment score: <b>${pct(officerAvg)}</b>
             </div>`
          : '';

        res.innerHTML = `
          <div class="cr-head" style="border-left:3px solid ${col}">
            <div>
              <div class="cr-meta">${ward} · ${trade}-trade</div>
              <div style="font-size:.65rem;color:var(--tx2);margin-top:2px">${data.lsoa_id} (highest-risk LSOA)</div>
            </div>
            <div style="text-align:right">
              <div class="cr-score" style="color:${col}">${pct(blended)}</div>
              <div style="font-size:.58rem;color:var(--tx3)">blended score</div>
            </div>
          </div>
          <div class="cr-body">
            ${ecoNote}
            ${officerNote}
            <div class="blend-breakdown">
              <div class="blend-row">
                <span>Data composite</span>
                <div class="blend-bar-wrap">
                  <div class="blend-bar" style="width:${pct(data.composite_adjusted)};background:${colD}"></div>
                </div>
                <span style="color:${colD};font-weight:700">${pct(data.composite_adjusted)}</span>
              </div>
              <div class="blend-row">
                <span>Officer assessment</span>
                <div class="blend-bar-wrap">
                  <div class="blend-bar" style="width:${pct(officerAvg)};background:var(--blu)"></div>
                </div>
                <span style="color:var(--blu);font-weight:700">${pct(officerAvg)}</span>
              </div>
              <div class="blend-row blend-total">
                <span>Blended (70 / 30)</span>
                <div class="blend-bar-wrap">
                  <div class="blend-bar" style="width:${pct(blended)};background:${col}"></div>
                </div>
                <span style="color:${col};font-weight:700">${pct(blended)}</span>
              </div>
            </div>
            <div class="cr-summary">
              Final blended score of <b style="color:${col}">${pct(blended)}</b> places this application
              in the <b style="color:${col}">${blendedTier}-risk</b> tier within <b>${ward}</b>.
              ${data.conditions.length
                ? `${data.conditions.length} condition${data.conditions.length > 1 ? 's' : ''} recommended.`
                : 'No conditions triggered.'}
            </div>
            <div class="cr-ctitle">Recommended Conditions (${data.conditions.length})</div>
            ${condsList(data.conditions)}
          </div>`;
      } catch(e) {
        res.innerHTML = '<div class="cr-body"><div class="err-box">Could not run check. Please try again.</div></div>';
      }
    });
  }

  // Live blended score preview in the checker form
  function updateBlendedScore() {
    const preview = document.getElementById('blend-preview');
    if (!preview) return;
    const avg = ['o-track','o-history','o-objections','o-management']
      .reduce((s, id) => s + parseInt(document.getElementById(id)?.value || 0), 0) / 40;
    preview.textContent = `Officer avg: ${pct(avg)}`;
  }

  // ── init ───────────────────────────────────────────────────────────────────
  function init(flyToCallback) {
    onFlyTo = flyToCallback;
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    renderOverview();
    initLookup();
    initChecker();
  }

  return { init, showLsoaDetail, switchView, renderFlaggedPanel };
})();
