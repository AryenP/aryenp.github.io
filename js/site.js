// Measured on Qwen3-8B, 4-bit AWQ, one RunPod L40S (llm-inference-platform README, 6 Oct 2026).
const GPU_PER_HOUR = 1.09;
const GPU_MAX_RPS = 7.62;
const API_PER_1K = 0.178;

const SCALE = { k: 1e3, thousand: 1e3, million: 1e6 };

// "4 requests a second", "100,000 a day", "2k/min", "1 million a month"; a bare number is per second.
function parseTraffic(text) {
  const t = text.toLowerCase().replace(/,/g, '');
  const num = t.match(/(\d+(?:\.\d+)?)\s*(k|thousand|million)?\b/);
  if (!num) return null;
  const n = parseFloat(num[1]) * (SCALE[num[2]] || 1);
  if (!(n > 0)) return null;
  const rest = t.slice(num.index + num[0].length);
  const unit = rest.match(/\b(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|s|m|h|d|w)\b/);
  const w = unit ? unit[1] : 's';
  const seconds = w.startsWith('mo') ? 2592000 : w.startsWith('m') ? 60 : w.startsWith('h') ? 3600
    : w.startsWith('d') ? 86400 : w.startsWith('w') ? 604800 : 1;
  return { rps: n / seconds, perDay: (n / seconds) * 86400 };
}

function cost(rps) {
  const gpus = Math.ceil(rps / GPU_MAX_RPS);
  return { gpus, self: (gpus * GPU_PER_HOUR * 1000) / (rps * 3600) };
}

const fmtMoney = (v) => '$' + (v < 0.01 ? v.toFixed(4) : v.toFixed(3));
const fmtRate = (r) => (r >= 100 ? Math.round(r).toLocaleString('en-US') : r < 0.1 ? r.toPrecision(2) : (+r.toFixed(2)).toString());
const fmtCount = (n) => (n >= 1e6 ? (+(n / 1e6).toFixed(1)) + ' million' : Math.round(n).toLocaleString('en-US'));

// Cost calculator
(() => {
  const input = document.getElementById('traffic');
  if (!input) return;
  const parsedEl = document.querySelector('.calc__parsed');
  const selfEl = document.querySelector('.calc__self');
  const selfLabel = document.querySelector('.calc__selflabel');
  const verdict = document.querySelector('.calc__verdict');
  const examples = document.querySelectorAll('[data-example]');

  function render() {
    const parsed = parseTraffic(input.value);
    examples.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.example === input.value)));
    if (!parsed) {
      parsedEl.textContent = 'Type a traffic level, like 4 requests a second or 100,000 a day.';
      return;
    }
    const { rps, perDay } = parsed;
    const { gpus, self } = cost(rps);
    parsedEl.textContent = `Read as ${fmtRate(rps)} requests a second, about ${fmtCount(perDay)} a day.`;
    selfLabel.textContent = gpus === 1 ? 'Self-hosted on one L40S' : `Self-hosted on ${gpus} L40S GPUs`;
    const next = fmtMoney(self);
    if (selfEl.textContent !== next) {
      selfEl.textContent = next;
      selfEl.classList.remove('is-tick');
      void selfEl.offsetWidth;
      selfEl.classList.add('is-tick');
    }
    const ratio = self > API_PER_1K ? self / API_PER_1K : API_PER_1K / self;
    if (Math.abs(ratio - 1) < 0.03) verdict.textContent = 'About even. 1.70 requests a second is the break-even point.';
    else if (self < API_PER_1K) verdict.textContent = `Self-hosting is ${ratio.toFixed(1)}x cheaper. Below 1.70 requests a second the idle GPU costs more than the API.`;
    else verdict.textContent = `The API is ${ratio.toFixed(1)}x cheaper. The GPU sits idle most of the hour; self-hosting wins above 1.70 requests a second.`;
  }

  input.addEventListener('input', render);
  examples.forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.example; render(); }));
  render();
})();

// Project filter tabs with a sliding underline
(() => {
  const tabs = document.querySelector('.tabs');
  if (!tabs) return;
  const slider = tabs.querySelector('.tabs__bar');
  const buttons = [...tabs.querySelectorAll('.tabs__tab')];
  const cards = [...document.querySelectorAll('.card[data-cat]')];

  function moveSlider(btn) {
    if (!btn.offsetWidth) return;
    slider.style.width = btn.offsetWidth + 'px';
    slider.style.transform = `translateX(${btn.offsetLeft}px)`;
  }

  buttons.forEach((btn) => btn.addEventListener('click', () => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    moveSlider(btn);
    const f = btn.dataset.filter;
    cards.forEach((c) => {
      const show = f === 'all' || c.dataset.cat === f;
      c.hidden = !show;
      if (show) c.classList.add('is-in');
    });
  }));

  const place = () => moveSlider(buttons.find((b) => b.getAttribute('aria-pressed') === 'true'));
  window.addEventListener('resize', place);
  document.fonts?.ready.then(place);
  place();
})();

// Fit the wordmark to its letters and span the dimension line across the name
(() => {
  const svg = document.querySelector('.mark__svg');
  if (!svg) return;
  const name = svg.querySelector('.mark__name');
  const dim = svg.querySelector('.dim');
  const set = (sel, attrs) => Object.entries(attrs).forEach(([k, v]) => svg.querySelector(sel).setAttribute(k, v));
  const fit = () => {
    const b = name.getBBox();
    if (!b.width) return;
    const left = b.x + 4, right = b.x + b.width - 4, mid = (left + right) / 2;
    const y = b.y + b.height + 34;
    dim.setAttribute('transform', `translate(0 ${y})`);
    set('.dim__line--l', { x1: mid, x2: left });
    set('.dim__line--r', { x1: mid, x2: right });
    set('.dim__tick--l', { x1: left, x2: left });
    set('.dim__tick--r', { x1: right, x2: right });
    set('.dim__label', { x: mid });
    const lw = svg.querySelector('.dim__label').getComputedTextLength() + 28;
    set('.dim__gap', { x: mid - lw / 2, width: lw });
    const lh = svg.querySelector('.dim__label').getBBox().height;
    set('.dim__gap', { y: -lh / 2 - 4, height: lh + 8 });
    svg.setAttribute('viewBox', `${b.x - 6} ${b.y - 6} ${b.width + 12} ${y + lh / 2 + 10 - (b.y - 6)}`);
  };
  document.fonts?.ready.then(fit);
  matchMedia('(max-width: 679px)').addEventListener('change', fit);
  fit();
})();

// Readouts count up from zero like an instrument settling
(() => {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fmt = (el, v) => v.toFixed(+el.dataset.decimals || 0) + (el.dataset.suffix || '');
  els.forEach((el) => { el.textContent = fmt(el, 0); });
  const run = (el) => {
    const to = parseFloat(el.dataset.count);
    const t0 = performance.now(), dur = 1400;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(el, to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  setTimeout(() => els.forEach(run), 1250);
})();

// Reveal once on entering the viewport, staggered within a group; never leaves content hidden
(() => {
  const targets = [...document.querySelectorAll('[data-reveal]')];
  if (!targets.length) return;
  const show = (el) => el.classList.add('is-in');
  if (!('IntersectionObserver' in window)) { targets.forEach(show); return; }
  targets.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((s) => s.hasAttribute('data-reveal'));
    el.style.setProperty('--stagger', (siblings.indexOf(el) % 3) * 80 + 'ms');
  });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      show(e.target);
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  targets.forEach((el) => io.observe(el));
  window.addEventListener('load', () => setTimeout(() => {
    targets.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) show(el); });
  }, 2500));
})();
