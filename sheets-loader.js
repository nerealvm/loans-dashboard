// Google Sheets data loader
// Uses the Google Visualization (gviz/tq) endpoint — works for sheets shared
// as "Anyone with the link can view" without any API key.
//
// Sheet names discovered from the actual spreadsheet:
//   "Реестр траншей"  — all 157 tranches, all groups (formula aggregation)
//   "Журнал движений" — 44 movements (manually entered returns + % payments)
//   "Ставки ЦБ"       — CB rate history with explicit start/end dates

(function () {
  'use strict';

  var SL = {};

  // ─── Default config ────────────────────────────────────────────────────────
  SL.DEFAULTS = {
    enabled: true,
    spreadsheetId: '1bvHJQHH6Enecw095xg1xkSb5N5z5a-BF',
    sheetReestр:   'Реестр траншей',
    sheetJournal:  'Журнал движений',
    sheetCBRates:  'Ставки ЦБ',
    cacheTTLMinutes: 60,
  };

  // Shares / contributions / investment limit — stable, update here if changed
  SL.STATIC = {
    shares:        { 'Пресняков': 0.4, 'N&K': 0.357, 'Чил-Акопов': 0.243 },
    contributions: { 'Пресняков': 200000000, 'N&K': 100000000, 'Чил-Акопов': null },
    invLimit:      300000000,
    groups:        ['Пресняков', 'N&K', 'Чил-Акопов'],
  };

  // ─── Config helpers ────────────────────────────────────────────────────────
  SL.getConfig = function () {
    try {
      var s = localStorage.getItem('kapital_sheets_config');
      if (s) return Object.assign({}, SL.DEFAULTS, JSON.parse(s));
    } catch (e) {}
    return Object.assign({}, SL.DEFAULTS);
  };

  SL.setConfig = function (partial) {
    var cfg = Object.assign(SL.getConfig(), partial);
    localStorage.setItem('kapital_sheets_config', JSON.stringify(cfg));
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
  SL.fetchSheet = async function (spreadsheetId, sheetName) {
    var url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId +
              '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheetName);
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

  // ─── "Реестр траншей" parser ───────────────────────────────────────────────
  // Actual columns (verified from live sheet 2026-04-30):
  //  0 — ID транша (long header ending with "ID транша …ГРУППА: N&K")
  //  1 — Группа
  //  2 — Юр лицо  (carrier)
  //  3 — Проект
  //  4 — Сумма
  //  5 — № договора
  //  6 — Дата договора
  //  7 — Дата транша
  //  8 — Ставка (на момент)
  //  9 — Тип ставки
  // 10 — Надбавка (плав.)
  // 11 — Принадлежность (kind)
  // 12 — Срок возврата
  // 13 — Дата отчёта
  // 14 — Дата посл. сверки
  // 15 — Статус сверки
  // 16 — Σ возвратов (транш)
  // 17 — Остаток тела (транш)
  // 18 — Дней от транша
  // 19 — Начислено % (транш)
  // 20 — Σ выплат % (журнал)
  // 21 — Задолженность % (транш)
  // 22 — Строка транша
  // 23 — Комментарий
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
    var cRate        = SL.findCol(h, ['ставка (на момент)', 'ставка']);
    var cRateType    = SL.findCol(h, ['тип ставки']);
    var cAddRate     = SL.findCol(h, ['надбавка', 'цб+', '+к цб']);
    var cKind        = SL.findCol(h, ['принадлежность', 'вид займа', 'тип займа', 'вид']);
    var cTerm        = SL.findCol(h, ['срок возврата', 'срок']);
    var cStatus      = SL.findCol(h, ['статус сверки', 'статус']);
    var cComment     = SL.findCol(h, ['комментарий', 'примечание']);
    var cReportDate  = SL.findCol(h, ['дата отчёта']);

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

      var rateRaw    = SL.get(row, cRate);
      var rate       = SL.parseRate(rateRaw);
      var addRateRaw = SL.get(row, cAddRate);
      var addRate    = SL.parseRate(addRateRaw) || 0;
      var rtRaw      = SL.get(row, cRateType);
      var rateType   = rtRaw && String(rtRaw).toLowerCase().indexOf('плав') !== -1 ? 'плав' : 'фикс';
      var sumRaw     = SL.get(row, cSum);
      var sum        = typeof sumRaw === 'number' ? sumRaw : parseFloat(String(sumRaw || '').replace(/\s/g, '').replace(',', '.')) || null;

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
        rateType:     rateType,
        addRate:      addRate,
        kind:         cKind >= 0 ? String(SL.get(row, cKind) || '').trim() || null : null,
        term:         cTerm >= 0 && typeof SL.get(row, cTerm) === 'number' ? SL.get(row, cTerm) : null,
        reconStatus:  cStatus >= 0 ? String(SL.get(row, cStatus) || '').trim() || null : null,
        comment:      cComment >= 0 ? String(SL.get(row, cComment) || '').trim() || null : null,
      });
    }

    return { tranches: result, reportDate: reportDate };
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
  SL.loadFromSheets = async function (forceFresh) {
    var cfg = SL.getConfig();
    var cacheKey = 'v3|' + cfg.spreadsheetId + '|' + cfg.sheetReestр + '|' + cfg.sheetJournal + '|' + cfg.sheetCBRates;

    if (!forceFresh) {
      var cached = SL.getCached(cacheKey);
      if (cached) return Object.assign({}, cached, { _fromCache: true });
    }

    var errors = [];
    async function safe(name) {
      try { return await SL.fetchSheet(cfg.spreadsheetId, name); }
      catch (e) { errors.push(e.message); return null; }
    }

    var [tReestр, tJournal, tCB] = await Promise.all([
      safe(cfg.sheetReestр),
      safe(cfg.sheetJournal),
      safe(cfg.sheetCBRates),
    ]);

    if (!tReestр) {
      throw new Error(
        'Не удалось загрузить лист «' + cfg.sheetReestр + '».\n' +
        (errors[0] || '') +
        '\n\nПроверьте: таблица должна быть открыта «Всем с ссылкой — Просмотр».'
      );
    }

    var trancheResult = SL.parseTranches(tReestр);
    var tranches   = trancheResult.tranches;
    var reportDate = trancheResult.reportDate || new Date().toISOString().slice(0, 10);
    var movements  = tJournal ? SL.parseMovements(tJournal) : [];
    var cbrates    = tCB      ? SL.parseCBRates(tCB) : [];

    // Derive project list preserving canonical order
    var ORDER = ['Биотех', 'Ассортимент Агро', 'ОТЗ/ОПТ Трейдинг', 'NU TREAT'];
    var projSet = new Set(tranches.map(function (t) { return t.project; }).filter(Boolean));
    var projects = ORDER.filter(function (p) { return projSet.has(p); });
    projSet.forEach(function (p) { if (projects.indexOf(p) === -1) projects.push(p); });

    var dataset = {
      reportDate:    reportDate,
      reconcileDate: reportDate,
      shares:        SL.STATIC.shares,
      contributions: SL.STATIC.contributions,
      invLimit:      cfg.invLimit !== undefined ? cfg.invLimit : SL.STATIC.invLimit,
      projects:      projects,
      groups:        SL.STATIC.groups,
      tranches:      tranches,
      movements:     movements,
      cbrates:       cbrates,
      _source:       'sheets',
      _loadedAt:     new Date().toISOString(),
      _warnings:     errors,
    };

    SL.setCache(cacheKey, dataset);
    return dataset;
  };

  window.SL = SL;
})();
