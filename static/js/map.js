
const MapModule = (() => {
    'use strict';

    let map, svgLayer, g, pathGen;
    let geojson, premisesData, schoolsData;
    let activeDim = 'composite';

    let premLayer = null;
    let schLayer = null;
    let ringLayer = null;
    let onClickCallback = null;
    let pcMarker = null;

    const DIMS = {
        composite: p => p.composite,
        imd: p => p.imd,
        crime: p => p.crime,
        density: p => p.density,
        health: p => p.health,
    };


    // Risk colour scale

    const colorScale = d3.scaleThreshold()
        .domain([0.38, 0.60])
        .range([
            '#4db69c',
            '#e8b55b',
            '#f08090'
        ]);

    function tierColor(tier) {
        return tier === 'high' ? '#f08090'
            : tier === 'medium' ? '#e8b55b'
            : '#4db69c';
    }


    // Fit the map to Newcastle's geographical boundaries

    function fitCity() {
    map.setView([54.978, -1.617], 12);
}


    // Coordinate projection

    function projectPoint(lon, lat) {
        const pt = map.latLngToLayerPoint(L.latLng(lat, lon));

        this.stream.point(pt.x, pt.y);
    }

    function getTransform() {
        return d3.geoTransform({
            point: projectPoint
        });
    }


    // Map initialisation

    function init(gj, premises, schools, onClick) {
        geojson = gj;
        premisesData = premises.features;
        schoolsData = schools;
        onClickCallback = onClick;

        map = L.map('map-wrap', {
            center: [54.978, -1.617],
            zoom: 12,
            zoomControl: true,
            attributionControl: true,
        });

        // OpenStreetMap basemap.
        // Dark styling is applied through CSS.

        L.tileLayer(
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }
        ).addTo(map);

        // D3 SVG overlay

        svgLayer = L.svg({
            pane: 'overlayPane'
        }).addTo(map);

        const svgEl = svgLayer._container;

        svgEl.style.pointerEvents = 'auto';

        g = d3.select(svgEl)
            .append('g')
            .attr('class', 'leaflet-zoom-hide');

        g.style('pointer-events', 'auto');

        buildLsoaLayer();
        fitCity();

        map.on('zoomend moveend', redrawPaths);

        redrawPaths();
    }


    // LSOA geographical layer

    function buildLsoaLayer() {
        g.selectAll('.lsoa').remove();

        g.selectAll('.lsoa')
            .data(geojson.features)
            .join('path')
            .attr('class', 'lsoa')
            .attr('fill', d => colorScale(DIMS[activeDim](d.properties)))
            .attr('fill-opacity', 0.78)
            .attr('stroke', '#243443')
            .attr('stroke-width', 0.6)
            .style('cursor', 'pointer')
            .style('pointer-events', 'all')
            .on('mouseover', handleOver)
            .on('mousemove', handleMove)
            .on('mouseout', handleOut)
            .on('click', handleClick);
    }

    function redrawPaths() {
        pathGen = d3.geoPath()
            .projection(getTransform());

        g.selectAll('.lsoa')
            .attr('d', pathGen);
    }


    // Tooltip

    const tt = document.getElementById('tt');

    function pct(value) {
        return Math.round(value * 100) + '%';
    }

    function dimBar(label, val, col) {
        return `
            <div class="tt-dim-row">

                <span class="tt-dim-lbl">
                    ${label}
                </span>

                <div class="tt-dim-track">
                    <div class="tt-dim-fill"
                         style="width:${Math.round(val * 100)}%;
                                background:${col}">
                    </div>
                </div>

                <span class="tt-dim-val" style="color:${col}">
                    ${Math.round(val * 100)}%
                </span>

            </div>
        `;
    }


    // Map hover interactions

    function handleOver(event, d) {
        const p = d.properties;
        const col = tierColor(p.tier);

        d3.select(this)
            .raise()
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('fill-opacity', 0.9);

        tt.innerHTML = `
            <div class="tt-label">
                ${p.ward_name}
            </div>

            <div class="tt-title">
                ${p.lsoa_id}
            </div>

            <div class="tt-composite-row">

                <span>Composite Score</span>

                <span class="tt-composite-val"
                      style="color:${col}">
                    ${pct(p.composite)}
                </span>

                <span class="pill ${p.tier}">
                    ${p.tier.toUpperCase()}
                </span>

            </div>

            <div class="tt-dims">

                ${dimBar('Deprivation', p.imd, '#e8b55b')}
                ${dimBar('Crime', p.crime, '#f08090')}
                ${dimBar('Density', p.density, '#a31c4f')}
                ${dimBar('Health', p.health, '#388bfd')}

            </div>

            <div class="tt-flags">

                ${p.glass_flag
                    ? '<span class="tt-flag warn">⚠ Glass flag</span>'
                    : ''}

                ${p.eco_bonus
                    ? '<span class="tt-flag ok">✓ Eco bonus</span>'
                    : ''}

            </div>
        `;

        tt.style.display = 'block';

        posTT(event);
    }

    function handleMove(event) {
        posTT(event);
    }

    function handleOut() {
        d3.select(this)
            .attr('stroke', '#243443')
            .attr('stroke-width', 0.6)
            .attr('fill-opacity', 0.78);

        tt.style.display = 'none';
    }

    function handleClick(event, d) {
        highlightLsoa(d.properties.lsoa_id);

        if (onClickCallback) {
            onClickCallback(d.properties);
        }
    }


    // Keep the tooltip within the browser viewport

    function posTT(event) {
        const gap = 14;
        const margin = 12;

        const { width, height } = tt.getBoundingClientRect();

        let left = event.clientX + gap;
        let top = event.clientY + gap;

        if (left + width > window.innerWidth - margin) {
            left = event.clientX - width - gap;
        }

        if (top + height > window.innerHeight - margin) {
            top = event.clientY - height - gap;
        }

        tt.style.left = Math.max(
            margin,
            Math.min(left, window.innerWidth - width - margin)
        ) + 'px';

        tt.style.top = Math.max(
            margin,
            Math.min(top, window.innerHeight - height - margin)
        ) + 'px';
    }


    // Highlight selected LSOA

    function highlightLsoa(id) {
        g.selectAll('.lsoa')
            .attr('stroke', d =>
                d.properties.lsoa_id === id
                    ? '#fff'
                    : '#243443'
            )
            .attr('stroke-width', d =>
                d.properties.lsoa_id === id
                    ? 2
                    : 0.6
            );
    }


    // Navigate to a selected geographical area

    function flyToById(id) {
        const feat = geojson.features.find(
            f => f.properties.lsoa_id === id
        );

        if (!feat) return;

        const bounds = L.geoJSON(feat).getBounds();

        if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.5), {
                maxZoom: 16
            });
        }

        highlightLsoa(id);
    }


    // Switch between risk dimensions

    function setDimension(dim) {
        activeDim = dim;

        g.selectAll('.lsoa')
            .transition()
            .duration(300)
            .attr('fill', d =>
                colorScale(DIMS[dim](d.properties))
            );
    }


    // Licensed premises layer

    function togglePremises(on) {
        if (premLayer) {
            map.removeLayer(premLayer);
            premLayer = null;
        }

        if (!on) return;

        premLayer = L.layerGroup(
            premisesData.map(f => {
                const [lon, lat] = f.geometry.coordinates;

                return L.circleMarker([lat, lon], {
                    radius: 4,

                    fillColor: f.properties.trade === 'on'
                        ? '#a31c4f'
                        : '#303e92',

                    color: '#243443',
                    weight: 0.5,
                    fillOpacity: 0.85,

                }).bindTooltip(
                    `${f.properties.type} (${f.properties.trade}-trade)`,
                    {
                        sticky: true
                    }
                );
            })
        ).addTo(map);
    }


    // Schools and 800-metre proximity zones

    function toggleSchools(on) {
        if (schLayer) {
            map.removeLayer(schLayer);
            schLayer = null;
        }

        if (ringLayer) {
            map.removeLayer(ringLayer);
            ringLayer = null;
        }

        document.getElementById('leg-sch').style.display =
            on ? 'flex' : 'none';

        document.getElementById('leg-ring').style.display =
            on ? 'flex' : 'none';

        if (!on) return;

        ringLayer = L.layerGroup(
            schoolsData.map(s =>
                L.circle([s.lat, s.lon], {
                    radius: 800,
                    color: '#a31c4f',
                    weight: 1,
                    dashArray: '4 3',
                    fillColor: '#a31c4f',
                    fillOpacity: 0.05,
                })
            )
        ).addTo(map);

        schLayer = L.layerGroup(
            schoolsData.map(s =>
                L.circleMarker([s.lat, s.lon], {
                    radius: 5,
                    fillColor: '#3fb950',
                    color: '#243443',
                    weight: 1,
                    fillOpacity: 1,

                }).bindTooltip(s.name, {
                    sticky: true
                })
            )
        ).addTo(map);
    }


    // Highlight postcode search result

    function flashPostcode(lon, lat) {
        if (pcMarker) {
            map.removeLayer(pcMarker);
        }

        pcMarker = L.circleMarker([lat, lon], {
            radius: 8,
            fillColor: '#39c5cf',
            color: '#fff',
            weight: 2,
            fillOpacity: 1,
        }).addTo(map);
    }


    // Reset map view

    function reset() {
        fitCity();

        g.selectAll('.lsoa')
            .attr('stroke', '#243443')
            .attr('stroke-width', 0.6);

        if (pcMarker) {
            map.removeLayer(pcMarker);
            pcMarker = null;
        }
    }


    // Public module interface

    return {
        init,
        setDimension,
        togglePremises,
        toggleSchools,
        highlightLsoa,
        flyToById,
        flashPostcode,
        reset,
    };

})();
