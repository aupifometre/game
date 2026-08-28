/* La République des Faits — chargeur de données.
   Ordre : cache localStorage (30 j) → API publiques en live → snapshot embarqué. */
window.RF = (function () {
  const CACHE_KEY = 'rf-data-v2';
  const TTL = 1000 * 60 * 60 * 24 * 30;

  const NAMES = {FRA:'France',CHE:'Suisse',ESP:'Espagne',DNK:'Danemark',SWE:'Suède',
    FIN:'Finlande',NOR:'Norvège',ISL:'Islande',NLD:'Pays-Bas',NZL:'Nouvelle-Zélande',
    CHL:'Chili',URY:'Uruguay',MEX:'Mexique',IRL:'Irlande',SGP:'Singapour',AUS:'Australie'};
  const FLAGS = {FRA:'🇫🇷',CHE:'🇨🇭',ESP:'🇪🇸',DNK:'🇩🇰',SWE:'🇸🇪',FIN:'🇫🇮',NOR:'🇳🇴',
    ISL:'🇮🇸',NLD:'🇳🇱',NZL:'🇳🇿',CHL:'🇨🇱',URY:'🇺🇾',MEX:'🇲🇽',IRL:'🇮🇪',SGP:'🇸🇬',AUS:'🇦🇺'};
  const ISO16 = Object.keys(NAMES);

  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  async function fetchOwid(slug, minYear, extra) {
    const r = await fetch(`https://ourworldindata.org/grapher/${slug}.csv?${extra||''}csvType=filtered&time=${minYear}..latest`);
    if (!r.ok) throw new Error(slug + ' HTTP ' + r.status);
    const rows = parseCSV(await r.text()); const out = {};
    for (let i = 1; i < rows.length; i++) {
      const [, code, year, val] = rows[i];
      if (!code || code.length !== 3 || code.startsWith('OWI')) continue;
      const y = +year, v = parseFloat(val);
      if (!isFinite(v) || y < minYear) continue;
      if (!out[code] || y > out[code].y) out[code] = { v, y };
    }
    return out;
  }

  async function fetchWb(ind, minYear) {
    const r = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&mrnev=1&per_page=400`);
    if (!r.ok) throw new Error(ind + ' HTTP ' + r.status);
    const j = await r.json(); const out = {};
    for (const rec of (j[1] || [])) {
      const c = rec.countryiso3code;
      if (rec.value == null || !c || c.length !== 3 || +rec.date < minYear) continue;
      out[c] = { v: rec.value, y: +rec.date, iso2: rec.country && rec.country.id, name: rec.country && rec.country.value };
    }
    return out;
  }

  const SOURCES = [
    { key:'gdp',      label:'PIB/hab PPA — Banque mondiale',        fn:()=>fetchWb('NY.GDP.PCAP.PP.KD',2015) },
    { key:'tax',      label:'Recettes fiscales — Banque mondiale',  fn:()=>fetchWb('GC.TAX.TOTL.GD.ZS',2015) },
    { key:'gov',      label:"Dépenses de l'État — Banque mondiale", fn:()=>fetchWb('GC.XPN.TOTL.GD.ZS',2015) },
    { key:'trade',    label:'Ouverture commerciale — Banque mondiale', fn:()=>fetchWb('NE.TRD.GNFS.ZS',2015) },
    { key:'gini',     label:'Gini — Banque mondiale',               fn:()=>fetchWb('SI.POV.GINI',2012) },
    { key:'emp',      label:"Taux d'emploi — Banque mondiale",      fn:()=>fetchWb('SL.EMP.TOTL.SP.ZS',2015) },
    { key:'infant',   label:'Mortalité infantile — Banque mondiale',fn:()=>fetchWb('SP.DYN.IMRT.IN',2015) },
    { key:'homicide', label:'Homicides — Banque mondiale',          fn:()=>fetchWb('VC.IHR.PSRC.P5',2015) },
    { key:'top1',     label:'Part des 1 % les plus riches — WID',   fn:()=>fetchOwid('incomes-of-the-richest',2015,'quantile=richest_1pct&welfare_type=before_tax&') },
    { key:'rol',      label:'État de droit — V-Dem',                fn:()=>fetchOwid('rule-of-law-index',2015) },
    { key:'corr',     label:'Corruption politique — V-Dem',         fn:()=>fetchOwid('political-corruption-index',2015) },
    { key:'libdem',   label:'Démocratie libérale — V-Dem',          fn:()=>fetchOwid('liberal-democracy-index',2015) },
    { key:'foe',      label:"Liberté d'expression — V-Dem",         fn:()=>fetchOwid('freedom-of-expression-index',2015) },
    { key:'gii',      label:'Inégalité de genre — PNUD',            fn:()=>fetchOwid('gender-inequality-index-from-the-human-development-report',2015) },
    { key:'hdi',      label:'IDH — PNUD',                           fn:()=>fetchOwid('human-development-index',2015) },
    { key:'hale',     label:'Santé (HALE) — OMS',                   fn:()=>fetchOwid('healthy-life-expectancy-at-birth',2015) },
    { key:'happy',    label:'Satisfaction de vie — Gallup',         fn:()=>fetchOwid('happiness-cantril-ladder',2015) },
    { key:'school',   label:"Années d'école — PNUD/Barro-Lee",      fn:()=>fetchOwid('mean-years-of-schooling-long-run',2015) },
    { key:'pov60',    label:'Pauvreté relative — PIP',              fn:()=>fetchOwid('relative-poverty-share-of-people-below-60-of-the-median',2012) },
  ];

  const WORLD_KEYS = ['gdp','tax','gov','trade','top1','rol','corr','hale','gii','libdem','infant','homicide','happy','school'];

  function assemble(m, sourceLabel) {
    const g = (k, c) => { const e = m[k] && m[k][c]; return e == null ? null : e.v; };
    const rnd = (v, n) => v == null ? null : Math.round(v * Math.pow(10, n)) / Math.pow(10, n);
    const countries = ISO16.map(c => ({
      iso: c, name: NAMES[c], flag: FLAGS[c],
      gdp: rnd(g('gdp', c), 2), gini: rnd(g('gini', c), 2), emp: rnd(g('emp', c), 2),
      libdem: g('libdem', c), foe: g('foe', c), rol: g('rol', c),
      gii: g('gii', c), hdi: g('hdi', c),
      hale: rnd(g('hale', c), 1), pov60: rnd(g('pov60', c), 1),
    }));
    const world = [];
    for (const c in (m.gdp || {})) {
      const v = {};
      for (const k of WORLD_KEYS) { const x = g(k, c); if (x != null) v[k] = rnd(x, 3); }
      if (Object.keys(v).length < 4) continue;
      world.push({ iso: c, iso2: m.gdp[c].iso2, name: m.gdp[c].name, v });
    }
    return { countries, world, meta: { source: sourceLabel, date: new Date().toISOString().slice(0, 10) } };
  }

  async function load(onProgress) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && Date.now() - c.t < TTL) {
        (onProgress || (() => {}))('cache', true, 'cache local (' + c.data.meta.date + ')');
        return c.data;
      }
    } catch (e) {}
    const maps = {}; let fails = 0;
    await Promise.all(SOURCES.map(async s => {
      try { maps[s.key] = await s.fn(); (onProgress || (() => {}))(s.key, true, s.label); }
      catch (e) { fails++; (onProgress || (() => {}))(s.key, false, s.label); }
    }));
    if (fails <= 3 && maps.gdp && maps.hale && maps.libdem) {
      const data = assemble(maps, 'live');
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch (e) {}
      return data;
    }
    return window.RF_SNAPSHOT;
  }

  function flag(iso2) {
    if (!iso2 || iso2.length !== 2) return '';
    const A = 0x1F1E6, a = 'A'.charCodeAt(0), u = iso2.toUpperCase();
    if (!/^[A-Z]{2}$/.test(u)) return '';
    return String.fromCodePoint(A + u.charCodeAt(0) - a, A + u.charCodeAt(1) - a);
  }

  /* ---------- barre de navigation partagée ---------- */
  const GUICHETS = [
    { f:'index.html',      n:'',   t:'Accueil',                 em:'★'  },
    { f:'pari.html',       n:'04', t:'Le pari statistique',     em:'🎲' },
    { f:'classement.html', n:'07', t:'Le classement',           em:'🏆' },
    { f:'courbe.html',     n:'02', t:'Dessine la courbe',       em:'✏️' },
    { f:'milliards.html',  n:'09', t:'La chaîne des milliards', em:'🧾' },
  ];
  function mountNav(current) {
    const here = GUICHETS.find(g => g.f === current) || GUICHETS[0];
    const isHome = here.f === 'index.html';
    const bar = document.createElement('div');
    bar.className = 'topnav';
    bar.innerHTML =
      (isHome ? '<span class="tn-back tn-home">★</span>'
              : '<a class="tn-back" href="index.html" aria-label="Retour à l\'accueil">←</a>') +
      `<span class="tn-title">${isHome ? 'La République des Faits' : (here.em + ' ' + here.t)}</span>` +
      '<button class="tn-burger" aria-label="Menu" aria-expanded="false">☰</button>';
    const drawer = document.createElement('nav');
    drawer.className = 'drawer';
    drawer.innerHTML = '<div class="dr-head">Les guichets</div>' +
      GUICHETS.map(g => `<a class="dr-item${g.f === current ? ' on' : ''}" href="${g.f}">
        <span class="dr-em">${g.em}</span>
        <span class="dr-t">${g.t}${g.n ? `<small>guichet n°${g.n}</small>` : ''}</span></a>`).join('');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.appendChild(scrim); document.body.appendChild(drawer);
    const btn = bar.querySelector('.tn-burger');
    // styles pilotés en direct : aucune dépendance à l'ordre des feuilles de style
    drawer.style.transform = 'translateX(102%)';
    scrim.style.opacity = '0'; scrim.style.pointerEvents = 'none';
    const toggle = open => {
      drawer.classList.toggle('open', open);
      drawer.style.transform = open ? 'translateX(0)' : 'translateX(102%)';
      scrim.classList.toggle('on', open);
      scrim.style.opacity = open ? '1' : '0';
      scrim.style.pointerEvents = open ? 'auto' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    btn.onclick = () => toggle(!drawer.classList.contains('open'));
    scrim.onclick = () => toggle(false);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
    if (location.hash === '#menu') toggle(true);
  }

  /* ---------- liens vers les sources ---------- */
  const WB = 'https://data.worldbank.org/indicator/', OW = 'https://ourworldindata.org/grapher/';
  const SRC = {
    gdp:{u:WB+'NY.GDP.PCAP.PP.KD',l:'Banque mondiale'}, tax:{u:WB+'GC.TAX.TOTL.GD.ZS',l:'Banque mondiale'},
    gov:{u:WB+'GC.XPN.TOTL.GD.ZS',l:'Banque mondiale'}, trade:{u:WB+'NE.TRD.GNFS.ZS',l:'Banque mondiale'},
    gini:{u:WB+'SI.POV.GINI',l:'Banque mondiale'},      emp:{u:WB+'SL.EMP.TOTL.SP.ZS',l:'Banque mondiale'},
    infant:{u:WB+'SP.DYN.IMRT.IN',l:'Banque mondiale'}, homicide:{u:WB+'VC.IHR.PSRC.P5',l:'Banque mondiale'},
    rol:{u:OW+'rule-of-law-index',l:'V-Dem / OWID'},    corr:{u:OW+'political-corruption-index',l:'V-Dem / OWID'},
    libdem:{u:OW+'liberal-democracy-index',l:'V-Dem / OWID'}, foe:{u:OW+'freedom-of-expression-index',l:'V-Dem / OWID'},
    gii:{u:OW+'gender-inequality-index-from-the-human-development-report',l:'PNUD / OWID'},
    hdi:{u:OW+'human-development-index',l:'PNUD / OWID'}, hale:{u:OW+'healthy-life-expectancy-at-birth',l:'OMS / OWID'},
    happy:{u:OW+'happiness-cantril-ladder',l:'Gallup / OWID'}, school:{u:OW+'mean-years-of-schooling-long-run',l:'PNUD / OWID'},
    pov60:{u:OW+'relative-poverty-share-of-people-below-60-of-the-median',l:'PIP / OWID'},
    top1:{u:'https://wid.world/',l:'World Inequality Database'},
  };
  const srcLink = (k, label) => { const s = SRC[k]; return s ? `<a href="${s.u}" target="_blank" rel="noopener">${label || 'voir les données'} ↗</a>` : ''; };

  /* ---------- export CSV ---------- */
  function downloadCSV(filename, header, rows) {
    const esc = v => (v == null ? '' : /[",;\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v);
    const csv = '\uFEFF' + [header, ...rows].map(r => r.map(esc).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = filename; a.click();
  }

  function pearson(pts) {
    const n = pts.length; let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
    for (const [x, y] of pts) { sx += x; sy += y; sxy += x * y; sx2 += x * x; sy2 += y * y; }
    return (n * sxy - sx * sy) / Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  }

  async function shareCard(drawFn, filename, text) {
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
    drawFn(cv.getContext('2d'), cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    return 'downloaded';
  }

  function cardBase(ctx, W, H, guichet) {
    ctx.fillStyle = '#F4EFE3'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#00000010';
    for (let x = 20; x < W; x += 34) for (let y = 20; y < H; y += 34) ctx.fillRect(x, y, 3, 3);
    ctx.fillStyle = '#1B160F'; ctx.fillRect(40, 40, W - 80, 110);
    ctx.fillStyle = '#F4EFE3'; ctx.font = '900 40px system-ui';
    ctx.fillText('RF ★ LA RÉPUBLIQUE DES FAITS', 70, 105);
    ctx.font = '22px ui-monospace, monospace'; ctx.fillStyle = '#F4EFE3AA';
    ctx.fillText(guichet, 70, 138);
    ctx.fillStyle = '#1B160F'; ctx.font = '20px ui-monospace, monospace';
    ctx.fillText('données publiques · Banque mondiale · ONU · OMS · V-Dem · WID', 70, H - 60);
  }

  return { load, pearson, shareCard, cardBase, flag, mountNav, srcLink, downloadCSV, SRC, NAMES, FLAGS };
})();
