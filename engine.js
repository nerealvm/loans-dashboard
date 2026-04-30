// Расчётный движок: накопленные %, остатки, агрегаты.
// Все даты — ISO yyyy-mm-dd. Все ставки — доли (0.065 = 6.5%).
// Базис: simple interest, факт/365.

(function(){
  const E = {};

  E.daysBetween = function(aIso, bIso){
    if (!aIso || !bIso) return 0;
    const a = new Date(aIso + 'T00:00:00Z').getTime();
    const b = new Date(bIso + 'T00:00:00Z').getTime();
    return Math.round((b - a) / 86400000);
  };

  // Сегменты ставок ЦБ → массив {start, end, rate}, end = до следующего изменения - 1 день, последний — бесконечно.
  E.normalizeCBRates = function(rates){
    const sorted = [...rates].sort((a,b)=>a.start.localeCompare(b.start));
    const segs = [];
    for (let i = 0; i < sorted.length; i++){
      const s = sorted[i].start;
      const next = sorted[i+1];
      const e = next ? E.addDays(next.start, -1) : '2099-12-31';
      segs.push({ start: s, end: e, rate: sorted[i].rate });
    }
    return segs;
  };
  E.addDays = function(iso, n){
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0,10);
  };
  E.maxDate = (a,b) => (a > b ? a : b);
  E.minDate = (a,b) => (a < b ? a : b);

  // Сумма "тело * rate * days/365" для траншa за период [from, to] на ставке (фикс или плав).
  E.accruedFor = function(tranche, from, to, cbSegments){
    if (!from || !to || from > to) return 0;
    const principal = tranche._principalDuring || tranche.sum; // упрощение
    if (tranche.rateType === 'плав'){
      let total = 0;
      for (const seg of cbSegments){
        const a = E.maxDate(seg.start, from);
        const b = E.minDate(seg.end, to);
        if (a > b) continue;
        const days = E.daysBetween(a, b) + 1;
        total += principal * (seg.rate + (tranche.addRate || 0)) * days / 365;
      }
      return total;
    } else {
      const days = E.daysBetween(from, to) + 1;
      return principal * (tranche.rate || 0) * days / 365;
    }
  };

  // Полный расчёт по транша с учётом возвратов (тела) и выплат %.
  // Возвращает {accrued, paidPct, debtPct, returns, balance, daysFrom}.
  E.computeTranche = function(tranche, movements, reportDate, cbSegments){
    const own = movements.filter(m => m.tranche === tranche.id);
    const returns = own.filter(m => m.type === 'Возврат тела').reduce((s,m)=>s + m.sum, 0);
    const paidPct = own.filter(m => m.type === 'Выплата %').reduce((s,m)=>s + m.sum, 0);
    const balance = (tranche.sum || 0) - returns;
    const daysFrom = E.daysBetween(tranche.date, reportDate);

    // Накопленные %: по упрощённой формуле — на тело tranche.sum за период [date..reportDate],
    // минус «начисленное на возвращённую часть» за период [returnDate..reportDate].
    let accrued = 0;
    if (tranche.date && tranche.date <= reportDate){
      if (tranche.rateType === 'плав'){
        // на полное тело
        accrued = E.sumOnSegments(tranche.sum, tranche.date, reportDate, tranche.addRate||0, cbSegments);
        // вычитаем за период после возврата
        for (const m of own.filter(mm => mm.type === 'Возврат тела')){
          if (!m.date || m.date > reportDate) continue;
          accrued -= E.sumOnSegments(m.sum, m.date, reportDate, tranche.addRate||0, cbSegments);
        }
      } else {
        const r = tranche.rate || 0;
        const days = Math.max(0, E.daysBetween(tranche.date, reportDate));
        accrued = (tranche.sum || 0) * r * days / 365;
        for (const m of own.filter(mm => mm.type === 'Возврат тела')){
          if (!m.date || m.date > reportDate) continue;
          const d2 = Math.max(0, E.daysBetween(m.date, reportDate));
          accrued -= m.sum * r * d2 / 365;
        }
      }
    }
    accrued = Math.max(0, accrued);

    return {
      ...tranche,
      returns, paidPct, balance, daysFrom,
      accrued, debtPct: Math.max(0, accrued - paidPct),
    };
  };

  E.sumOnSegments = function(principal, from, to, addRate, segs){
    let total = 0;
    for (const seg of segs){
      const a = E.maxDate(seg.start, from);
      const b = E.minDate(seg.end, to);
      if (a > b) continue;
      const days = E.daysBetween(a, b);
      total += principal * (seg.rate + addRate) * days / 365;
    }
    return total;
  };

  // Полный расчёт всего реестра.
  E.computeAll = function(dataset){
    const segs = E.normalizeCBRates(dataset.cbrates);
    const enriched = dataset.tranches.map(t => E.computeTranche(t, dataset.movements, dataset.reportDate, segs));
    return enriched;
  };

  // Агрегаты по фильтру проектов
  E.aggregate = function(rows, projects){
    const filt = rows.filter(r => projects.includes(r.project));
    const sum = (k) => filt.reduce((s,r) => s + (r[k]||0), 0);
    return {
      count: filt.length,
      issued: sum('sum'),
      returned: sum('returns'),
      balance: sum('balance'),
      accrued: sum('accrued'),
      paidPct: sum('paidPct'),
      debtPct: sum('debtPct'),
    };
  };

  E.aggregateByGroup = function(rows, projects){
    const filt = rows.filter(r => projects.includes(r.project));
    const groups = {};
    for (const r of filt){
      const g = r.group;
      if (!groups[g]) groups[g] = { issued:0, returned:0, balance:0, accrued:0, paidPct:0, debtPct:0, count:0 };
      groups[g].issued += r.sum||0;
      groups[g].returned += r.returns||0;
      groups[g].balance += r.balance||0;
      groups[g].accrued += r.accrued||0;
      groups[g].paidPct += r.paidPct||0;
      groups[g].debtPct += r.debtPct||0;
      groups[g].count += 1;
    }
    return groups;
  };

  E.aggregateByProject = function(rows){
    const out = {};
    for (const r of rows){
      const p = r.project;
      if (!out[p]) out[p] = { issued:0, returned:0, balance:0, accrued:0, paidPct:0, debtPct:0, count:0 };
      out[p].issued += r.sum||0;
      out[p].returned += r.returns||0;
      out[p].balance += r.balance||0;
      out[p].accrued += r.accrued||0;
      out[p].paidPct += r.paidPct||0;
      out[p].debtPct += r.debtPct||0;
      out[p].count += 1;
    }
    return out;
  };

  window.E = E;
})();
