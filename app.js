/* Aigerdata internal harness leaderboard. Vanilla JS, no dependencies.
   Data: window.LB_DATA from data.js (built by scripts/build_leaderboard_data.py). */
(() => {
  'use strict';
  const D = window.LB_DATA;
  if (!D) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px">data.js is missing.</p>'); return; }

  // ------------------------------------------------------------------ helpers
  const H_ORDER = ['pi', 'opencode', 'mini'];
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const series = (h) => `var(--s-${h})`;
  const hName = (h) => D.harnesses[h].name;
  const totTok = (t) => (t.input || 0) + (t.output || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0);
  const taskByCode = Object.fromEntries(D.tasks.map((t) => [t.code, t]));
  const isDark = () => {
    const a = document.documentElement.getAttribute('data-theme');
    return a ? a === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fmt = {
    usd: (v) => (v == null ? '—' : '$' + v.toFixed(2)),
    usdShort: (v) => '$' + (v >= 10 ? v.toFixed(0) : v.toFixed(v < 1 ? 2 : 1)),
    min: (s) => { const m = s / 60; return (m < 10 ? m.toFixed(1) : Math.round(m)) + ' min'; },
    tok: (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n)),
    int: (n) => Math.round(n).toLocaleString('en-US'),
    pct: (v) => Math.round(v * 100) + '%',
    date: (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };

  const ICON = {
    ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.7 5.7-4.5 4.6a.9.9 0 0 1-1.3 0L4.3 8.7a.9.9 0 1 1 1.3-1.3l1 1 3.8-3.9a.9.9 0 0 1 1.3 1.2Z"/></svg>',
    no: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3 9.7a.9.9 0 1 1-1.3 1.3L8 9.3 6.3 11A.9.9 0 1 1 5 9.7L6.7 8 5 6.3A.9.9 0 1 1 6.3 5L8 6.7 9.7 5A.9.9 0 1 1 11 6.3L9.3 8Z"/></svg>',
    tick: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 11.6 2.4 7.8l1.4-1.4 2.4 2.4 6-6 1.4 1.4z"/></svg>',
    cross: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 2.8 8 6.6l3.8-3.8 1.4 1.4L9.4 8l3.8 3.8-1.4 1.4L8 9.4l-3.8 3.8-1.4-1.4L6.6 8 2.8 4.2z"/></svg>',
    crown: '<svg class="crown" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 4l3.5 3L8 2l3.5 5L15 4l-1.5 9h-11z"/></svg>',
    opencode: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 24H2V0h20zM17 4.8H7v14.4h10z"/></svg>',
  };
  const status = (ok, label) => `<span class="status ${ok ? 'ok' : 'no'}">${ok ? ICON.ok : ICON.no}${esc(label ?? (ok ? 'Solved' : 'Not solved'))}</span>`;
  const logo = (h, cls = '') => {
    const inner = h === 'opencode' ? ICON.opencode : `<img src="logos/${h === 'mini' ? 'mini-swe-agent' : 'pi'}.svg" alt="" loading="lazy">`;
    return `<span class="logo ${cls}" style="--series:${series(h)}">${inner}</span>`;
  };

  function wilson(k, n, z = 1.96) {
    if (!n) return [0, 0];
    const p = k / n, z2 = z * z, d = 1 + z2 / n, c = p + z2 / (2 * n);
    const m = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
    return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
  }
  function niceTicks(max, count = 5) {
    if (max <= 0) return [0, 1];
    const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const top = Math.ceil(max / step) * step, out = [];
    for (let v = 0; v <= top + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function svg(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }
  function svgText(parent, x, y, text, cls, anchor = 'start') {
    const t = svg('text', { x, y, class: cls, 'text-anchor': anchor }, parent);
    t.textContent = text;
    return t;
  }

  // ------------------------------------------------------------------ state + selection
  const state = { set: 'fair', kind: 'all', x: 'cost', cell: 'outcome', sort: { key: 'rank', dir: 1 }, open: new Set() };

  const SETS = [
    { id: 'fair', label: 'Fair set', note: 'F2 with interface note' },
    { id: 'original', label: 'Ticket text only', note: 'F2 as written' },
    { id: 'all', label: 'All jobs', note: 'both F2 variants' },
  ];
  const KINDS = [{ id: 'all', label: 'All' }, { id: 'bug', label: 'Bugs' }, { id: 'feature', label: 'Features' }];
  const XS = [
    { id: 'cost', label: 'Cost', axis: 'Total cost (USD)', get: (a) => a.cost, tick: (v) => '$' + v },
    { id: 'agent', label: 'Agent time', axis: 'Agent time (min)', get: (a) => a.agent / 60, tick: (v) => v + 'm' },
    { id: 'tokens', label: 'Tokens', axis: 'Tokens, incl. cache (millions)', get: (a) => a.tokens / 1e6, tick: (v) => v + 'M' },
    { id: 'calls', label: 'Model calls', axis: 'Model calls', get: (a) => a.calls, tick: (v) => String(v) },
  ];
  const CELLS = [
    { id: 'outcome', label: 'Outcome' }, { id: 'cost', label: 'Cost' },
    { id: 'agent', label: 'Agent time' }, { id: 'tokens', label: 'Tokens' },
  ];

  function inSet(j, set = state.set) {
    if (j.task !== 'F2') return true;
    if (set === 'fair') return j.variant === 'v2';
    if (set === 'original') return j.variant === 'v1';
    return true;
  }
  const selectJobs = () => D.jobs.filter((j) => inSet(j) && (state.kind === 'all' || j.kind === state.kind));
  const rowKey = (j) => (j.task === 'F2' ? `F2·${j.variant}` : j.task);
  function rowLabel(key) {
    if (key === 'F2·v1') return { code: 'F2', tag: 'v1', note: 'ticket text only' };
    if (key === 'F2·v2') return { code: 'F2', tag: 'v2', note: '+ interface note' };
    return { code: key, tag: null, note: null };
  }
  function taskRows(jobs) {
    const order = ['B1', 'B2', 'B3', 'F1', 'F2·v1', 'F2·v2'];
    const keys = [...new Set(jobs.map(rowKey))];
    return order.filter((k) => keys.includes(k));
  }

  function aggregate(jobs) {
    const rows = H_ORDER.map((h) => {
      const js = jobs.filter((j) => j.harness === h);
      const n = js.length, solved = js.filter((j) => j.final_pass).length;
      const cost = sum(js, (j) => j.cost_usd);
      const replays = js.filter((j) => j.replay);
      return {
        h, n, solved, jobs: js,
        rate: n ? solved / n : 0, ci: wilson(solved, n),
        t1: js.filter((j) => j.turn_1_pass).length,
        t2Tried: js.filter((j) => j.turns_taken > 1).length,
        t2Rescued: js.filter((j) => j.turn_2_pass).length,
        t2Cost: sum(js, (j) => (j.turns[1] ? j.turns[1].cost_usd : 0)),
        cost, costPerSolve: solved ? cost / solved : null,
        wall: sum(js, (j) => j.duration_sec), agent: sum(js, (j) => j.agent_sec),
        tokens: sum(js, (j) => totTok(j.tokens)), calls: sum(js, (j) => j.tokens.calls),
        tokIn: sum(js, (j) => j.tokens.input + j.tokens.output), tokCw: sum(js, (j) => j.tokens.cacheWrite), tokCr: sum(js, (j) => j.tokens.cacheRead),
        files: n ? sum(js, (j) => j.files_modified_count) / n : 0,
        broken: sum(replays, (j) => j.replay.broken), replayed: replays.length,
        cleanBuild: replays.filter((j) => j.replay.build_ok && !j.replay.new_tsc_errors).length,
      };
    });
    rows.sort((a, b) => b.rate - a.rate || a.cost - b.cost);
    rows.forEach((r, i) => { r.rank = i + 1; r.tiedTop = r.rate === rows[0].rate; });
    return rows;
  }

  // ------------------------------------------------------------------ tooltip
  const tip = $('#tip');
  function showTip(html, ev, el) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x, y;
    if (ev && ev.clientX != null && ev.type !== 'focus') { x = ev.clientX + 14; y = ev.clientY + 14; }
    else { const b = el.getBoundingClientRect(); x = b.left + b.width / 2 - r.width / 2; y = b.bottom + 8; }
    x = Math.max(8, Math.min(x, innerWidth - r.width - 8));
    if (y + r.height > innerHeight - 8) y = (ev && ev.clientY != null ? ev.clientY : y) - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function bindTip(el, html) {
    const f = typeof html === 'function' ? html : () => html;
    el.addEventListener('mousemove', (e) => showTip(f(), e, el));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', (e) => showTip(f(), e, el));
    el.addEventListener('blur', hideTip);
  }
  const kv = (pairs) => `<div class="kv">${pairs.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`;
  const tipHead = (h, text) => `<div class="tt" style="--series:${series(h)}"><i></i>${esc(text)}</div>`;

  // ------------------------------------------------------------------ chips
  function chips(container, items, key, onChange, counts) {
    container.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(state[key] === it.id));
      b.innerHTML = esc(it.label) + (counts ? `<span class="n">${counts(it.id)}</span>` : '');
      if (it.note) b.title = it.note;
      b.addEventListener('click', () => { state[key] = it.id; onChange(); });
      container.appendChild(b);
    }
    container.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const i = items.findIndex((it) => it.id === state[key]);
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
      state[key] = items[n].id; onChange();
      container.children[n].focus();
    };
  }
  function renderFilters() {
    chips($('#f-set'), SETS, 'set', renderFiltered, (id) => D.jobs.filter((j) => inSet(j, id)).length);
    chips($('#f-kind'), KINDS, 'kind', renderFiltered);
    const jobs = selectJobs(), rows = taskRows(jobs);
    $('#f-note').textContent = `${rows.length} task${rows.length === 1 ? '' : 's'} · ${jobs.length} jobs`;
  }

  // ------------------------------------------------------------------ hero + kpis
  function renderHero(agg) {
    $('#edition').textContent = D.edition;
    $('#hero-meta').innerHTML = `Updated <b>${esc(fmt.date(D.generated_at))}</b> · ${esc(D.provider)} · Planner <b>${esc(D.planner.model)}</b>`;
    const L = agg[0], tied = agg.filter((a) => a.rate === L.rate).length;
    const why = tied > 1 ? `Tied on solve rate with ${tied - 1} other${tied > 2 ? 's' : ''}. Wins on cost.` : 'Highest solve rate.';
    $('#podium').innerHTML = `
      <div class="podium-head"><span class="podium-label">Current leader</span><span class="podium-label">${esc(SETS.find((s) => s.id === state.set).label)}</span></div>
      <div class="podium-leader">${logo(L.h)}<div><div class="podium-leader-name">${esc(hName(L.h))}</div><div class="podium-leader-why">${esc(why)}</div></div></div>
      <div class="podium-stats">
        <div class="podium-stat"><div class="v">${L.solved}/${L.n}</div><div class="k">Solved</div></div>
        <div class="podium-stat"><div class="v">${fmt.usd(L.cost)}</div><div class="k">Total cost</div></div>
        <div class="podium-stat"><div class="v">${fmt.min(L.agent)}</div><div class="k">Agent time</div></div>
      </div>
      <div class="podium-rows">${agg.map((a) => `
        <div class="podium-row"><span class="rk">${a.rank}</span><span class="nm">${esc(hName(a.h))}</span>
          <span class="pips" style="--series:${series(a.h)}" aria-label="${a.solved} of ${a.n} solved">${Array.from({ length: a.n }, (_, i) => `<i class="${i < a.solved ? 'on' : ''}" style="animation-delay:${i * 60}ms"></i>`).join('')}</span>
          <span class="val">${fmt.usd(a.cost)}</span></div>`).join('')}
      </div>`;
  }

  function renderKpis() {
    const all = D.jobs, bugs = D.tasks.filter((t) => t.kind === 'bug').length;
    const replays = all.filter((j) => j.replay);
    const tests = replays.map((j) => j.replay.web_total + j.replay.app_total);
    const avgTests = tests.length ? sum(tests, (x) => x) / tests.length : 0;
    const broken = sum(replays, (j) => j.replay.broken);
    const clean = replays.filter((j) => !j.replay.broken && j.replay.build_ok && !j.replay.new_tsc_errors).length;
    const items = [
      { k: 'Harnesses', v: H_ORDER.length, s: H_ORDER.map(hName).join(' · ') },
      { k: 'Tasks', v: D.tasks.length, s: `${bugs} bugs · ${D.tasks.length - bugs} features` },
      { k: 'Graded jobs', v: all.length, s: 'single attempt, max 2 turns' },
      { k: 'Tests per replay', v: Math.round(avgTests), s: `${fmt.int(Math.min(...tests))}–${fmt.int(Math.max(...tests))} per job`, f: fmt.int },
      { k: 'Regressions', v: broken, s: `<span class="ok">${clean} of ${replays.length}</span> patches clean` },
      { k: 'Spend', v: D.budget.spent_usd, s: `of a $${D.budget.limit_usd} budget`, f: fmt.usd },
    ];
    const box = $('#kpis');
    box.innerHTML = items.map((it, i) => `<div class="kpi"><p class="k">${esc(it.k)}</p><p class="v" data-i="${i}">${(it.f || String)(it.v)}</p><p class="s">${it.s}</p></div>`).join('');
    if (reduceMotion) return;
    // Count up once when visible.
    const io = new IntersectionObserver((ents) => {
      if (!ents.some((e) => e.isIntersecting)) return;
      io.disconnect();
      box.querySelectorAll('.v').forEach((el) => {
        const it = items[+el.dataset.i], f = it.f || ((x) => String(Math.round(x))), t0 = performance.now();
        const step = (t) => { const p = Math.min(1, (t - t0) / 900), e = 1 - (1 - p) ** 3; el.textContent = f(it.v * e); if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    io.observe(box);
  }

  // ------------------------------------------------------------------ 01 table
  const COLS = [
    { key: 'rank', label: '#', l: true, get: (a) => a.rank },
    { key: 'h', label: 'Harness', l: true, get: (a) => hName(a.h) },
    { key: 'rate', label: 'Solve rate', get: (a) => a.rate, better: 'max', title: 'Final pass on either turn. Whisker: 95% Wilson interval.' },
    { key: 't1', label: 'First try', get: (a) => a.t1 / (a.n || 1), better: 'max', title: 'Solved on turn 1' },
    { key: 't2', label: 'Turn-2 rescue', get: (a) => a.t2Rescued, title: 'Failures solved by the retry' },
    { key: 'cost', label: 'Cost', get: (a) => a.cost, better: 'min' },
    { key: 'cps', label: '$ / solve', get: (a) => a.costPerSolve ?? Infinity, better: 'min' },
    { key: 'agent', label: 'Agent time', get: (a) => a.agent, better: 'min', title: 'Time inside the harness process' },
    { key: 'wall', label: 'Wall time', get: (a) => a.wall, better: 'min', title: 'Agent time + grading' },
    { key: 'tokens', label: 'Tokens', get: (a) => a.tokens, better: 'min', title: 'Input + output + cache read + cache write' },
    { key: 'calls', label: 'Calls', get: (a) => a.calls, better: 'min', title: 'Model API calls' },
    { key: 'files', label: 'Files / job', get: (a) => a.files, title: 'Mean files changed in the final patch' },
    { key: 'broken', label: 'Broken tests', get: (a) => a.broken, better: 'min', title: 'Baseline tests broken in the full replay' },
  ];

  function cellHtml(c, a) {
    switch (c.key) {
      case 'rank': return `<span class="rank ${a.rank === 1 ? 'r1' : ''}">${a.rank === 1 ? ICON.crown : ''}${a.rank}</span>`;
      case 'h': return `<div class="h-cell">${logo(a.h)}<div><div class="h-name">${esc(hName(a.h))}${a.tiedTop && a.rank > 1 ? '<span class="tie">tied</span>' : ''}</div><div class="h-ver">v${esc(D.harnesses[a.h].version)}</div></div></div>`;
      case 'rate': {
        const [lo, hi] = a.ci;
        return `<span class="rate-cell"><span class="rate-bar" style="--series:${series(a.h)}"><span class="track"></span><span class="fill" style="width:${a.rate * 100}%"></span><span class="ci" style="left:${lo * 100}%;width:${(hi - lo) * 100}%"></span></span><span class="rate-val">${fmt.pct(a.rate)}<small>${a.solved}/${a.n}</small></span></span>`;
      }
      case 't1': return `${a.t1}/${a.n}`;
      case 't2': return a.t2Tried ? `${a.t2Rescued}/${a.t2Tried}` : '—';
      case 'cost': return fmt.usd(a.cost);
      case 'cps': return fmt.usd(a.costPerSolve);
      case 'agent': return fmt.min(a.agent);
      case 'wall': return fmt.min(a.wall);
      case 'tokens': return fmt.tok(a.tokens);
      case 'calls': return fmt.int(a.calls);
      case 'files': return a.files.toFixed(1);
      case 'broken': return `${a.broken}<span class="h-ver"> / ${a.replayed}</span>`;
      default: return '';
    }
  }

  function renderTable(agg) {
    const t = $('#lb-table');
    const best = {};
    for (const c of COLS) {
      if (!c.better || agg.length < 2) continue;
      const vals = agg.map(c.get), b = c.better === 'max' ? Math.max(...vals) : Math.min(...vals);
      if (vals.every((v) => v === b)) continue; // all tied: no highlight
      best[c.key] = b;
    }
    const sorted = [...agg];
    const sc = COLS.find((c) => c.key === state.sort.key);
    if (sc) sorted.sort((a, b) => { const x = sc.get(a), y = sc.get(b); return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * state.sort.dir; });

    const head = `<thead><tr>${COLS.map((c) => {
      const s = state.sort.key === c.key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : null;
      return `<th class="${c.l ? 'l' : ''}" ${s ? `aria-sort="${s}"` : ''} scope="col"><button type="button" data-k="${c.key}" ${c.title ? `title="${esc(c.title)}"` : ''}>${esc(c.label)}<svg class="arrow" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 7 0 2h8z" fill="currentColor"/></svg></button></th>`;
    }).join('')}</tr></thead>`;
    const body = sorted.map((a) => {
      const tds = COLS.map((c) => `<td class="${c.l ? 'l' : ''} ${best[c.key] !== undefined && c.get(a) === best[c.key] ? 'best' : ''}">${cellHtml(c, a)}</td>`).join('');
      const open = state.open.has(a.h);
      const sub = open ? `<tr class="sub-row"><td colspan="${COLS.length}"><div class="sub-tasks">${a.jobs.map((j) => `<button type="button" class="sub-task" data-job="${esc(jobId(j))}">${j.final_pass ? `<span class="status ok">${ICON.ok}</span>` : `<span class="status no">${ICON.no}</span>`}<b>${esc(rowKey(j))}</b><span class="meta">${fmt.usd(j.cost_usd)} · ${fmt.min(j.agent_sec)} · T${j.turns_taken}</span></button>`).join('')}</div></td></tr>` : '';
      return `<tr class="row" tabindex="0" aria-expanded="${open}" data-h="${a.h}" style="--series:${series(a.h)}">${tds}</tr>${sub}`;
    }).join('');
    t.innerHTML = head + `<tbody>${body}</tbody>`;
    t.querySelectorAll('thead button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k, c = COLS.find((x) => x.key === k);
      if (state.sort.key === k) state.sort.dir *= -1;
      else state.sort = { key: k, dir: c.better === 'max' || k === 't2' ? -1 : 1 };
      renderTable(agg);
    }));
    t.querySelectorAll('tr.row').forEach((r) => {
      const toggle = () => { const h = r.dataset.h; state.open.has(h) ? state.open.delete(h) : state.open.add(h); renderTable(agg); };
      r.addEventListener('click', toggle);
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
    t.querySelectorAll('.sub-task').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openJob(b.dataset.job, b); }));

    // Phone layout: one card per harness, same numbers, same best-value marks.
    const CARD = ['t1', 't2', 'cost', 'cps', 'agent', 'wall', 'tokens', 'calls', 'broken'];
    const cards = $('#lb-cards');
    cards.innerHTML = agg.map((a) => `<article class="lb-card" style="--series:${series(a.h)}">
      <div class="lb-card-head">${cellHtml(COLS[0], a)}${logo(a.h)}<div><div class="h-name">${esc(hName(a.h))}${a.tiedTop && a.rank > 1 ? '<span class="tie">tied</span>' : ''}</div><div class="h-ver">v${esc(D.harnesses[a.h].version)}</div></div>
        <div class="lb-card-rate">${fmt.pct(a.rate)}<small>${a.solved}/${a.n} · CI ${a.ci.map(fmt.pct).join('–')}</small></div></div>
      <span class="rate-bar" style="display:block"><span class="track"></span><span class="fill" style="width:${a.rate * 100}%"></span><span class="ci" style="left:${a.ci[0] * 100}%;width:${(a.ci[1] - a.ci[0]) * 100}%"></span></span>
      <dl class="lb-card-grid">${CARD.map((k) => { const c = COLS.find((x) => x.key === k); return `<div><dt>${esc(c.label)}</dt><dd class="${best[k] !== undefined && c.get(a) === best[k] ? 'best' : ''}">${cellHtml(c, a)}</dd></div>`; }).join('')}</dl>
      <div class="sub-tasks">${a.jobs.map((j) => `<button type="button" class="sub-task" data-job="${esc(jobId(j))}">${j.final_pass ? `<span class="status ok">${ICON.ok}</span>` : `<span class="status no">${ICON.no}</span>`}<b>${esc(rowKey(j))}</b><span class="meta">${fmt.usd(j.cost_usd)}</span></button>`).join('')}</div>
    </article>`).join('');
    cards.querySelectorAll('.sub-task').forEach((b) => b.addEventListener('click', () => openJob(b.dataset.job, b)));

    const L = agg[0], tied = agg.filter((a) => a.rate === L.rate);
    const worst = [...tied].sort((a, b) => b.cost - a.cost)[0];
    $('#board-headline').innerHTML = tied.length > 1
      ? `${tied.length === agg.length ? 'All three' : esc(tied.map((a) => hName(a.h)).join(' and '))} solve ${L.solved} of ${L.n}. <em>${esc(hName(L.h))}</em> does it for ${Math.round((L.cost / worst.cost) * 100)}% of the cost.`
      : `<em>${esc(hName(L.h))}</em> leads with ${L.solved} of ${L.n} solved.`;
    const ci = L.ci.map((x) => fmt.pct(x)).join('–');
    $('#board-foot').textContent = `With ${L.n} tasks and one attempt each, the 95% interval on ${L.solved}/${L.n} is ${ci}. Read equal solve rates as a tie; cost and time separate the harnesses.`;
  }
  const jobId = (j) => `${j.task}|${j.variant}|${j.harness}`;

  // ------------------------------------------------------------------ 02 scatter
  function renderScatter(agg) {
    const box = $('#scatter');
    const W = Math.max(300, box.clientWidth), narrow = W < 560;
    const H = Math.round(Math.min(440, Math.max(300, W * 0.48)));
    const m = { l: 54, r: narrow ? 24 : 130, t: 18, b: 50 };
    const X = XS.find((x) => x.id === state.x);
    const pts = agg.map((a) => ({ a, x: X.get(a), y: a.rate }));
    const ticks = niceTicks(Math.max(...pts.map((p) => p.x)) * 1.08);
    const xMax = ticks[ticks.length - 1];
    const sx = (v) => m.l + (v / xMax) * (W - m.l - m.r);
    const sy = (v) => m.t + (1 - v) * (H - m.t - m.b);
    box.innerHTML = '';
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Solve rate versus ${X.axis.toLowerCase()} per harness` }, box);

    // Grid + axes
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      svg('line', { x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v), class: v === 0 ? 'baseline' : 'gridline' }, s);
      svgText(s, m.l - 10, sy(v) + 4, fmt.pct(v), 'tick', 'end');
    }
    for (const v of ticks) {
      if (v > 0) svg('line', { x1: sx(v), x2: sx(v), y1: m.t, y2: H - m.b, class: 'gridline' }, s);
      svgText(s, sx(v), H - m.b + 18, X.tick(v), 'tick', 'middle');
    }
    svgText(s, m.l + (W - m.l - m.r) / 2, H - 8, X.axis, 'ax-label', 'middle');
    const yl = svgText(s, 14, m.t + (H - m.t - m.b) / 2, 'Solve rate', 'ax-label', 'middle');
    yl.setAttribute('transform', `rotate(-90 14 ${m.t + (H - m.t - m.b) / 2})`);

    // Pareto frontier (lower x, higher y is better)
    const byX = [...pts].sort((p, q) => p.x - q.x || q.y - p.y);
    const front = []; let bestY = -1;
    for (const p of byX) if (p.y > bestY) { front.push(p); bestY = p.y; }
    const frontSet = new Set(front.map((p) => p.a.h));
    let d = `M${sx(front[0].x)},${sy(front[0].y)}`;
    for (let i = 1; i < front.length; i++) d += ` H${sx(front[i].x)} V${sy(front[i].y)}`;
    d += ` H${W - m.r}`;
    svg('path', { d: `${d} V${sy(0)} H${sx(front[0].x)} Z`, class: 'dominated' }, s);
    const fp = svg('path', { d, class: 'frontier' }, s);
    if (!reduceMotion) {
      const len = fp.getTotalLength(); fp.style.strokeDasharray = len; fp.style.strokeDashoffset = len;
      fp.getBoundingClientRect(); fp.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)'; fp.style.strokeDashoffset = 0;
    }

    // Dots with CI whiskers and direct labels (placed to avoid other labels, dots and the frontier line)
    const boxes = pts.map((p) => ({ x1: sx(p.x) - 11, x2: sx(p.x) + 11, y1: sy(p.y) - 11, y2: sy(p.y) + 11 }));
    const hit = (b) => boxes.some((o) => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
    const valText = (p) => (X.id === 'cost' ? fmt.usd(p.x) : X.id === 'agent' ? Math.round(p.x) + ' min' : X.id === 'tokens' ? p.x.toFixed(1) + 'M' : fmt.int(p.x));
    for (const p of [...pts].sort((a, b) => a.x - b.x)) {
      const cx = sx(p.x), cy = sy(p.y), [lo, hi] = p.a.ci;
      const g = svg('g', { class: `dot-g ${frontSet.has(p.a.h) ? '' : 'faded'}`, tabindex: 0, role: 'button', 'aria-label': `${hName(p.a.h)}: ${fmt.pct(p.y)} solved, ${X.label} ${valText(p)}` }, s);
      svg('line', { x1: cx, x2: cx, y1: sy(hi), y2: sy(lo), class: 'whisker' }, g);
      svg('line', { x1: cx - 5, x2: cx + 5, y1: sy(hi), y2: sy(hi), class: 'whisker' }, g);
      svg('line', { x1: cx - 5, x2: cx + 5, y1: sy(lo), y2: sy(lo), class: 'whisker' }, g);
      svg('circle', { cx, cy, r: 18, class: 'dot-hit' }, g);
      svg('circle', { cx, cy, r: 8, class: 'dot', style: `fill:${series(p.a.h)}` }, g);
      const name = svgText(g, 0, 0, hName(p.a.h), 'dot-label'), val = svgText(g, 0, 0, valText(p), 'dot-sub');
      const tw = Math.max(name.getComputedTextLength(), val.getComputedTextLength());
      // candidates: [dx, name baseline dy, anchor]
      const cands = [[10, -30, 'start'], [10, 30, 'start'], [-10, -30, 'end'], [-10, 30, 'end'], [10, -58, 'start'], [10, 58, 'start'], [-10, -58, 'end']];
      let chosen = null;
      for (const [dx, dy, an] of cands) {
        const x1 = an === 'start' ? cx + dx : cx + dx - tw, b = { x1: x1 - 2, x2: x1 + tw + 2, y1: cy + dy - 13, y2: cy + dy + 17 };
        if (b.x1 < m.l || b.x2 > W - 2 || b.y1 < 0 || b.y2 > H - m.b) continue;
        if (!hit(b)) { chosen = { dx, dy, an, b }; break; }
      }
      if (!chosen) chosen = { dx: 10, dy: -26, an: 'start', b: null };
      for (const [el, off] of [[name, 0], [val, 15]]) { el.setAttribute('x', cx + chosen.dx); el.setAttribute('y', cy + chosen.dy + off); el.setAttribute('text-anchor', chosen.an); }
      if (chosen.b) boxes.push(chosen.b);
      const html = () => tipHead(p.a.h, hName(p.a.h)) + kv([
        ['Solved', `${p.a.solved}/${p.a.n} (${fmt.pct(p.a.rate)})`], ['95% CI', p.a.ci.map(fmt.pct).join('–')],
        ['Cost', fmt.usd(p.a.cost)], ['Agent time', fmt.min(p.a.agent)], ['Tokens', fmt.tok(p.a.tokens)], ['Calls', fmt.int(p.a.calls)],
        ['Frontier', frontSet.has(p.a.h) ? 'yes' : 'dominated'],
      ]);
      bindTip(g, html);
      g.addEventListener('click', () => openHarness(p.a.h, g));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHarness(p.a.h, g); } });
    }

    $('#scatter-legend').innerHTML = agg.map((a) => `<span><i class="sw" style="background:${series(a.h)}"></i>${esc(hName(a.h))}</span>`).join('')
      + '<span><i style="width:22px;border-top:2px solid var(--ink-bright)"></i>Pareto frontier</span><span><i class="sq" style="background:var(--ink);opacity:.12"></i>Dominated region</span><span>Faded dots are dominated · whisker = 95% CI</span>';

    const names = front.map((p) => hName(p.a.h));
    const others = pts.filter((p) => !frontSet.has(p.a.h));
    let head;
    if (front.length === 1 && others.length) {
      const worst = others.sort((a, b) => b.x - a.x)[0];
      const ratio = worst.x / (front[0].x || 1);
      head = `<em>${esc(names[0])}</em> is alone on the frontier: ${ratio >= 1.15 ? `${ratio.toFixed(1)}× less ${esc(X.label.toLowerCase())} than ${esc(hName(worst.a.h))}` : 'nobody beats it on both axes'}.`;
    } else head = `${esc(names.join(' and '))} share the frontier on ${esc(X.label.toLowerCase())}.`;
    $('#frontier-headline').innerHTML = head;
  }

  // ------------------------------------------------------------------ 03 matrix
  function renderMatrix(jobs) {
    const rows = taskRows(jobs), grid = $('#matrix-grid');
    const metric = { cost: (j) => j.cost_usd, agent: (j) => j.agent_sec, tokens: (j) => totTok(j.tokens) }[state.cell];
    const vals = metric ? jobs.map(metric) : [];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const step = (v) => (hi === lo ? 2 : Math.min(5, Math.floor(((v - lo) / (hi - lo)) * 5.999)));
    const dark = isDark();
    let html = `<div class="mx-h">Task</div>` + H_ORDER.map((h) => `<div class="mx-h" style="--series:${series(h)}"><span class="sw"></span>${esc(hName(h))}</div>`).join('');
    for (const key of rows) {
      const L = rowLabel(key), t = taskByCode[L.code];
      html += `<div class="mx-task"><div class="code">${esc(L.code)}${L.tag ? `<span class="kind">${esc(L.tag)}</span>` : ''}<span class="kind ${t.kind}">${t.kind}</span></div><div class="ttl">${esc(t.title)}${L.note ? ` · ${esc(L.note)}` : ''}</div></div>`;
      for (const h of H_ORDER) {
        const j = jobs.find((x) => rowKey(x) === key && x.harness === h);
        if (!j) { html += '<div></div>'; continue; }
        const turn = j.final_pass ? `<span class="long">Turn ${j.turn_1_pass ? 1 : 2}</span><span class="short">T${j.turn_1_pass ? 1 : 2}</span>` : `<span class="long">${j.turns_taken} turns</span><span class="short">×${j.turns_taken}</span>`;
        if (!metric) {
          html += `<button type="button" class="mx-cell ${j.final_pass ? 'ok' : 'no'}" data-job="${esc(jobId(j))}">${status(j.final_pass, j.final_pass ? 'Solved' : 'Failed')}<span class="meta">${turn} · ${fmt.usd(j.cost_usd)}</span></button>`;
        } else {
          const v = metric(j), st = step(v);
          const inkLight = dark ? st >= 4 : st >= 3;
          const val = state.cell === 'cost' ? fmt.usd(v) : state.cell === 'agent' ? fmt.min(v) : fmt.tok(v);
          html += `<button type="button" class="mx-cell seq" data-job="${esc(jobId(j))}" style="background:var(--seq-${st});border-color:transparent;--seq-ink:${inkLight ? (dark ? '#0B0D12' : '#FFFFFF') : 'var(--ink-bright)'}"><span class="big">${val}</span><span class="meta">${j.final_pass ? '✓ solved' : '✕ failed'} · ${turn}</span></button>`;
        }
      }
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.mx-cell').forEach((c) => {
      const j = D.jobs.find((x) => jobId(x) === c.dataset.job);
      bindTip(c, () => tipHead(j.harness, `${hName(j.harness)} · ${rowKey(j)}`) + kv([
        ['Outcome', j.final_pass ? `solved on turn ${j.turn_1_pass ? 1 : 2}` : `failed after ${j.turns_taken} turns`],
        ['Cost', fmt.usd(j.cost_usd)], ['Agent time', fmt.min(j.agent_sec)], ['Tokens', fmt.tok(totTok(j.tokens))], ['Files changed', j.files_modified_count],
      ]) + '<div style="margin-top:6px;opacity:.7">Click for the turn record</div>');
      c.addEventListener('click', () => { hideTip(); openJob(c.dataset.job, c); });
    });
    $('#matrix-legend').innerHTML = metric
      ? `<span>Lighter = less, darker = more</span>${[0, 1, 2, 3, 4, 5].map((i) => `<i class="sq" style="background:var(--seq-${i})"></i>`).join('')}<span>${state.cell === 'cost' ? fmt.usd(lo) + ' → ' + fmt.usd(hi) : state.cell === 'agent' ? fmt.min(lo) + ' → ' + fmt.min(hi) : fmt.tok(lo) + ' → ' + fmt.tok(hi)}</span>`
      : `<span>${status(true, 'Solved')}</span><span>${status(false, 'Failed after retry')}</span><span>Cell text: turn that passed · job cost</span>`;
    const unanimous = rows.filter((k) => new Set(jobs.filter((j) => rowKey(j) === k).map((j) => j.final_pass)).size === 1).length;
    $('#matrix-headline').innerHTML = unanimous === rows.length
      ? `Every task ended the same way for all three harnesses. <em>The task decided the outcome.</em>`
      : `${unanimous} of ${rows.length} tasks ended the same way for every harness.`;
  }

  // ------------------------------------------------------------------ 04 economics
  function renderCostBars(jobs) {
    const box = $('#cost-bars'), rows = taskRows(jobs);
    const W = Math.max(280, box.clientWidth), bar = 12, gap = 3, pad = 16, lw = 64, rw = 52;
    const rowH = H_ORDER.length * bar + (H_ORDER.length - 1) * gap + pad;
    const H = rows.length * rowH + 30;
    const ticks = niceTicks(Math.max(...jobs.map((j) => j.cost_usd)) * 1.02, 4), xMax = ticks[ticks.length - 1];
    const sx = (v) => lw + (v / xMax) * (W - lw - rw);
    box.innerHTML = '';
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Cost per task and harness' }, box);
    for (const v of ticks) {
      svg('line', { x1: sx(v), x2: sx(v), y1: 0, y2: H - 24, class: v === 0 ? 'baseline' : 'gridline' }, s);
      svgText(s, sx(v), H - 8, '$' + v, 'tick', 'middle');
    }
    rows.forEach((key, i) => {
      const y0 = i * rowH + pad / 2, L = rowLabel(key);
      svgText(s, 0, y0 + rowH / 2 - 2, L.code + (L.tag ? ' ' + L.tag : ''), 'dot-label');
      svgText(s, 0, y0 + rowH / 2 + 12, taskByCode[L.code].kind, 'dot-sub');
      H_ORDER.forEach((h, k) => {
        const j = jobs.find((x) => rowKey(x) === key && x.harness === h);
        if (!j) return;
        const y = y0 + k * (bar + gap), x1 = sx(j.cost_usd), w = Math.max(2, x1 - sx(0));
        const g = svg('g', { tabindex: 0, role: 'img', 'aria-label': `${hName(h)} ${key}: ${fmt.usd(j.cost_usd)}` }, s);
        svg('path', { d: `M${sx(0)},${y} H${sx(0) + w - 4} a4,4 0 0 1 4,4 V${y + bar - 4} a4,4 0 0 1 -4,4 H${sx(0)} Z`, style: `fill:${series(h)}` }, g);
        svg('rect', { x: sx(0), y: y - 1, width: W - lw, height: bar + 2, fill: 'transparent' }, g);
        svgText(g, x1 + 6, y + bar - 2, fmt.usd(j.cost_usd), 'tick');
        bindTip(g, () => tipHead(h, `${hName(h)} · ${key}`) + kv([['Cost', fmt.usd(j.cost_usd)], ['Turns', j.turns_taken], ['Outcome', j.final_pass ? 'solved' : 'failed']]));
        g.addEventListener('click', () => openJob(jobId(j), g));
      });
    });
    $('#cost-legend').innerHTML = H_ORDER.map((h) => `<span><i class="sw" style="background:${series(h)}"></i>${esc(hName(h))}</span>`).join('');
  }

  function renderTokenMix(agg) {
    const dark = isDark();
    const segs = [
      { k: 'tokIn', label: 'Fresh input + output', c: 'var(--tok-a)', ink: dark ? 'light' : '' },
      { k: 'tokCw', label: 'Cache write', c: 'var(--tok-b)', ink: dark ? '' : 'light' },
      { k: 'tokCr', label: 'Cache read', c: 'var(--tok-c)', ink: dark ? '' : 'light' },
    ];
    const box = $('#token-mix');
    const barW = Math.max(120, box.clientWidth - 124 - 56 - 24);
    const maxTok = Math.max(...agg.map((a) => a.tokens)) || 1;
    box.innerHTML = H_ORDER.map((h) => agg.find((a) => a.h === h)).map((a) => {
      const tot = a.tokens || 1, rel = tot / maxTok;
      return `<div class="mix-row"><span class="mix-name" style="--series:${series(a.h)}"><span class="sw"></span>${esc(hName(a.h))}</span><div class="mix-track"><div class="mix-bar" style="width:${Math.max(2, rel * 100)}%">${segs.map((sg) => {
        const share = a[sg.k] / tot, w = share * barW * rel, label = share >= 0.005 ? (share * 100 < 1 ? '<1%' : Math.round(share * 100) + '%') : '';
        return share > 0 ? `<span class="mix-seg ${sg.ink}" data-h="${a.h}" data-k="${sg.k}" style="flex:${share} 1 0;background:${sg.c}">${w > 40 ? label : ''}</span>` : '';
      }).join('')}</div></div><span class="mix-total">${fmt.tok(a.tokens)}</span></div>`;
    }).join('');
    box.querySelectorAll('.mix-seg').forEach((el) => {
      const a = agg.find((x) => x.h === el.dataset.h), sg = segs.find((x) => x.k === el.dataset.k);
      el.tabIndex = 0;
      bindTip(el, () => tipHead(a.h, `${hName(a.h)} · ${sg.label}`) + kv([['Tokens', fmt.int(a[sg.k])], ['Share', ((a[sg.k] / a.tokens) * 100).toFixed(1) + '%']]));
    });
    $('#token-legend').innerHTML = segs.map((sg) => `<span><i class="sq" style="background:${sg.c}"></i>${esc(sg.label)}</span>`).join('');
    $('#per-call').innerHTML = '<p class="per-call-title">Context per model call</p>' + H_ORDER.map((h) => agg.find((a) => a.h === h)).map((a) => `<div style="--series:${series(a.h)}"><div class="h"><span class="sw"></span>${esc(hName(a.h))}</div><div class="v">${a.calls ? fmt.tok(a.tokens / a.calls) : '—'}</div><div class="k">tokens / call · ${fmt.int(a.calls)} calls</div></div>`).join('');
    const byCost = [...agg].sort((a, b) => a.cost - b.cost), lo = byCost[0], hi = byCost[byCost.length - 1];
    const sameRate = lo.rate === hi.rate;
    $('#econ-headline').innerHTML = `${esc(hName(hi.h))} spent <em>${(hi.cost / lo.cost).toFixed(1)}×</em> what ${esc(hName(lo.h))} spent${sameRate ? ' for the same result' : ''}, and read ${(hi.tokCr / Math.max(1, lo.tokCr)).toFixed(1)}× more cached tokens.`;
  }

  // ------------------------------------------------------------------ 05 reliability
  function renderReliability(jobs, agg) {
    const rows = taskRows(jobs);
    $('#agreement').innerHTML = rows.map((key) => {
      const js = H_ORDER.map((h) => jobs.find((j) => rowKey(j) === key && j.harness === h)).filter(Boolean);
      const same = new Set(js.map((j) => j.final_pass)).size === 1, L = rowLabel(key);
      return `<div class="agree-row"><span class="agree-task">${esc(L.code)}${L.tag ? ' ' + esc(L.tag) : ''}<span>${esc(taskByCode[L.code].title)}</span></span><span class="agree-dots">${js.map((j) => `<span class="agree-dot ${j.final_pass ? 'ok' : 'no'}" style="--series:${series(j.harness)}" title="${esc(hName(j.harness))}: ${j.final_pass ? 'solved' : 'failed'}">${j.final_pass ? ICON.tick : ICON.cross}</span>`).join('')}</span><span class="agree-tag ${same ? '' : 'split'}">${same ? 'Unanimous' : 'Split'}</span></div>`;
    }).join('') + `<p class="note">Ring colour = harness. ✓ solved, ✕ failed. ${rows.length ? '' : 'No tasks in this filter.'}</p>`;

    const tried = sum(agg, (a) => a.t2Tried), rescued = sum(agg, (a) => a.t2Rescued), t2cost = sum(agg, (a) => a.t2Cost);
    const hasB3 = rows.includes('B3'), hasF2v1 = rows.includes('F2·v1');
    const causes = [hasB3 && 'B3: the shared plan pointed at the web form; the real fix is in the server-side mapper', hasF2v1 && 'F2 v1: the ticket did not name the labels the hidden tests query'].filter(Boolean);
    $('#turn2').innerHTML = tried
      ? `<div class="big-stat"><span class="v">${rescued}/${tried}</span><span class="k">retries rescued</span></div>${H_ORDER.map((h) => agg.find((a) => a.h === h)).map((a) => {
        const js = a.jobs.filter((j) => j.turns_taken > 1);
        return `<div class="t2-row"><span class="nm" style="--series:${series(a.h)}"><span class="sw"></span>${esc(hName(a.h))}</span><span class="t2-pips">${js.length ? js.map((j) => `<span class="pip ${j.turn_2_pass ? 'ok' : ''}" title="${esc(rowKey(j))}: ${j.turn_2_pass ? 'rescued' : 'still failing'}">${j.turn_2_pass ? ICON.tick : ICON.cross}</span>`).join('') : '<span class="t2-cost">no retries</span>'}</span><span class="t2-cost">${fmt.usd(a.t2Cost)}</span></div>`;
      }).join('')}<p class="note">${fmt.usd(t2cost)} spent on turn 2${rescued ? '' : ' with no rescue'}. ${causes.length ? (causes.length > 1 ? 'Both causes sat upstream of the harness. ' : 'The cause sat upstream of the harness. ') + esc(causes.join('. ')) + '.' : ''}</p>`
      : `<div class="big-stat"><span class="v">0</span><span class="k">retries needed</span></div><p class="note">Every job in this filter passed on turn 1.</p>`;

    const reps = jobs.filter((j) => j.replay);
    const tests = sum(reps, (j) => j.replay.web_total + j.replay.app_total);
    const broken = sum(reps, (j) => j.replay.broken), builds = reps.filter((j) => j.replay.build_ok).length;
    const tsc = sum(reps, (j) => j.replay.new_tsc_errors);
    const order = [...reps].sort((a, b) => taskRows(D.jobs).indexOf(rowKey(a)) - taskRows(D.jobs).indexOf(rowKey(b)) || H_ORDER.indexOf(a.harness) - H_ORDER.indexOf(b.harness));
    $('#replay').innerHTML = `<div class="big-stat"><span class="v">${reps.length - reps.filter((j) => j.replay.broken || !j.replay.build_ok || j.replay.new_tsc_errors).length}/${reps.length}</span><span class="k">patches clean</span></div>
      <div class="replay-grid">${order.map((j) => { const bad = j.replay.broken || !j.replay.build_ok || j.replay.new_tsc_errors; return `<button type="button" class="replay-tile ${bad ? 'bad' : ''}" style="--series:${series(j.harness)}" data-job="${esc(jobId(j))}" aria-label="${esc(hName(j.harness))} ${esc(rowKey(j))} replay">${bad ? ICON.cross : ICON.tick}</button>`; }).join('')}</div>
      <div class="replay-facts"><div class="fact"><div class="v">${fmt.int(tests)}</div><div class="k">Test runs</div></div><div class="fact"><div class="v">${broken}</div><div class="k">Tests broken</div></div><div class="fact"><div class="v">${builds}/${reps.length}</div><div class="k">Builds OK</div></div><div class="fact"><div class="v">${tsc}</div><div class="k">New type errors</div></div></div>
      <p class="note">Includes failed jobs: a wrong fix must still not break anything. Hidden test files are excluded from the regression count.</p>`;
    $('#replay').querySelectorAll('.replay-tile').forEach((el) => {
      const j = D.jobs.find((x) => jobId(x) === el.dataset.job);
      bindTip(el, () => tipHead(j.harness, `${hName(j.harness)} · ${rowKey(j)}`) + kv([
        ['Web suite', `${fmt.int(j.replay.web_passed)}/${fmt.int(j.replay.web_total)}`], ['Service suite', `${fmt.int(j.replay.app_passed)}/${fmt.int(j.replay.app_total)}`],
        ['Broken', j.replay.broken], ['Build', j.replay.build_ok ? 'OK' : 'FAIL'], ['New tsc errors', j.replay.new_tsc_errors],
      ]));
      el.addEventListener('click', () => { hideTip(); openJob(el.dataset.job, el); });
    });

    $('#rel-headline').innerHTML = `Harness choice moved the cost, not the outcome. ${tried ? `Turn 2 rescued <em>${rescued} of ${tried}</em> retries.` : ''}`;
  }

  // ------------------------------------------------------------------ 06 tasks
  function renderTasks() {
    const routeModel = (r) => D.coder_models[r];
    $('#tasks-sub').textContent = `${D.codebase.kind}. ${D.codebase.stack}, ${D.codebase.tests}. Each ticket was closed by a merged pull request. We check out the commit before the fix, hide the tests the fix added, and ask each harness to solve the ticket. Ticket text, repository names, and file paths stay internal.`;
    $('#task-grid').innerHTML = D.tasks.map((t) => {
      const res = (variant) => H_ORDER.map((h) => D.jobs.find((j) => j.task === t.code && j.harness === h && (!variant || j.variant === variant))).filter(Boolean)
        .map((j) => `<button type="button" class="sub-task" data-job="${esc(jobId(j))}">${j.final_pass ? `<span class="status ok">${ICON.ok}</span>` : `<span class="status no">${ICON.no}</span>`}<b style="font-family:var(--font)">${esc(hName(j.harness))}</b>${variant ? `<span class="meta">${variant}</span>` : ''}</button>`).join('');
      const results = t.code === 'F2' ? res('v1') + res('v2') : res(null);
      return `<article class="card task-card ${t.kind}">
        <div class="task-top"><span class="task-code">${esc(t.code)}</span><span class="task-tags"><span class="kind ${t.kind}">${t.kind}</span><span class="kind">${esc(t.layer)}</span><span class="kind">${esc(t.complexity)}</span></span></div>
        <h3 class="task-title">${esc(t.title)}</h3>
        <p class="task-sum">${esc(t.summary)}</p>
        <div class="task-facts">
          <div><b>${t.fail_to_pass}</b>fail → pass tests</div><div><b>${t.pass_to_pass}</b>pass → pass tests</div>
          <div><b>${fmt.int(t.baseline_tests)}</b>baseline tests</div><div><b>${t.fix_source_files}</b>source files in real fix</div>
          <div><b>${esc(t.stack)}</b>area</div><div><b>${esc(routeModel(t.route))}</b>coder (${t.route === 'small_task' ? 'small' : 'big'} route)</div>
        </div>
        ${t.code === 'F2' ? `<p class="variant-note"><b>v1</b> ${esc(D.variants.v1)}<br><b>v2</b> ${esc(D.variants.v2)}</p>` : ''}
        <div class="task-result">${results}</div>
      </article>`;
    }).join('');
    $('#task-grid').querySelectorAll('.sub-task').forEach((b) => b.addEventListener('click', () => openJob(b.dataset.job, b)));
  }

  // ------------------------------------------------------------------ 07 method
  function renderMethod() {
    const steps = [
      ['Ticket', 'A closed ticket from our backlog. The base is the commit before the merged fix.', null],
      ['Router', 'Rule-based: bug and feature words, complexity, fix size. Picks the small or big route.', 'small · big'],
      ['Planner', 'Writes one PLAN.md per ticket. Every harness gets the same plan text.', D.planner.model],
      ['Coder', 'The harness under test runs the plan in its own sandbox, one job at a time.', `${D.coder_models.small_task} · ${D.coder_models.big_task}`],
      ['Grader', 'Hidden tests from the fix, a regression check, the build, and the type check.', 'vitest · vite · tsc'],
      ['Retry', 'On a fail: one more turn with the failing checks, never the hidden test code.', 'max 2 turns'],
    ];
    $('#pipeline').innerHTML = steps.map(([t, d, c], i) => `<li class="pipe-step"><span class="n">Step ${String(i + 1).padStart(2, '0')}</span><h4>${esc(t)}</h4><p>${esc(d)}</p>${c ? `<span class="chip-model">${esc(c)}</span>` : ''}</li>`).join('');
    const li = (a) => a.map((x) => `<li>${x}</li>`).join('');
    $('#pass-rules').innerHTML = li([
      '<b>Fail → pass:</b> every test the real fix added now passes.',
      '<b>Pass → pass:</b> the related tests that passed before still pass.',
      '<b>No regression:</b> no test that passed on the base commit breaks.',
      '<b>Build and types:</b> the web build is not newly broken; no new type errors against the base.',
      '<b>Real change:</b> the patch changes at least one file.',
    ]);
    const sb = D.sandbox_setup;
    $('#fairness').innerHTML = li([
      'Same plan text, prompt templates, and model per route for every harness.',
      'Same limits: $2.50 per job, 20 min per turn, 2 turns.',
      'Each job runs in a throwaway copy of the code with a fresh one-commit history, so git holds no answer.',
      sb ? `Dependencies are hard-linked from one shared build: ${fmt.int(sb.shared_files)} files (${Math.round(sb.shared_mb)} MB) per job, ${Math.round(sb.new_mb)} MB new, ${sb.setup_sec.toFixed(0)}–8 s setup.` : 'Dependencies are hard-linked from one shared build.',
      'Path guards and a directory lock keep each agent out of other jobs and the research workspace.',
      'Private home directory, no git push, no stored credentials. The API key reaches the harness on a file descriptor.',
    ]);
    const metrics = [
      ['Solve rate', 'Jobs that pass on turn 1 or turn 2, over jobs run. Whisker: 95% Wilson interval.'],
      ['First try', 'Jobs that pass on turn 1.'],
      ['Turn-2 rescue', 'Failed jobs that pass after one retry with the failing checks.'],
      ['Cost', 'Token count × list price per model, both turns. A job stops at $2.50.'],
      ['$ / solve', 'Total cost over solved jobs: the price of one accepted fix.'],
      ['Agent time', 'Time inside the harness process, summed over turns.'],
      ['Wall time', 'Agent time plus grading (tests, build, type check).'],
      ['Tokens', 'Input + output + cache read + cache write, as reported by the API.'],
      ['Calls', 'Number of model API calls.'],
      ['Files / job', 'Files changed in the final patch, test files included.'],
      ['Regressions', 'Baseline-passing tests broken in the full replay of both suites.'],
      ['Build + types', 'Web build succeeds and no new type errors, both against the base commit.'],
    ];
    $('#metric-list').innerHTML = metrics.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('#harness-list').innerHTML = H_ORDER.map((h) => { const x = D.harnesses[h]; return `<div class="harness-item">${logo(h)}<div><div class="t">${esc(x.name)}<small>v${esc(x.version)} · ${esc(x.license)}</small></div><div class="d">${esc(x.style)}</div></div></div>`; }).join('');
    $('#limits').innerHTML = li([
      '<b>Small sample.</b> 5 tasks, one attempt per job. The interval on 4/5 is 38–96%. Read ties as ties.',
      '<b>List-price cost.</b> Cost is token math at list price, not an invoice.',
      '<b>Upstream failures.</b> Both failed tasks failed for every harness, because of the plan or the ticket text.',
      '<b>Task swaps.</b> Two vague tickets were replaced before the paid run.',
      '<b>Re-runs.</b> Early jobs that escaped an older sandbox were invalidated and re-run in the hardened one. Their spend is in the total, not on the board.',
    ]);
    $('#footer-meta').textContent = `${D.edition} · data ${fmt.date(D.generated_at)} · ${D.jobs.length} jobs · spend ${fmt.usd(D.budget.spent_usd)} incl. planner ${fmt.usd(D.planner.cost_usd)}`;
  }

  // ------------------------------------------------------------------ drawer
  const drawer = $('#drawer'), backdrop = $('#drawer-backdrop');
  let lastFocus = null;
  function openDrawer(html, from) {
    lastFocus = from || document.activeElement;
    $('#drawer-body').innerHTML = html;
    drawer.hidden = false; backdrop.hidden = false; document.body.style.overflow = 'hidden';
    $('#drawer-close').focus();
    drawer.querySelectorAll('[data-job]').forEach((b) => b.addEventListener('click', () => openJob(b.dataset.job, lastFocus)));
  }
  function closeDrawer() {
    drawer.hidden = true; backdrop.hidden = true; document.body.style.overflow = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $('#drawer-close').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (drawer.hidden) return;
    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = [...drawer.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  function causeNote(j) {
    if (j.final_pass) return '';
    if (j.task === 'B3') return 'All three harnesses followed the shared plan into the web form. The real fix is in the server-side document mapper, so the hidden test still failed. A planner check would catch this, not a better harness.';
    if (j.task === 'F2' && j.variant === 'v1') return 'The ticket did not name the accessible labels the hidden tests query. With a 2-line interface note (v2), all three harnesses solved it on turn 1.';
    return '';
  }

  function openJob(id, from) {
    hideTip();
    const j = D.jobs.find((x) => jobId(x) === id);
    if (!j) return;
    const t = taskByCode[j.task], L = rowLabel(rowKey(j));
    const tk = j.tokens, tot = totTok(tk);
    const seg = (v, c, label) => (v / tot > 0 ? `<span class="mix-seg" title="${esc(label)}: ${fmt.int(v)}" style="flex:${v / tot} 1 0;background:${c}"></span>` : '');
    const cause = causeNote(j);
    openDrawer(`
      <p class="dr-eyebrow">${esc(L.code)}${L.tag ? ' · ' + esc(L.tag) : ''} · ${esc(t.kind)} · ${esc(t.layer)}</p>
      <h2 class="dr-title" id="drawer-title">${esc(hName(j.harness))} on “${esc(t.title)}”</h2>
      <p class="dr-sub">${esc(t.summary)}</p>
      <div class="dr-badges"><span class="dr-badge">${esc(j.model)}</span><span class="dr-badge">${j.route === 'small_task' ? 'small' : 'big'} route</span><span class="dr-badge">${j.sandboxed ? 'hardened sandbox' : 'worktree run'}</span>${L.tag ? `<span class="dr-badge">${esc(L.note)}</span>` : ''}</div>
      <div class="dr-kpis">
        <div><div class="v">${status(j.final_pass, j.final_pass ? `Turn ${j.turn_1_pass ? 1 : 2}` : 'Failed')}</div><div class="k">Outcome</div></div>
        <div><div class="v">${fmt.usd(j.cost_usd)}</div><div class="k">Cost</div></div>
        <div><div class="v">${fmt.min(j.agent_sec)}</div><div class="k">Agent time</div></div>
        <div><div class="v">${fmt.tok(tot)}</div><div class="k">Tokens</div></div>
        <div><div class="v">${fmt.int(tk.calls)}</div><div class="k">Model calls</div></div>
        <div><div class="v">${j.files_modified_count}</div><div class="k">Files changed</div></div>
      </div>
      <p class="dr-h">Turns</p>
      <ol class="timeline">${j.turns.map((u) => `<li class="${u.pass ? 'ok' : ''}"><div class="tl-head"><b>Turn ${u.turn}</b>${status(u.pass, u.pass ? 'Pass' : 'Fail')}</div>
        <div class="tl-grid"><span>cost <b>${fmt.usd(u.cost_usd)}</b></span><span>agent <b>${fmt.min(u.agent_sec || 0)}</b></span>
        <span>files <b>${u.files}</b></span><span>hidden f→p failing <b>${u.f2p_failed ?? '—'}</b></span>
        <span>p→p failing <b>${u.p2p_failed ?? '—'}</b></span><span>regressions <b>${u.regression_broken}</b></span>
        <span>new tsc errors <b>${u.new_tsc_errors ?? '—'}</b></span><span>build <b>${u.build_ok ? 'OK' : 'FAIL'}</b></span>
        ${u.timed_out ? '<span>timed out <b>yes</b></span>' : ''}</div></li>`).join('')}</ol>
      <p class="dr-h">Token mix</p>
      <div class="mix-bar" style="height:14px">${seg(tk.input + tk.output, 'var(--tok-a)', 'Fresh input + output')}${seg(tk.cacheWrite, 'var(--tok-b)', 'Cache write')}${seg(tk.cacheRead, 'var(--tok-c)', 'Cache read')}</div>
      <div class="legend"><span><i class="sq" style="background:var(--tok-a)"></i>fresh ${fmt.tok(tk.input + tk.output)}</span><span><i class="sq" style="background:var(--tok-b)"></i>cache write ${fmt.tok(tk.cacheWrite)}</span><span><i class="sq" style="background:var(--tok-c)"></i>cache read ${fmt.tok(tk.cacheRead)}</span></div>
      ${j.replay ? `<p class="dr-h">Full regression replay</p>
      <div class="dr-kpis"><div><div class="v">${fmt.int(j.replay.web_passed)}/${fmt.int(j.replay.web_total)}</div><div class="k">Web suite</div></div><div><div class="v">${fmt.int(j.replay.app_passed)}/${fmt.int(j.replay.app_total)}</div><div class="k">Service suite</div></div><div><div class="v">${j.replay.broken}</div><div class="k">Broken</div></div></div>` : ''}
      ${cause ? `<p class="dr-note"><b>Why it failed.</b> ${esc(cause)}</p>` : ''}`, from);
  }

  function openHarness(h, from) {
    const jobs = selectJobs(), a = aggregate(jobs).find((x) => x.h === h), x = D.harnesses[h];
    openDrawer(`
      <p class="dr-eyebrow">Harness · v${esc(x.version)} · ${esc(x.license)}</p>
      <h2 class="dr-title" id="drawer-title">${esc(x.full)}</h2>
      <p class="dr-sub">${esc(x.style)}</p>
      <div class="dr-kpis">
        <div><div class="v">${a.solved}/${a.n}</div><div class="k">Solved</div></div>
        <div><div class="v">${fmt.usd(a.cost)}</div><div class="k">Total cost</div></div>
        <div><div class="v">${fmt.usd(a.costPerSolve)}</div><div class="k">$ / solve</div></div>
        <div><div class="v">${fmt.min(a.agent)}</div><div class="k">Agent time</div></div>
        <div><div class="v">${fmt.tok(a.tokens)}</div><div class="k">Tokens</div></div>
        <div><div class="v">${fmt.int(a.calls)}</div><div class="k">Calls</div></div>
      </div>
      <p class="dr-h">Jobs in this view</p>
      <div class="sub-tasks">${a.jobs.map((j) => `<button type="button" class="sub-task" data-job="${esc(jobId(j))}">${j.final_pass ? `<span class="status ok">${ICON.ok}</span>` : `<span class="status no">${ICON.no}</span>`}<b>${esc(rowKey(j))}</b><span class="meta">${fmt.usd(j.cost_usd)} · ${fmt.min(j.agent_sec)}</span></button>`).join('')}</div>`, from);
  }

  // ------------------------------------------------------------------ render all
  // Chip groups that re-render only their own chart.
  function bindLocalChips() {
    const xOnChange = () => { chips($('#f-x'), XS, 'x', xOnChange); renderScatter(aggregate(selectJobs())); };
    const cellOnChange = () => { chips($('#f-cell'), CELLS, 'cell', cellOnChange); renderMatrix(selectJobs()); };
    chips($('#f-x'), XS, 'x', xOnChange);
    chips($('#f-cell'), CELLS, 'cell', cellOnChange);
  }
  function renderFiltered() {
    renderFilters();
    const jobs = selectJobs(), agg = aggregate(jobs);
    renderHero(agg); renderTable(agg); renderScatter(agg); renderMatrix(jobs);
    renderCostBars(jobs); renderTokenMix(agg); renderReliability(jobs, agg);
  }

  // ------------------------------------------------------------------ theme
  const toggle = $('#theme-toggle');
  function syncToggle() { const d = isDark(); toggle.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); }
  toggle.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('lb-theme', next); } catch (e) { /* storage blocked: theme lasts for this page only */ }
    syncToggle(); renderFiltered(); terrain.recolor();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.getAttribute('data-theme')) { syncToggle(); renderFiltered(); terrain.recolor(); } });

  // ------------------------------------------------------------------ hero terrain (ridge lines)
  const terrain = (() => {
    const c = $('#terrain'), ctx = c.getContext('2d');
    let w = 0, h = 0, raf = 0, t0 = performance.now(), visible = true, line = '0,131,166', fill = '#F5F5F7', mx = 0, tmx = 0;
    const peaks = [{ x: 0.3, z: 4.5, a: 2.0, s: 0.5 }, { x: 1.05, z: 4.9, a: 2.9, s: 0.52 }, { x: 1.85, z: 4.3, a: 2.15, s: 0.46 }, { x: -1.1, z: 6.4, a: 1.0, s: 0.8 }, { x: 2.8, z: 6.0, a: 1.3, s: 0.7 }];
    function recolor() {
      const cs = getComputedStyle(document.documentElement);
      line = cs.getPropertyValue('--terrain').trim().split(/\s+/).join(',');
      fill = cs.getPropertyValue('--canvas').trim();
      if (reduceMotion || !raf) draw(performance.now());
    }
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = c.clientWidth; h = c.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function height(x, z, t) {
      let y = 0;
      for (const p of peaks) { const dx = x - p.x, dz = z - p.z; y += p.a * Math.exp(-(dx * dx + dz * dz) / (2 * p.s * p.s)); }
      y += 0.07 * Math.sin(x * 3.1 + t * 0.35 + z * 1.3) * Math.cos(z * 2.2 - t * 0.25);
      y += 0.035 * Math.sin(x * 9.0 - z * 5.0 + t * 0.6);
      return y;
    }
    function draw(now) {
      if (!w || !h) return;
      const t = reduceMotion ? 0 : (now - t0) / 1000;
      mx += (tmx - mx) * 0.04;
      ctx.clearRect(0, 0, w, h);
      const wide = w >= 900;
      const cx = wide ? w * 0.62 : w * 0.5, horizon = h * (wide ? 0.56 : 0.62), f = Math.min(w, 1400) * (wide ? 0.62 : 0.9), camY = 1.25;
      const rows = 46, cols = 110, zNear = 1.4, zFar = 8;
      let apex = null;
      for (let r = rows - 1; r >= 0; r--) {
        const z = zNear + (r / (rows - 1)) * (zFar - zNear);
        const pts = [];
        for (let k = 0; k <= cols; k++) {
          const x = -3.2 + (k / cols) * 6.4 + mx * 0.25;
          const y = height(x, z, t);
          pts.push([cx + ((x - mx * 0.25) / z) * f + (wide ? f * 0.15 : 0), horizon + ((camY - y) / z) * f * 0.55]);
        }
        const near = 1 - r / (rows - 1);
        ctx.beginPath(); ctx.moveTo(pts[0][0], h + 2);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        ctx.lineTo(pts[pts.length - 1][0], h + 2); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = `rgba(${line},${0.12 + near * 0.5})`; ctx.lineWidth = 0.6 + near * 0.9; ctx.stroke();
        if (Math.abs(z - 4.9) < (zFar - zNear) / (rows - 1) / 2 + 1e-9) {
          const x = 1.05, y = height(x, z, t);
          apex = [cx + ((x) / z) * f + (wide ? f * 0.15 : 0), horizon + ((camY - y) / z) * f * 0.55];
        }
      }
      if (apex) { // vermillion summit flag on the tallest peak
        ctx.beginPath(); ctx.moveTo(apex[0] - 7, apex[1] - 3); ctx.lineTo(apex[0] + 7, apex[1] - 3); ctx.lineTo(apex[0], apex[1] - 16); ctx.closePath();
        ctx.fillStyle = '#D84727'; ctx.fill();
      }
    }
    function loop(now) { draw(now); raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0; }
    function start() { if (!raf && !reduceMotion) raf = requestAnimationFrame(loop); }
    size(); recolor();
    if (reduceMotion) draw(performance.now()); else start();
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) start(); }).observe(c);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) start(); });
    addEventListener('resize', () => { size(); if (reduceMotion || !raf) draw(performance.now()); });
    c.parentElement.addEventListener('pointermove', (e) => { const b = c.getBoundingClientRect(); tmx = ((e.clientX - b.left) / b.width - 0.5) * 0.8; });
    return { recolor };
  })();

  // ------------------------------------------------------------------ chrome: masthead, nav, reveal, resize
  const mast = $('#masthead');
  addEventListener('scroll', () => mast.classList.toggle('scrolled', scrollY > 8), { passive: true });
  const navLinks = [...document.querySelectorAll('.nav a')];
  const secIO = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['board', 'frontier', 'matrix', 'reliability', 'tasks', 'method'].forEach((id) => secIO.observe(document.getElementById(id)));
  const revIO = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revIO.unobserve(e.target); } }), { threshold: 0.06 });
  document.querySelectorAll('.reveal').forEach((el) => revIO.observe(el));
  let rT = 0, lastW = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => { if (innerWidth === lastW) return; lastW = innerWidth; const jobs = selectJobs(), agg = aggregate(jobs); renderScatter(agg); renderCostBars(jobs); renderTokenMix(agg); }, 140);
  });
  addEventListener('scroll', hideTip, { passive: true });

  // ------------------------------------------------------------------ boot
  // Global filters re-render every chart; the X-axis and cell chips re-render one chart.
  syncToggle();
  renderKpis(); renderTasks(); renderMethod(); bindLocalChips();
  renderFiltered();
})();
