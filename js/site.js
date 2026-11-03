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

const fmtMoney = (v) => '$' + (v < 0.01 ? v.toFixed(4) : v.toFixed(3));
const fmtRate = (r) => (r >= 100 ? Math.round(r).toLocaleString('en-US') : r < 0.1 ? r.toPrecision(2) : (+r.toFixed(2)).toString());
const fmtCount = (n) => {
  if (n >= 1e6) return (+(n / 1e6).toFixed(1)).toString() + ' million';
  return Math.round(n).toLocaleString('en-US');
};

function cost(rps) {
  const gpus = Math.ceil(rps / GPU_MAX_RPS);
  const self = (gpus * GPU_PER_HOUR * 1000) / (rps * 3600);
  return { gpus, self };
}

(() => {
  const input = document.getElementById('traffic');
  if (!input) return;
  const ask = input.parentElement;
  const measure = ask.querySelector('.cost__measure');
  const answer = document.querySelector('.cost__answer');
  const examples = document.querySelectorAll('[data-example]');

  function placeCaret() {
    measure.textContent = input.value;
    const x = Math.min(measure.getBoundingClientRect().width, input.clientWidth);
    ask.style.setProperty('--caret-x', x + 'px');
  }

  function render() {
    const parsed = parseTraffic(input.value);
    const parsedEl = answer.querySelector('.cost__parsed');
    const selfEl = answer.querySelector('.cost__self');
    const selfLabel = answer.querySelector('.cost__rows dt');
    const verdict = answer.querySelector('.cost__verdict');
    if (!parsed) {
      parsedEl.textContent = 'Type a traffic level, like 4 requests a second or 100,000 a day.';
      return;
    }
    const { rps, perDay } = parsed;
    const { gpus, self } = cost(rps);
    parsedEl.textContent = `Read as ${fmtRate(rps)} requests a second, about ${fmtCount(perDay)} a day.`;
    selfLabel.textContent = gpus === 1 ? 'Self-hosted on one L40S' : `Self-hosted on ${gpus} L40S GPUs`;
    selfEl.textContent = fmtMoney(self);
    const ratio = self > API_PER_1K ? self / API_PER_1K : API_PER_1K / self;
    if (Math.abs(ratio - 1) < 0.03) {
      verdict.textContent = 'About even. 1.70 requests a second is the break-even point.';
    } else if (self < API_PER_1K) {
      verdict.textContent = `Self-hosting is ${ratio.toFixed(1)}x cheaper. Below 1.70 requests a second the idle GPU costs more than the API.`;
    } else {
      verdict.textContent = `The API is ${ratio.toFixed(1)}x cheaper. The GPU sits idle most of the hour; self-hosting wins above 1.70 requests a second.`;
    }
    examples.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.example === input.value)));
  }

  input.addEventListener('input', () => { render(); placeCaret(); });
  examples.forEach((b) => b.addEventListener('click', () => {
    input.value = b.dataset.example;
    render();
    placeCaret();
  }));
  window.addEventListener('resize', placeCaret);
  document.fonts?.ready.then(placeCaret);
  render();
  placeCaret();
})();

// Phone menu
(() => {
  const btn = document.querySelector('.top__menu');
  const list = document.getElementById('nav-links');
  if (!btn || !list) return;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    list.classList.toggle('is-open', open);
  });
  list.addEventListener('click', (e) => {
    if (e.target.closest('a')) { btn.setAttribute('aria-expanded', 'false'); list.classList.remove('is-open'); }
  });
})();

// Reveal each part once as it enters; never leaves content hidden.
(() => {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
  // A target fully clipped by its own clip-path never reports as intersecting in Chrome,
  // so clip reveals are triggered by watching their block instead.
  const watchers = new Map();
  targets.forEach((el) => {
    const watched = el.classList.contains('block__visual') ? el.closest('.block') : el;
    if (!watchers.has(watched)) watchers.set(watched, []);
    watchers.get(watched).push(el);
  });
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      watchers.get(entry.target).forEach((el) => el.classList.add('is-in'));
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.02 });
  watchers.forEach((_, watched) => io.observe(watched));
  window.addEventListener('load', () => setTimeout(() => {
    targets.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in'); });
  }, 2500));
})();
