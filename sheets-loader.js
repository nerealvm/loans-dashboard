// Google Sheets data loader
// Uses the Google Visualization (gviz/tq) endpoint — works for sheets shared
// as "Anyone with the link can view" without any API key.
//
// Sheet names discovered from the actual spreadsheet:
//   "Реестр траншей"  — consolidated registry, all groups (formula aggregation)
//   "N&K"/"Пресняков"/"Чил-Акопов" — per-group registries (primary data entry)
//   "Журнал движений" — movements (returns of principal + % payments)
//   "Ставки ЦБ"       — CB rate history with explicit start/end dates
//   "Справочники"     — parameters: report date, shares, limits, corp rate

(function () {
  'use strict';

  var SL = {};

  // ─── Default config ────────────────────────────────────────────────────────
  SL.DEFAULTS = {
    enabled: true,
    spreadsheetId: '1qnL1DLlIXaY577HHa4V7SqrNEfRbhKjCuWrae_sWRmk',
    sheetReestр:   'Реестр траншей',
    sheetJournal:  'Журнал движений',
    sheetCBRates:  'Ставки ЦБ',
    sheetParams:   'Справочники',
    cacheTTLMinutes: 60,
  };

  // Fallbacks only — the live values now come from the "Справочники" sheet.
  SL.STATIC = {
    shares:        { 'Пресняков': 0.4,   'N&K': 0.243, 'Чил-Акопов': 0.357 },
    sharesAA:      { 'Пресняков': 0.335, 'N&K': 0.33,  'Чил-Акопов': 0.335 },
    contributions: { 'Пресняков': 200000000, 'N&K': 100000000, 'Чил-Акопов': 87000000 },
    invLimit:      300000000,
    corpRate:      0.2,
    capPeriod:     'ежемесячно',
    groups:        ['Пресняков', 'N&K', 'Чил-Акопов'],
    projects:      ['Биотех', 'Ассортимент Агро', 'ОТЗ/ОПТ Трейдинг', 'NU TREAT'],
  };

  // Принадлежность транша: всё, что не «инвестиционный» (оборотный, «старое
  // говно», пустое) — считается оборотным, как в формулах Телевизора.
  SL.KIND_INVEST = 'инвестиционный';
  SL.isInvest = function (kind) {
    return String(kind || '').trim().toLowerCase() === SL.KIND_INVEST;
  };

  // ─── Config helpers ────────────────────────────────────────────────────────
  var CONFIG_KEY = 'kapital_sheets_config_v2';

  // Fetches config.json from the server once per session and merges it into
  // SL.DEFAULTS. This lets the spreadsheet ID be changed on GitHub without
  // touching any code — just edit config.json via the GitHub web UI.
  var _remoteLoaded = false;
  SL.loadRemoteConfig = async function () {
    if (_remoteLoaded) return;
    _remoteLoaded = true;
    try {
      var resp = await fetch('config.json', { cache: 'no-cache' });
      if (resp.ok) Object.assign(SL.DEFAULTS, await resp.json());
    } catch (e) {}
  };

  // Priority: localStorage (user overrides via UI) > config.json > SL.DEFAULTS
  SL.getConfig = function () {
    try {
      var s = localStorage.getItem(CONFIG_KEY);
      if (s) return Object.assign({}, SL.DEFAULTS, JSON.parse(s));
    } catch (e) {}
    return Object.assign({}, SL.DEFAULTS);
  };

  SL.setConfig = function (partial) {
    var cfg = Object.assign(SL.getConfig(), partial);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return cfg;
  };

  // ─── Cache helpers ─────────────────────────────────────────────────────────
  SL.getCached = function (key) {
    try {
      var raw = localStorage.getItem('kapital_sheets_cache');
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (entry.key !== key) return null;
      var cfg = SL.getConfig();
      var ttl = (cfg.cacheTTLMinutes || 60) * 60 * 1000;
      if (Date.now() - entry.ts > ttl) return null;
      return entry.data;
    } catch (e) { return null; }
  };

  SL.setCache = function (key, data) {
    try {
      localStorage.setItem('kapital_sheets_cache', JSON.stringify({ key, ts: Date.now(), data }));
    } catch (e) {}
  };

  SL.clearCache = function () {
    localStorage.removeItem('kapital_sheets_cache');
  };

  // ─── gviz / tq fetch ───────────────────────────────────────────────────────
  // opts.rawRows — append &headers=0 so gviz returns every row as data instead
  // of guessing a header row. Used for the key/value "Справочники" sheet.
  SL.fetchSheet = async function (spreadsheetId, sheetName, opts) {
    var url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId +
              '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheetName) +
              (opts && opts.rawRows ? '&headers=0' : '');
    var resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' — "' + sheetName + '"');
    var text = await resp.text();
    var m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/);
    if (!m) throw new Error('Unexpected gviz format for "' + sheetName + '"');
    var r = JSON.parse(m[1]);
    if (r.status === 'error') {
      var msg = (r.errors || []).map(function (e) { return e.message; }).join('; ');
      throw new Error('gviz error ("' + sheetName + '"): ' + msg);
    }
    return r.table;
  };

  // ─── gviz table → positional row array ────────────────────────────────────
  // Returns { headers, rows } where rows[i] is an array parallel to headers.
  SL.parseTable = function (table) {
    if (!table || !table.cols || !table.rows) return { headers: [], rows: [] };
    var headers = table.cols.map(function (c) {
      return ((c.label || c.id || '')).trim();
    });
    var rows = [];
    for (var i = 0; i < table.rows.length; i++) {
      var r = table.rows[i];
      if (!r || !r.c) continue;
      var row = r.c.map(function (cell) {
        return cell ? { v: cell.v, f: cell.f } : { v: null, f: null };
      });
      // Skip completely empty rows
      if (!row.some(function (cell) { return cell.v !== null && cell.v !== ''; })) continue;
      rows.push(row);
    }
    return { headers: headers, rows: rows };
  };

  // ─── Column index finder ───────────────────────────────────────────────────
  // Four global passes across ALL patterns before advancing to the next pass.
  // This ensures a specific pattern ('id движения') wins over a generic one
  // ('id') even if the generic one would match in an earlier pass.
  //
  // Col 0 in both sheets has a very long description header — passes 1-3 skip
  // it (≤60 char guard or exact/starts-with mismatch); pass 4 is the fallback.
  SL.findCol = function (headers, patterns) {
    var lc = headers.map(function (h) { return h.toLowerCase(); });
    var pats = patterns.map(function (p) { return p.toLowerCase(); });
    var hi, pi;

    // Pass 1: exact match
    for (pi = 0; pi < pats.length; pi++) {
      for (hi = 0; hi < lc.length; hi++) {
        if (lc[hi] === pats[pi]) return hi;
      }
    }
    // Pass 2: starts-with (catches "Дата транша (…)" style headers)
    for (pi = 0; pi < pats.length; pi++) {
      for (hi = 0; hi < lc.length; hi++) {
        var h2 = lc[hi], p2 = pats[pi];
        if (h2.startsWith(p2 + ' ') || h2.startsWith(p2 + '(') || h2.startsWith(p2 + ',')) return hi;
      }
    }
    // Pass 3: substring only in short headers (≤ 60 chars) — skips the long col-0 description
    for (pi = 0; pi < pats.length; pi++) {
      for (hi = 0; hi < lc.length; hi++) {
        if (headers[hi].length <= 60 && lc[hi].indexOf(pats[pi]) !== -1) return hi;
      }
    }
    // Pass 4: any substring — last resort to find long description headers
    for (pi = 0; pi < pats.length; pi++) {
      for (hi = 0; hi < lc.length; hi++) {
        if (lc[hi].indexOf(pats[pi]) !== -1) return hi;
      }
    }
    return -1;
  };

  SL.get = function (row, idx) {
    if (idx < 0 || idx >= row.length) return null;
    return row[idx].v;
  };

  SL.getFmt = function (row, idx) {
    if (idx < 0 || idx >= row.length) return null;
    return row[idx].f;
  };

  // ─── Date parsing ──────────────────────────────────────────────────────────
  SL.parseDate = function (v, fmtV) {
    if (v == null) return null;
    // gviz date: "Date(Y,M0,D)" — month is 0-indexed
    if (typeof v === 'string') {
      var dm = v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
      if (dm) {
        return dm[1] + '-' + String(+dm[2] + 1).padStart(2, '0') + '-' + String(+dm[3]).padStart(2, '0');
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      // DD.MM.YYYY
      var ddmm = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (ddmm) return ddmm[3] + '-' + ddmm[2].padStart(2, '0') + '-' + ddmm[1].padStart(2, '0');
    }
    // Formatted fallback
    if (fmtV && typeof fmtV === 'string') return SL.parseDate(fmtV, null);
    // Excel serial
    if (typeof v === 'number' && v > 1000) {
      var d = new Date(Date.UTC(1899, 11, 30));
      d.setUTCDate(d.getUTCDate() + Math.round(v));
      return d.toISOString().slice(0, 10);
    }
    return null;
  };

  SL.parseRate = function (v) {
    if (v == null) return null;
    if (typeof v === 'number') return v > 1 ? v / 100 : v;
    if (typeof v === 'string') {
      var n = parseFloat(v.replace('%', '').replace(',', '.').trim());
      if (!isNaN(n)) return n > 1 ? n / 100 : n;
    }
    return null;
  };

  SL.parseNum = function (v) {
    if (typeof v === 'number') return v;
    if (v == null || v === '') return null;
    var n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  // ─── "Реестр траншей" / group sheet parser ─────────────────────────────────
  // Columns as of the 2026-07 rework:
  //  A ID транша            N Срок возврата
  //  B Группа               O Дата отчёта
  //  C Юр лицо (carrier)    P Дата посл. сверки
  //  D Проект               Q Статус сверки
  //  E Сумма                R Σ возвратов (транш)
  //  F № договора           S Остаток тела (транш)
  //  G Дата договора        T Дней от транша
  //  H Дата транша          U Начислено % (транш)            — простые
  //  I Ставка в договоре    V Итого сложные проценты         — на TODAY()
  //  J Тип ставки           W Σ выплат % (журнал)
  //  K Надбавка (плав.)     X Задолженность % (сложные)      = V − W
  //  L Ставка по корп       Y Задолженность % (транш)        — простые
  //    договору             Z Строка транша
  //  M Принадлежность       AA Комментарий
  //
  // Формульные колонки R–Y читаются как есть — они уже учитывают возвраты,
  // сегменты ЦБ и капитализацию. Движок пересчитывает их только для «что если».
  //
  // Проценты берутся разные в зависимости от принадлежности:
  //   инвестиционные            → сложные (V, X) на текущую дату
  //   оборотные и «старое говно» → простые (U, Y) на дату отчёта
  SL.parseTranches = function (table) {
    var pt = SL.parseTable(table);
    var h = pt.headers;

    // Find columns by keyword — positions verified against live sheet
    var cID          = SL.findCol(h, ['id транша']);
    var cGroup       = SL.findCol(h, ['группа']);
    var cCarrier     = SL.findCol(h, ['юр лицо', 'контрагент', 'заимодавец', 'лицо', 'организация']);
    var cProject     = SL.findCol(h, ['проект']);
    var cSum         = SL.findCol(h, ['сумма']);
    var cContractNo  = SL.findCol(h, ['№ договора', 'договора', 'договор']);
    var cContractDt  = SL.findCol(h, ['дата договора']);
    var cDate        = SL.findCol(h, ['дата транша', 'дата выдачи', 'дата займа']);
    var cRate        = SL.findCol(h, ['ставка в договоре', 'ставка (на момент)', 'ставка']);
    var cRateType    = SL.findCol(h, ['тип ставки']);
    var cAddRate     = SL.findCol(h, ['надбавка', 'цб+', '+к цб']);
    var cCorpRate    = SL.findCol(h, ['ставка по корп договору', 'ставка по корп']);
    var cKind        = SL.findCol(h, ['принадлежность', 'вид займа', 'тип займа', 'вид']);
    var cTerm        = SL.findCol(h, ['срок возврата', 'срок']);
    var cStatus      = SL.findCol(h, ['статус сверки', 'статус']);
    var cComment     = SL.findCol(h, ['комментарий', 'примечание']);
    var cReportDate  = SL.findCol(h, ['дата отчёта']);
    // Формульные колонки
    var cReturns     = SL.findCol(h, ['σ возвратов', 'сумма возвратов']);
    var cBalance     = SL.findCol(h, ['остаток тела']);
    var cDays        = SL.findCol(h, ['дней от транша']);
    var cSimple      = SL.findCol(h, ['начислено %']);
    var cCompound    = SL.findCol(h, ['итого сложные проценты', 'сложные проценты']);
    var cPaidPct     = SL.findCol(h, ['σ выплат %', 'сумма выплат %']);
    var cDebtSimple  = SL.findCol(h, ['задолженность % (транш)']);
    var cDebtCompound= SL.findCol(h, ['задолженность % (сложные)']);

    var result = [];
    var reportDate = null;

    for (var i = 0; i < pt.rows.length; i++) {
      var row = pt.rows[i];
      var rawId = SL.get(row, cID);
      if (!rawId || typeof rawId !== 'string' || !/^[A-Z]{2}-\d+/.test(rawId.trim())) continue;
      var id = rawId.trim();

      // Pick up reportDate from first row
      if (!reportDate && cReportDate >= 0) {
        reportDate = SL.parseDate(SL.get(row, cReportDate), SL.getFmt(row, cReportDate));
      }

      var rate       = SL.parseRate(SL.get(row, cRate));
      var addRate    = SL.parseRate(SL.get(row, cAddRate)) || 0;
      var corpRate   = cCorpRate >= 0 ? SL.parseRate(SL.get(row, cCorpRate)) : null;
      var rtRaw      = SL.get(row, cRateType);
      var rateType   = rtRaw && String(rtRaw).toLowerCase().indexOf('плав') !== -1 ? 'плав' : 'фикс';
      var sum        = SL.parseNum(SL.get(row, cSum));
      var kind       = cKind >= 0 ? String(SL.get(row, cKind) || '').trim() || null : null;

      result.push({
        id:           id,
        group:        cGroup >= 0 ? String(SL.get(row, cGroup) || '').trim() || null : null,
        carrier:      cCarrier >= 0 ? String(SL.get(row, cCarrier) || '').trim() || null : null,
        project:      cProject >= 0 ? String(SL.get(row, cProject) || '').trim() || null : null,
        sum:          sum,
        contractNo:   cContractNo >= 0 ? String(SL.get(row, cContractNo) || '').trim() || null : null,
        contractDate: cContractDt >= 0 ? SL.parseDate(SL.get(row, cContractDt), SL.getFmt(row, cContractDt)) : null,
        date:         cDate >= 0 ? SL.parseDate(SL.get(row, cDate), SL.getFmt(row, cDate)) : null,
        rate:         rateType === 'плав' ? null : rate,
        contractRate: rate,
        rateType:     rateType,
        addRate:      addRate,
        corpRate:     corpRate,
        kind:         kind,
        isInvest:     SL.isInvest(kind),
        term:         cTerm >= 0 && typeof SL.get(row, cTerm) === 'number' ? SL.get(row, cTerm) : null,
        reconStatus:  cStatus >= 0 ? String(SL.get(row, cStatus) || '').trim() || null : null,
        comment:      cComment >= 0 ? String(SL.get(row, cComment) || '').trim() || null : null,
        // Значения формул из таблицы (null → движок посчитает сам)
        sheetReturns:      cReturns      >= 0 ? SL.parseNum(SL.get(row, cReturns))      : null,
        sheetBalance:      cBalance      >= 0 ? SL.parseNum(SL.get(row, cBalance))      : null,
        sheetDays:         cDays         >= 0 ? SL.parseNum(SL.get(row, cDays))         : null,
        sheetSimple:       cSimple       >= 0 ? SL.parseNum(SL.get(row, cSimple))       : null,
        sheetCompound:     cCompound     >= 0 ? SL.parseNum(SL.get(row, cCompound))     : null,
        sheetPaidPct:      cPaidPct      >= 0 ? SL.parseNum(SL.get(row, cPaidPct))      : null,
        sheetDebtSimple:   cDebtSimple   >= 0 ? SL.parseNum(SL.get(row, cDebtSimple))   : null,
        sheetDebtCompound: cDebtCompound >= 0 ? SL.parseNum(SL.get(row, cDebtCompound)) : null,
      });
    }

    return { tranches: result, reportDate: reportDate };
  };

  // ─── "Справочники" parser ─────────────────────────────────────────────────
  // Key/value sheet — fetched with &headers=0 so rows keep their positions:
  //   col A параметр · col B значение · col E проекты · col F группы
  SL.parseParams = function (table) {
    var pt = SL.parseTable(table);
    var out = {
      reportDate: null, reconcileDate: null,
      invLimit: null, corpRate: null, capPeriod: null,
      shares: {}, sharesAA: {}, contributions: {},
      projects: [], groups: [],
    };
    if (!pt.rows.length) return out;

    // Списки проектов (E) и групп (F) лежат сплошным блоком под своими
    // заголовками. Ниже на листе те же колонки заняты блоком «МАППИНГ
    // НОСИТЕЛЬ → ГРУППА», поэтому читаем только до первой пустой строки.
    function readBlock(col, header) {
      var out = [], started = false;
      for (var i = 0; i < pt.rows.length; i++) {
        var v = String(SL.get(pt.rows[i], col) || '').trim();
        if (!started) { if (v === header) started = true; continue; }
        if (!v) break;
        if (out.indexOf(v) === -1) out.push(v);
      }
      return out;
    }
    out.projects = readBlock(4, 'Проекты');
    out.groups   = readBlock(5, 'Группы');

    function groupIn(label) {
      var m = label.match(/«([^»]+)»/);
      if (m) {
        var quoted = m[1].trim();
        for (var i = 0; i < out.groups.length; i++) {
          if (out.groups[i].toLowerCase() === quoted.toLowerCase()) return out.groups[i];
        }
        return quoted;
      }
      for (var j = 0; j < out.groups.length; j++) {
        if (label.indexOf(out.groups[j].toLowerCase()) !== -1) return out.groups[j];
      }
      return null;
    }

    pt.rows.forEach(function (row) {
      var label = String(SL.get(row, 0) || '').trim().toLowerCase();
      if (!label) return;
      var raw = SL.get(row, 1);
      var fmtV = SL.getFmt(row, 1);
      if (raw == null || raw === '') return;

      if (label.indexOf('дата отчёта') === 0)              out.reportDate    = SL.parseDate(raw, fmtV);
      else if (label.indexOf('дата последней сверки') === 0) out.reconcileDate = SL.parseDate(raw, fmtV);
      else if (label.indexOf('инвестиционный лимит') === 0)  out.invLimit      = SL.parseNum(raw);
      else if (label.indexOf('процент по корп договору') === 0) out.corpRate   = SL.parseRate(raw);
      else if (label.indexOf('период капитализации') === 0)  out.capPeriod     = String(raw).trim().toLowerCase();
      else if (label.indexOf('доля группы') === 0) {
        var g = groupIn(label);
        if (g) (/\sаа\s*$/.test(label) ? out.sharesAA : out.shares)[g] = SL.parseRate(raw);
      } else if (label.indexOf('взнос') === 0) {
        var g2 = groupIn(label);
        if (g2) out.contributions[g2] = SL.parseNum(raw);
      }
    });

    return out;
  };

  // ─── "Журнал движений" parser ──────────────────────────────────────────────
  // Actual columns (verified 2026-04-30):
  //  0 — ID движения
  //  1 — ID транша (обязательно!)
  //  2 — Контрагент
  //  3 — Группа
  //  4 — Проект
  //  5 — Тип движения
  //  6 — Дата движения
  //  7 — Сумма
  //  8 — Комментарий
  SL.parseMovements = function (table) {
    var pt = SL.parseTable(table);
    var h = pt.headers;

    var cID       = SL.findCol(h, ['id движения']);
    var cTranche  = SL.findCol(h, ['id транша', 'транша']);
    var cCarrier  = SL.findCol(h, ['контрагент', 'заимодавец', 'лицо']);
    var cProject  = SL.findCol(h, ['проект']);
    var cType     = SL.findCol(h, ['тип движения', 'тип']);
    var cDate     = SL.findCol(h, ['дата движения', 'дата']);
    var cSum      = SL.findCol(h, ['сумма']);
    var cComment  = SL.findCol(h, ['комментарий', 'примечание']);

    var result = [];
    for (var i = 0; i < pt.rows.length; i++) {
      var row = pt.rows[i];
      var rawId = SL.get(row, cID);
      if (!rawId || typeof rawId !== 'string' || !/^M\d+/.test(rawId.trim())) continue;
      var sumRaw = SL.get(row, cSum);
      var sum = typeof sumRaw === 'number' ? sumRaw : parseFloat(String(sumRaw || '').replace(/\s/g, '').replace(',', '.')) || null;
      if (!sum) continue;

      result.push({
        id:      rawId.trim(),
        tranche: cTranche >= 0 ? String(SL.get(row, cTranche) || '').trim() || null : null,
        carrier: cCarrier >= 0 ? String(SL.get(row, cCarrier) || '').trim() || null : null,
        project: cProject >= 0 ? String(SL.get(row, cProject) || '').trim() || null : null,
        type:    cType >= 0 ? String(SL.get(row, cType) || '').trim() || null : null,
        date:    cDate >= 0 ? SL.parseDate(SL.get(row, cDate), SL.getFmt(row, cDate)) : null,
        sum:     sum,
        comment: cComment >= 0 ? String(SL.get(row, cComment) || '').trim() || null : null,
      });
    }
    return result.filter(function (m) { return m.tranche; });
  };

  // ─── "Ставки ЦБ" parser ───────────────────────────────────────────────────
  // Actual columns (verified 2026-04-30):
  //  0 — №
  //  1 — Дата начала
  //  2 — Дата окончания (включ.)
  //  3 — Ставка ЦБ
  SL.parseCBRates = function (table) {
    var pt = SL.parseTable(table);
    var h = pt.headers;

    var cStart = SL.findCol(h, ['дата начала', 'начала', 'с ', 'дата']);
    var cEnd   = SL.findCol(h, ['дата окончания', 'окончания', 'по ', 'конца']);
    var cRate  = SL.findCol(h, ['ставка цб', 'ставка', 'процент', '%']);

    var result = [];
    for (var i = 0; i < pt.rows.length; i++) {
      var row = pt.rows[i];
      var start = cStart >= 0 ? SL.parseDate(SL.get(row, cStart), SL.getFmt(row, cStart)) : null;
      var end   = cEnd >= 0   ? SL.parseDate(SL.get(row, cEnd), SL.getFmt(row, cEnd)) : null;
      var rate  = SL.parseRate(SL.get(row, cRate));
      if (start && rate != null) {
        result.push({ start: start, end: end, rate: rate });
      }
    }
    return result.sort(function (a, b) { return a.start.localeCompare(b.start); });
  };

  // ─── Main load ─────────────────────────────────────────────────────────────
  // gviz skips rows hidden by Google Sheets row-groups AND active filters.
  // To avoid this, individual group sheets (N&K, Пресняков, Чил-Акопов) are
  // always fetched as the primary tranche source — they contain the same
  // formula-calculated columns and are unlikely to have collapsed sections.
  // The consolidated "Реестр траншей" is still fetched for reportDate and to
  // catch any tranches that don't belong to a known group sheet.
  SL.loadFromSheets = async function (forceFresh) {
    var cfg = SL.getConfig();
    var cacheKey = 'v6|' + cfg.spreadsheetId + '|' + cfg.sheetReestр + '|' + cfg.sheetJournal +
                   '|' + cfg.sheetCBRates + '|' + cfg.sheetParams;

    if (!forceFresh) {
      var cached = SL.getCached(cacheKey);
      if (cached) return Object.assign({}, cached, { _fromCache: true });
    }

    var errors = [];
    async function safe(name, opts) {
      try { return await SL.fetchSheet(cfg.spreadsheetId, name, opts); }
      catch (e) { errors.push(e.message); return null; }
    }

    // Справочники грузим первым — оттуда берётся актуальный список групп,
    // а значит и набор листов, которые нужно прочитать следом.
    var tParams = await safe(cfg.sheetParams || 'Справочники', { rawRows: true });
    var params  = tParams ? SL.parseParams(tParams) : SL.parseParams(null);
    var groupNames = params.groups.length ? params.groups : SL.STATIC.groups;

    // Fetch everything in parallel: consolidated + all group sheets + journal + CB rates
    var allFetches = [safe(cfg.sheetReestр), safe(cfg.sheetJournal), safe(cfg.sheetCBRates)]
      .concat(groupNames.map(function (g) { return safe(g); }));
    var allTables = await Promise.all(allFetches);

    var tReestр  = allTables[0];
    var tJournal = allTables[1];
    var tCB      = allTables[2];
    var tGroups  = allTables.slice(3); // parallel to groupNames

    if (!tReestр && tGroups.every(function (t) { return !t; })) {
      throw new Error(
        'Не удалось загрузить данные.\n' +
        (errors[0] || '') +
        '\n\nПроверьте: таблица должна быть открыта «Всем с ссылкой — Просмотр».'
      );
    }

    // Build tranche list: individual group sheets first (not affected by
    // row-groups or filters on the consolidated sheet), then supplement with
    // any tranches from the consolidated sheet that weren't in any group sheet.
    var seen = new Set();
    var tranches = [];

    tGroups.forEach(function (t) {
      if (!t) return;
      SL.parseTranches(t).tranches.forEach(function (tr) {
        if (!seen.has(tr.id)) { seen.add(tr.id); tranches.push(tr); }
      });
    });

    var consolidatedResult = tReestр ? SL.parseTranches(tReestр) : { tranches: [], reportDate: null };
    consolidatedResult.tranches.forEach(function (tr) {
      if (!seen.has(tr.id)) { seen.add(tr.id); tranches.push(tr); }
    });

    tranches.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });

    var today      = new Date().toISOString().slice(0, 10);
    var reportDate = params.reportDate || consolidatedResult.reportDate || today;
    var movements  = tJournal ? SL.parseMovements(tJournal) : [];
    var cbrates    = tCB      ? SL.parseCBRates(tCB) : [];

    // Порядок проектов — из «Справочников», остальные добавляются в конец
    var ORDER = params.projects.length ? params.projects : SL.STATIC.projects;
    var projSet = new Set(tranches.map(function (t) { return t.project; }).filter(Boolean));
    var projects = ORDER.filter(function (p) { return projSet.has(p); });
    projSet.forEach(function (p) { if (projects.indexOf(p) === -1) projects.push(p); });

    function withFallback(obj, fallback) {
      var out = Object.assign({}, fallback);
      Object.keys(obj).forEach(function (k) { if (obj[k] != null) out[k] = obj[k]; });
      return out;
    }

    var dataset = {
      reportDate:    reportDate,
      // Сложные проценты в таблице считаются на TODAY(), а не на дату отчёта.
      compoundDate:  today,
      reconcileDate: params.reconcileDate || reportDate,
      shares:        withFallback(params.shares,        SL.STATIC.shares),
      sharesAA:      withFallback(params.sharesAA,      SL.STATIC.sharesAA),
      contributions: withFallback(params.contributions, SL.STATIC.contributions),
      invLimit:      params.invLimit != null ? params.invLimit
                     : (cfg.invLimit !== undefined ? cfg.invLimit : SL.STATIC.invLimit),
      corpRate:      params.corpRate  != null ? params.corpRate  : SL.STATIC.corpRate,
      capPeriod:     params.capPeriod || SL.STATIC.capPeriod,
      projects:      projects,
      groups:        groupNames,
      tranches:      tranches,
      movements:     movements,
      cbrates:       cbrates,
      _source:       'sheets',
      _loadedAt:     new Date().toISOString(),
      _warnings:     errors.concat(tParams ? [] : ['Лист «Справочники» не прочитан — доли и лимиты взяты из резервных значений.']),
    };

    SL.setCache(cacheKey, dataset);
    return dataset;
  };

  window.SL = SL;
})();
