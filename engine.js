// Расчётный движок: проценты, остатки, агрегаты.
// Все даты — ISO yyyy-mm-dd. Все ставки — доли (0.065 = 6.5%).
//
// Способ начисления зависит от принадлежности транша:
//
//   ИНВЕСТИЦИОННЫЕ — сложные проценты (колонка V реестра) по ставке корп
//   договора (Справочники!B18) с капитализацией (B19). Считаются на текущую
//   дату: в таблице там TODAY(), а не дата отчёта.
//
//   ОБОРОТНЫЕ и «СТАРОЕ ГОВНО» — простые проценты, факт/365 (колонка U) на
//   дату отчёта. Фикс — по ставке договора, плав — по сегментам ключа ЦБ
//   плюс надбавка.
//
// Оборотным считается всё, что не «инвестиционный», включая пустое поле.

(function(){
  const E = {};

  E.INVEST = 'инвестиционный';
  E.isInvest = (kind) => String(kind || '').trim().toLowerCase() === E.INVEST;

  E.daysBetween = function(aIso, bIso){
    if (!aIso || !bIso) return 0;
    const a = new Date(aIso + 'T00:00:00Z').getTime();
    const b = new Date(bIso + 'T00:00:00Z').getTime();
    return Math.round((b - a) / 86400000);
  };

  // Сегменты ставок ЦБ → массив {start, end, rate}. В таблице «Дата окончания
  // (включ.)» заполнена всегда, но на всякий случай выводим её из следующей строки.
  E.normalizeCBRates = function(rates){
    const sorted = [...(rates||[])].sort((a,b)=>a.start.localeCompare(b.start));
    const segs = [];
    for (let i = 0; i < sorted.length; i++){
      const s = sorted[i].start;
      const next = sorted[i+1];
      const e = sorted[i].end || (next ? E.addDays(next.start, -1) : '2099-12-31');
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

  // Периодов капитализации в году (Справочники!B19).
  E.capQ = function(period){
    const s = String(period || '').toLowerCase();
    if (s.includes('ежегод')) return 1;
    if (s.includes('ежеднев')) return 365;
    return 12; // ежемесячно — по умолчанию
  };

  // Коэффициент роста 1 рубля от даты `from` до `asOf` по сегментам ЦБ + надбавка.
  E.compoundGrowthCB = function(from, asOf, addRate, q, segs){
    let prod = 1;
    for (const seg of segs){
      const a = E.maxDate(seg.start, from);
      const b = E.minDate(E.addDays(seg.end, 1), asOf);
      const dd = E.daysBetween(a, b);
      if (dd > 0) prod *= Math.pow(1 + (seg.rate + addRate) / q, q * dd / 365);
    }
    return prod;
  };

  // Коэффициент роста 1 рубля по фиксированной ставке.
  E.compoundGrowthFixed = function(from, asOf, rate, q){
    const days = Math.max(0, E.daysBetween(from, asOf));
    return Math.pow(1 + rate / q, q * days / 365);
  };

  // Ставка по корп договору (колонка L). Приоритет — значение из таблицы.
  E.corpRateOf = function(tranche, params, segs){
    if (tranche.corpRate != null) return tranche.corpRate;
    if (E.isInvest(tranche.kind)) return params.corpRate;
    if (tranche.rateType === 'плав'){
      const last = segs.length ? segs[segs.length - 1].rate : 0;
      return last + (tranche.addRate || 0);
    }
    return tranche.contractRate != null ? tranche.contractRate : (tranche.rate || 0);
  };

  // Сложные проценты на дату `asOf` — повтор колонки V реестра.
  // `movements` можно передавать целиком: лишние отфильтруются по id транша.
  E.compoundAccrued = function(tranche, movements, asOf, segs, params){
    const sum = tranche.sum || 0;
    if (!tranche.date || !sum || asOf <= tranche.date) return 0;
    const q = E.capQ(params.capPeriod);
    const returns = movements.filter(m =>
      m.tranche === tranche.id && m.type === 'Возврат тела' && m.date && m.date < asOf);

    // Оборотный с плавающей ставкой — растём по сегментам ключа ЦБ.
    if (tranche.rateType === 'плав' && !E.isInvest(tranche.kind)){
      const add = tranche.addRate || 0;
      let total = sum * (E.compoundGrowthCB(tranche.date, asOf, add, q, segs) - 1);
      for (const m of returns){
        total -= m.sum * (E.compoundGrowthCB(m.date, asOf, add, q, segs) - 1);
      }
      return Math.max(0, total);
    }

    // Инвестиционные и оборотные с фиксом — по ставке корп договора.
    const r = E.corpRateOf(tranche, params, segs);
    if (r == null) return 0;
    let total = sum * (E.compoundGrowthFixed(tranche.date, asOf, r, q) - 1);
    for (const m of returns){
      total -= m.sum * (E.compoundGrowthFixed(m.date, asOf, r, q) - 1);
    }
    return Math.max(0, total);
  };

  // Простые проценты факт/365 на дату `asOf` — повтор колонки U реестра.
  // Начисляем на всё тело, затем вычитаем начисленное на возвращённые части
  // за период от их возврата. Ставка — договорная (не корповая).
  E.simpleAccrued = function(tranche, movements, asOf, segs){
    const sum = tranche.sum || 0;
    if (!tranche.date || !sum) return 0;
    const returns = movements.filter(m =>
      m.tranche === tranche.id && m.type === 'Возврат тела' && m.date && m.date < asOf);

    if (tranche.rateType === 'плав'){
      const add = tranche.addRate || 0;
      // Доля «рубль·год» за период [from, asOf] по сегментам ключа ЦБ.
      const factor = (from) => segs.reduce((acc, seg) => {
        const a = E.maxDate(seg.start, from);
        const b = E.minDate(E.addDays(seg.end, 1), asOf);
        const days = E.daysBetween(a, b);
        return days > 0 ? acc + (seg.rate + add) * days / 365 : acc;
      }, 0);
      let total = sum * factor(tranche.date);
      for (const m of returns) total -= m.sum * factor(m.date);
      return Math.max(0, total);
    }

    const r = tranche.contractRate != null ? tranche.contractRate : (tranche.rate || 0);
    let total = sum * r * Math.max(0, E.daysBetween(tranche.date, asOf)) / 365;
    for (const m of returns) total -= m.sum * r * E.daysBetween(m.date, asOf) / 365;
    return Math.max(0, total);
  };

  // Полный расчёт по траншу с учётом возвратов (тела) и выплат %.
  // Формульные колонки берём прямо из таблицы; пересчитываем локально только
  // если их нет или по траншу добавлено движение «на лету» (флаг _local).
  E.computeTranche = function(tranche, movements, dates, cbSegments, params){
    const own      = movements.filter(m => m.tranche === tranche.id);
    const hasLocal = own.some(m => m._local);
    const invest   = E.isInvest(tranche.kind);

    // Инвестиционные — сложные на текущую дату, оборотные — простые на отчётную.
    const asOf     = invest ? dates.compound : dates.report;
    const sheetVal = invest ? tranche.sheetCompound     : tranche.sheetSimple;
    const sheetDebt= invest ? tranche.sheetDebtCompound : tranche.sheetDebtSimple;
    const useSheet = !hasLocal && sheetVal != null;

    const returns = own.filter(m => m.type === 'Возврат тела').reduce((s,m)=>s + m.sum, 0);
    const paidPct = own.filter(m => m.type === 'Выплата %').reduce((s,m)=>s + m.sum, 0);
    const balance = (tranche.sum || 0) - returns;

    const accrued = useSheet ? sheetVal
      : invest ? E.compoundAccrued(tranche, own, asOf, cbSegments, params)
               : E.simpleAccrued(tranche, own, asOf, cbSegments);

    // Сложный долг (X) может уходить в минус при переплате, простой (Y) — нет.
    const debtPct = useSheet && sheetDebt != null ? sheetDebt
      : invest ? accrued - paidPct
               : Math.max(0, accrued - paidPct);

    return {
      ...tranche,
      returns, paidPct, balance,
      daysFrom: E.daysBetween(tranche.date, asOf),
      accrued,
      debtPct,
      accrualMode: invest ? 'сложные' : 'простые',
      accrualDate: asOf,
      _fromSheet: useSheet,
    };
  };

  // Полный расчёт всего реестра.
  E.computeAll = function(dataset){
    const segs = E.normalizeCBRates(dataset.cbrates);
    const dates = {
      // Сложные % в таблице считаются на TODAY(), простые — на дату отчёта.
      compound: dataset.compoundDate || new Date().toISOString().slice(0,10),
      report:   dataset.reportDate,
    };
    const params = { corpRate: dataset.corpRate, capPeriod: dataset.capPeriod };
    return dataset.tranches.map(t => E.computeTranche(t, dataset.movements, dates, segs, params));
  };

  const EMPTY = () => ({
    count:0, issued:0, returned:0, balance:0, accrued:0, paidPct:0, debtPct:0,
    investBalance:0, investDebtPct:0, workBalance:0, workDebtPct:0,
  });

  function add(acc, r){
    const invest = E.isInvest(r.kind);
    acc.count    += 1;
    acc.issued   += r.sum||0;
    acc.returned += r.returns||0;
    acc.balance  += r.balance||0;
    acc.accrued  += r.accrued||0;
    acc.paidPct  += r.paidPct||0;
    acc.debtPct  += r.debtPct||0;
    // Оборотное = всё, что не «инвестиционный», включая «старое говно».
    acc[invest ? 'investBalance' : 'workBalance'] += r.balance||0;
    acc[invest ? 'investDebtPct' : 'workDebtPct'] += r.debtPct||0;
    return acc;
  }

  // Агрегаты по фильтру проектов
  E.aggregate = function(rows, projects){
    return rows.filter(r => projects.includes(r.project)).reduce(add, EMPTY());
  };

  E.aggregateByGroup = function(rows, projects){
    const groups = {};
    for (const r of rows.filter(r => projects.includes(r.project))){
      if (!groups[r.group]) groups[r.group] = EMPTY();
      add(groups[r.group], r);
    }
    return groups;
  };

  E.aggregateByProject = function(rows){
    const out = {};
    for (const r of rows){
      if (!out[r.project]) out[r.project] = EMPTY();
      add(out[r.project], r);
    }
    return out;
  };

  window.E = E;
})();
