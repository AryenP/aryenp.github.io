// Results charts, drawn from the raw result files (inlined as #results-data, built from each repo).
(() => {
  const src = document.getElementById('results-data');
  if (!src) return;
  const D = JSON.parse(src.textContent);
  const NS = 'http://www.w3.org/2000/svg';
  // Two-series palette validated against the #191917 card surface (dataviz validate_palette.js, dark).
  const COLORS = ['#e5631f', '#4f97e8'];
  const SURFACE = '#191917';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fmtN = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const SPECS = {
    ttft: {
      cat: true, x: D.ttft.x, series: D.ttft.series,
      xLabel: (v) => fmtN(v), xTitle: 'prompt tokens', xTip: (v) => `${fmtN(v)} prompt tokens`,
      yTick: (v) => fmtN(v), yUnit: 'ms', yTip: (v) => `${fmtN(v, 1)} ms`,
    },
    throughput: {
      cat: true, x: D.throughput.x, series: D.throughput.series,
      xLabel: (v) => String(v), xTitle: 'concurrent requests', xTip: (v) => `${v} concurrent`,
      yTick: (v) => fmtN(v), yUnit: 'req/s', yTip: (v) => `${fmtN(v, 2)} req/s`,
    },
    speedup: {
      cat: true, x: D.speedup.x, series: D.speedup.series,
      xLabel: (v) => `γ=${v}`, xTitle: 'draft length', xTip: (v) => `Draft length γ=${v}`,
      yTick: (v) => `${fmtN(v, 1)}x`, yUnit: '', yTip: (v, s, i) => `${fmtN(v, 2)}x · ${fmtN(s.tps[i], 1)} tok/s`,
      refs: [{ y: 1, label: 'KV cache' }],
    },
    power: {
      cat: false, wide: true,
      points: D.power.points,
      series: [{ name: 'Measured power', values: D.power.points.map((p) => p[1]) }],
      xLabel: (v) => `${fmtN(v)} s`, xTitle: 'seconds', xTip: (v) => `${fmtN(v, 1)} s`,
      yTick: (v) => fmtN(v), yUnit: 'W', yTip: (v) => `${fmtN(v, 1)} W`,
      refs: [{ y: D.power.baseline_w, label: `Baseline ${fmtN(D.power.baseline_w, 2)} W` }, { y: D.power.cap_w, label: `Cap ${fmtN(D.power.cap_w, 2)} W` }],
      vref: { x: D.power.cap_t, label: 'Cap set' },
    },
  };

  function niceStep(range, n) {
    const raw = range / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };

  function render(fig, animate) {
    const spec = SPECS[fig.dataset.chart];
    const plot = fig.querySelector('.chart__plot');
    plot.querySelectorAll('svg, .chart__tip').forEach((n) => n.remove());
    const W = plot.clientWidth;
    if (!W) return;
    const phone = W < 420;
    const H = spec.wide ? (phone ? 220 : 270) : (phone ? 210 : 240);
    const multi = spec.series.length > 1;
    const m = { l: 44, r: spec.cat && multi ? (phone ? 64 : 84) : 18, t: 18, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;

    const allY = spec.series.flatMap((s) => s.values).concat((spec.refs || []).map((r) => r.y));
    const step = niceStep(Math.max(...allY), spec.wide ? 5 : 4);
    const yMax = Math.ceil(Math.max(...allY) / step) * step;
    const y = (v) => m.t + ih - (v / yMax) * ih;
    let xs, x;
    if (spec.cat) {
      const pad = Math.min(36, iw / (spec.x.length * 2));
      xs = spec.x.map((_, i) => m.l + pad + (i * (iw - pad * 2)) / (spec.x.length - 1));
      x = (i) => xs[i];
    } else {
      const tMax = spec.points[spec.points.length - 1][0];
      x = (t) => m.l + (t / tMax) * iw;
      xs = spec.points.map((p) => x(p[0]));
    }

    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, plot);

    // recessive grid and y ticks
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'c-grid' }, svg);
      el('text', { x: m.l - 8, y: y(v) + 4, class: 'c-tick', 'text-anchor': 'end' }, svg).textContent = spec.yTick(+v.toFixed(6));
    }
    if (spec.yUnit) el('text', { x: m.l - 8, y: m.t - 6, class: 'c-tick', 'text-anchor': 'end' }, svg).textContent = spec.yUnit;

    // x ticks
    if (spec.cat) {
      spec.x.forEach((v, i) => { el('text', { x: x(i), y: H - 12, class: 'c-tick', 'text-anchor': 'middle' }, svg).textContent = spec.xLabel(v); });
    } else {
      const tMax = spec.points[spec.points.length - 1][0];
      const ts = niceStep(tMax, phone ? 3 : 6);
      for (let t = 0; t <= tMax; t += ts) el('text', { x: x(t), y: H - 12, class: 'c-tick', 'text-anchor': 'middle' }, svg).textContent = spec.xLabel(t);
    }

    // reference lines, labelled in muted ink
    (spec.refs || []).forEach((r) => {
      el('line', { x1: m.l, x2: W - m.r, y1: y(r.y), y2: y(r.y), class: 'c-ref' }, svg);
      el('text', { x: W - m.r - 4, y: y(r.y) - 6, class: 'c-ref-label', 'text-anchor': 'end' }, svg).textContent = r.label;
    });
    if (spec.vref) {
      const vx = x(spec.vref.x);
      el('line', { x1: vx, x2: vx, y1: m.t, y2: m.t + ih, class: 'c-ref' }, svg);
      el('text', { x: vx + 6, y: m.t + 10, class: 'c-ref-label' }, svg).textContent = spec.vref.label;
    }

    // series: 2px lines, 8px markers ringed in the surface colour
    const labels = [];
    spec.series.forEach((s, si) => {
      const color = COLORS[si];
      const pts = s.values.map((v, i) => [spec.cat ? x(i) : xs[i], y(v)]);
      const path = el('path', { d: 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L'), class: 'c-line', stroke: color, pathLength: 1 }, svg);
      if (animate && !reduce) path.classList.add('is-drawing');
      if (spec.cat) {
        pts.forEach(([px, py]) => el('circle', { cx: px, cy: py, r: 4, fill: color, stroke: SURFACE, 'stroke-width': 2, class: animate && !reduce ? 'c-dot is-popping' : 'c-dot' }, svg));
        if (multi) labels.push({ y: pts[pts.length - 1][1], x: pts[pts.length - 1][0] + 10, text: s.name });
      }
    });
    // direct labels at the line ends, nudged apart, in text ink
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
    labels.forEach((l) => { el('text', { x: l.x, y: l.y + 4, class: animate && !reduce ? 'c-label is-popping' : 'c-label' }, svg).textContent = l.text; });

    // hover and keyboard reading: crosshair, highlighted points, tooltip
    const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'c-cross', visibility: 'hidden' }, svg);
    const marks = spec.series.map((_, si) => el('circle', { r: 5, fill: COLORS[si], stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' }, svg));
    const tip = document.createElement('div');
    tip.className = 'chart__tip';
    tip.hidden = true;
    plot.appendChild(tip);
    const n = spec.cat ? spec.x.length : spec.points.length;
    let cur = -1;

    function show(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      const px = spec.cat ? x(cur) : xs[cur];
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      const rows = spec.series.map((s, si) => {
        const v = s.values[cur];
        marks[si].setAttribute('cx', px); marks[si].setAttribute('cy', y(v)); marks[si].setAttribute('visibility', 'visible');
        return `<div class="chart__tiprow"><span class="chart__sw" style="background:${COLORS[si]}"></span><span>${s.name}</span><b>${spec.yTip(v, s, cur)}</b></div>`;
      });
      const xv = spec.cat ? spec.x[cur] : spec.points[cur][0];
      tip.innerHTML = `<div class="chart__tiphead">${spec.xTip(xv)}</div>${rows.join('')}`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const left = px + 14 + tw > W ? px - 14 - tw : px + 14;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = m.t + 'px';
    }
    function hide() {
      cur = -1; tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
      marks.forEach((mk) => mk.setAttribute('visibility', 'hidden'));
    }
    function nearest(clientX) {
      const px = clientX - svg.getBoundingClientRect().left;
      if (spec.cat) {
        let best = 0;
        xs.forEach((v, i) => { if (Math.abs(v - px) < Math.abs(xs[best] - px)) best = i; });
        return best;
      }
      let lo = 0, hi = xs.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < px) lo = mid + 1; else hi = mid; }
      return lo > 0 && Math.abs(xs[lo - 1] - px) < Math.abs(xs[lo] - px) ? lo - 1 : lo;
    }
    const hit = el('rect', { x: m.l, y: 0, width: iw, height: H, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    hit.addEventListener('pointerleave', hide);
    plot.onkeydown = (e) => {
      const stepBy = spec.cat ? 1 : Math.max(1, Math.round(n / 40));
      if (e.key === 'ArrowRight') { show(cur < 0 ? 0 : cur + stepBy); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { show(cur < 0 ? n - 1 : cur - stepBy); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    };
    plot.onblur = hide;
  }

  function legend(fig) {
    const spec = SPECS[fig.dataset.chart];
    const box = fig.querySelector('.chart__legend');
    if (spec.series.length < 2) { box.remove(); return; }
    box.innerHTML = spec.series.map((s, i) => `<span><i style="background:${COLORS[i]}"></i>${s.name}</span>`).join('');
  }

  function table(fig) {
    const spec = SPECS[fig.dataset.chart];
    const det = document.createElement('details');
    det.className = 'chart__data';
    let head, body;
    if (spec.cat) {
      head = `<tr><th scope="col">${spec.xTitle}</th>${spec.series.map((s) => `<th scope="col">${s.name}</th>`).join('')}</tr>`;
      body = spec.x.map((v, i) => `<tr><th scope="row">${spec.xLabel(v)}</th>${spec.series.map((s) => `<td>${spec.yTip(s.values[i], s, i)}</td>`).join('')}</tr>`).join('');
    } else {
      const every = spec.points.filter((_, i) => i % 15 === 0);
      head = `<tr><th scope="col">Time</th><th scope="col">Power</th></tr>`;
      body = every.map((p) => `<tr><th scope="row">${fmtN(p[0], 1)} s</th><td>${fmtN(p[1], 2)} W</td></tr>`).join('');
    }
    det.innerHTML = `<summary>Show the data</summary><div class="chart__tablewrap"><table>${head}${body}</table></div>`;
    if (!spec.cat) det.querySelector('table').insertAdjacentHTML('beforebegin', `<p class="chart__tablenote">Every 15th of ${spec.points.length} samples; the full timeline is in the evidence report.</p>`);
    fig.appendChild(det);
  }

  const figs = [...document.querySelectorAll('.chart[data-chart]')];
  figs.forEach((fig) => { legend(fig); table(fig); render(fig, false); });

  // Draw each chart's lines in once, when it scrolls into view.
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        render(e.target, true);
        io.unobserve(e.target);
      }
    }, { threshold: 0.35 });
    figs.forEach((f) => io.observe(f));
  }

  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = figs[0]?.querySelector('.chart__plot').clientWidth;
    if (w && w !== lastW) { lastW = w; figs.forEach((f) => render(f, false)); }
  });
  figs.forEach((f) => ro.observe(f.querySelector('.chart__plot')));
})();
