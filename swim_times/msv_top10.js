// Top-10 report builder for mnswimandvibe.com
//
// How to use:
//   Easiest: open swim_times/index.html and drag the "Swim Top 10" bookmarklet
//   to your bookmarks bar, then click it on https://mnswimandvibe.com/mantaray/.
//
//   Or by hand:
//   1. Open https://mnswimandvibe.com/mantaray/ in your browser.
//   2. Open DevTools > Console, paste this whole file, press Enter.
//      (Chrome may ask you to type "allow pasting" first.)
//   3. A small panel appears in the top-right corner. Pick a season, press
//      "Download report", and the HTML report downloads.
//
// It has to run on the mnswimandvibe.com page itself so the requests are
// same-origin (no CORS problems) and use the page's own cookies and nonce.

(() => {
  const AJAX_URL = '/wp-admin/admin-ajax.php';

  const EVENTS = [
    '50 Free', '100 Free', '200 Free', '500 Free',
    '100 Back', '100 Breast', '100 Fly', '200 IM'
  ];

  const SEASONS = [
    ['2026_girls', '2026 Girls'], ['2026_boys', '2026 Boys'],
    ['2025_girls', '2025 Girls'], ['2025_boys', '2025 Boys'],
    ['2024_girls', '2024 Girls'], ['2024_boys', '2024 Boys'],
    ['2023_girls', '2023 Girls']
  ];

  const GRADE_LABELS = { 9: 'FR', 10: 'SO', 11: 'JR', 12: 'SR' };
  const LIMIT = 10;
  const MAX_PAGES = 30;

  class NonceError extends Error {}

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- nonce ---------------------------------------------------------------

  // Every nonce-looking value in the page source. The third one has been the
  // working one, so it is tried first; the rest are fallbacks.
  function nonceCandidates() {
    const html = document.documentElement.outerHTML;
    const found = [...html.matchAll(/nonce["']?\s*[:=]\s*["']([0-9a-f]{8,12})["']/gi)].map((m) => m[1]);
    const unique = [...new Set(found)];
    if (unique.length < 3) return unique;
    return [unique[2], ...unique.filter((_, i) => i !== 2)];
  }

  // ---- data ----------------------------------------------------------------

  async function queryPage({ season, team }, nonce, event, page) {
    const body = new URLSearchParams();
    body.append('season_key', season);
    body.append('class', '');
    body.append('section', '');
    body.append('conference', '');
    if (team) body.append('teams[]', team);
    body.append('event_name', event);
    body.append('grade', '');
    body.append('athlete', '');
    body.append('date_from', '1960-08-01');
    body.append('date_to', '');
    body.append('action', 'msv_get_results');
    body.append('nonce', nonce);
    body.append('page', String(page));

    const res = await fetch(AJAX_URL, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body,
      credentials: 'same-origin'
    });
    const text = await res.text();
    if (res.status === 403 && text.trim() === '-1') throw new NonceError('nonce rejected');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Response was not JSON: ${text.slice(0, 200)}`);
    }
  }

  function toSeconds(row) {
    const n = parseFloat(row.time_seconds);
    if (Number.isFinite(n)) return n;
    const m = String(row.time_display ?? '').match(/^(?:(\d+):)?(\d+(?:\.\d+)?)/);
    return m ? (Number(m[1] || 0) * 60) + parseFloat(m[2]) : Infinity;
  }

  const gradeLabel = (g) => {
    const n = parseInt(g, 10);
    return Number.isFinite(n) ? (GRADE_LABELS[n] ?? String(g)) : '';
  };

  // All pages for an event -> best swim per athlete -> fastest first.
  async function topForEvent(opts, nonce, event) {
    const all = [];
    let previous = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const json = await queryPage(opts, nonce, event, page);
      const rows = Array.isArray(json?.data?.rows) ? json.data.rows : [];
      if (rows.length === 0 || JSON.stringify(rows) === previous) break;
      all.push(...rows);
      previous = JSON.stringify(rows);
      await sleep(300); // be polite to the server
    }

    const best = new Map();
    for (const r of all) {
      if (r.is_relay || !r.athlete_name || !r.time_display) continue;
      const key = r.athlete_id || String(r.athlete_name).trim().toLowerCase();
      const cur = best.get(key);
      if (!cur || toSeconds(r) < toSeconds(cur)) best.set(key, r);
    }
    return [...best.values()].sort((a, b) => toSeconds(a) - toSeconds(b)).slice(0, LIMIT);
  }

  // ---- report --------------------------------------------------------------

  function tableHtml(event, swims) {
    const rows = swims.length
      ? swims.map((s, i) =>
          `      <tr><td>${i + 1}</td><td>${esc(s.athlete_name)}</td>` +
          `<td>${esc(gradeLabel(s.grade))}</td><td>${esc(s.time_display)}</td></tr>`).join('\n')
      : '      <tr><td colspan="4">No results</td></tr>';
    return `<h2>${esc(event)}</h2>
<table>
  <thead><tr><th>Rank</th><th>Athlete</th><th>Grade</th><th>Time</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
  }

  function reportHtml(title, sections) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f2f2f2; }
  td:first-child, td:nth-child(3) { text-align: center; }
  td:last-child { font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${sections.join('\n')}
</body>
</html>
`;
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- UI ------------------------------------------------------------------

  document.getElementById('msv-top10-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'msv-top10-panel';
  panel.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff;color:#111;' +
    'border:1px solid #888;border-radius:8px;padding:12px;font:14px system-ui,sans-serif;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.25);width:240px';
  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px">Top 10 report</div>
    <label style="display:block;margin-bottom:6px">Season
      <select id="msv-season" style="width:100%;margin-top:2px">
        ${SEASONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </label>
    <label style="display:block;margin-bottom:8px">Team code (blank = statewide)
      <input id="msv-team" value="MPSW" style="width:100%;margin-top:2px;box-sizing:border-box">
    </label>
    <button id="msv-go" style="width:100%;padding:6px">Download report</button>
    <div id="msv-status" style="margin-top:8px;font-size:12px;min-height:1.2em"></div>
    <button id="msv-close" style="position:absolute;top:4px;right:6px;border:0;background:none;cursor:pointer">x</button>`;
  document.body.appendChild(panel);

  const $ = (id) => panel.querySelector(id);
  const setStatus = (t) => { $('#msv-status').textContent = t; };
  $('#msv-close').onclick = () => panel.remove();

  $('#msv-go').onclick = async () => {
    const btn = $('#msv-go');
    const opts = { season: $('#msv-season').value, team: $('#msv-team').value.trim() };
    btn.disabled = true;
    try {
      const candidates = nonceCandidates();
      if (!candidates.length) throw new Error('No nonce found on this page. Reload and try again.');

      setStatus('Finding a working nonce...');
      let nonce = null;
      for (const c of candidates) {
        try {
          await queryPage(opts, c, EVENTS[0], 1);
          nonce = c;
          break;
        } catch (e) {
          if (!(e instanceof NonceError)) throw e;
        }
      }
      if (!nonce) throw new Error('Every nonce was rejected. Reload the page and try again.');

      const sections = [];
      for (const event of EVENTS) {
        setStatus(`Fetching ${event}...`);
        sections.push(tableHtml(event, await topForEvent(opts, nonce, event)));
      }

      const label = SEASONS.find(([v]) => v === opts.season)?.[1] ?? opts.season;
      const title = `Top ${LIMIT} - ${label}${opts.team ? ` - ${opts.team}` : ' - Statewide'}`;
      download(`top${LIMIT}_${opts.season}_${opts.team || 'statewide'}.html`, reportHtml(title, sections));
      setStatus('Done. Report downloaded.');
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  };
})();
