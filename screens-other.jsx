// Screens: Реестр траншей, Журнал движений, Группы, Паритет, Ставки ЦБ.

const { useState: useStateS, useMemo: useMemoS } = React;

/* =================== РЕЕСТР =================== */

function TrancheRow({ t, onSelect }){
  const fully = t.balance === 0 && t.returns > 0;
  return (
    <tr onClick={()=>onSelect(t)} style={{cursor:'pointer'}}>
      <td className="id-cell">{t.id}</td>
      <td className="muted">{fmt.dateShort(t.date)}</td>
      <td className="strong" style={{maxWidth:220, overflow:'hidden', textOverflow:'ellipsis'}}>{t.carrier?.split('(')[0].trim() || '—'}</td>
      <td><span className={'tag ' + fmt.projectClass(t.project)}>{fmt.projectShort(t.project)}</span></td>
      <td><span className={'tag ' + fmt.kindClass(t.kind)}>{t.kind || '—'}</span></td>
      <td className="num strong">{fmt.money(t.sum)}</td>
      <td className="num muted">{fmt.money(t.returns)}</td>
      <td className="num strong" style={{color: fully ? 'var(--fg-3)' : 'var(--fg-0)'}}>{fmt.money(t.balance)}</td>
      <td>
        {t.rateType === 'плав'
          ? <span className="tag rate-flo">ЦБ +{fmt.pct(t.addRate||0,1)}</span>
          : <span className="tag rate-fix">{fmt.pct(t.rate||0,1)}</span>}
      </td>
      <td className="num">{fmt.money(t.accrued, {compact:true})}</td>
      <td className="num" style={{color: t.debtPct > 0 ? 'var(--warn)' : 'var(--fg-3)'}}>{fmt.money(t.debtPct, {compact:true})}</td>
      <td className="muted">{fmt.days(t.daysFrom)}</td>
    </tr>
  );
}

function ScreenRegistry({ dataset, computed, selectedProj, setSelectedProj, projAgg, onSelect }){
  const [search, setSearch] = useStateS('');
  const [groupFilter, setGroupFilter] = useStateS('all');

  const filt = useMemoS(()=> {
    return computed.filter(t => {
      if (!selectedProj.includes(t.project)) return false;
      if (groupFilter !== 'all' && t.group !== groupFilter) return false;
      if (search){
        const s = search.toLowerCase();
        if (!(t.id.toLowerCase().includes(s) ||
              (t.carrier||'').toLowerCase().includes(s) ||
              (t.kind||'').toLowerCase().includes(s) ||
              (t.project||'').toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [computed, selectedProj, groupFilter, search]);

  const totals = useMemoS(()=> ({
    issued: filt.reduce((s,t)=>s+(t.sum||0),0),
    returns: filt.reduce((s,t)=>s+(t.returns||0),0),
    balance: filt.reduce((s,t)=>s+(t.balance||0),0),
    accrued: filt.reduce((s,t)=>s+(t.accrued||0),0),
    debtPct: filt.reduce((s,t)=>s+(t.debtPct||0),0),
  }), [filt]);

  return (
    <div className="content">
      <div className="page-eyebrow">Раздел · Реестр</div>
      <h1 className="page-title">Реестр траншей</h1>
      <div className="page-sub">Все займы по дате выдачи. Каждая строка — отдельный транш с остатком тела, накопленными % и долгом по %.</div>

      <FilterBar projects={dataset.projects} selected={selectedProj} setSelected={setSelectedProj} projAgg={projAgg} />

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Транши</div>
          <div className="panel-sub">{filt.length} из {computed.length}</div>
          <div className="panel-actions">
            <div className="seg-toggle">
              {['all','Пресняков','N&K','Чил-Акопов'].map(g => (
                <button key={g} className={groupFilter===g?'on':''} onClick={()=>setGroupFilter(g)}>{g==='all'?'все группы':g}</button>
              ))}
            </div>
            <input className="search-input" placeholder="ID, контрагент, тип…" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
        </div>
        <div className="t-wrap">
          <table className="t">
            <thead><tr>
              <th>ID</th><th>Дата</th><th>Контрагент</th><th>Проект</th><th>Тип</th>
              <th className="num">Тело</th><th className="num">Возвращено</th><th className="num">Остаток</th>
              <th>Ставка</th>
              <th className="num">Начислено %</th><th className="num">Долг %</th><th>Дней</th>
            </tr></thead>
            <tbody>
              {filt.map(t => <TrancheRow key={t.id} t={t} onSelect={onSelect}/>)}
            </tbody>
            <tfoot><tr>
              <td colSpan={5} className="muted">Итого по {filt.length}</td>
              <td className="num">{fmt.money(totals.issued)}</td>
              <td className="num">{fmt.money(totals.returns)}</td>
              <td className="num">{fmt.money(totals.balance)}</td>
              <td></td>
              <td className="num">{fmt.money(totals.accrued, {compact:true})}</td>
              <td className="num">{fmt.money(totals.debtPct, {compact:true})}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =================== ЖУРНАЛ =================== */

function ScreenJournal({ dataset, onAdd }){
  const [search, setSearch] = useStateS('');
  const [type, setType] = useStateS('all');
  const sorted = useMemoS(()=> [...dataset.movements].sort((a,b)=>(b.date||'').localeCompare(a.date||'')), [dataset.movements]);
  const filt = sorted.filter(m => {
    if (type !== 'all' && m.type !== type) return false;
    if (search){
      const s = search.toLowerCase();
      if (!(m.id.toLowerCase().includes(s) ||
            m.tranche.toLowerCase().includes(s) ||
            (m.carrier||'').toLowerCase().includes(s) ||
            (m.comment||'').toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const sumBack = filt.filter(m=>m.type==='Возврат тела').reduce((s,m)=>s+m.sum,0);
  const sumPct  = filt.filter(m=>m.type==='Выплата %').reduce((s,m)=>s+m.sum,0);

  return (
    <div className="content">
      <div className="page-eyebrow">Раздел · Журнал</div>
      <h1 className="page-title">Журнал движений</h1>
      <div className="page-sub">Все исторические возвраты тела и выплаты процентов. Каждое движение должно быть привязано к траншу — это строит расчёт остатков.</div>

      <div className="kpi-grid" style={{gridTemplateColumns: 'repeat(3, 1fr)'}}>
        <KPI label="Возвратов тела" value={dataset.movements.filter(m=>m.type==='Возврат тела').length} unit="шт"
             sub={`сумма ${fmt.money(dataset.movements.filter(m=>m.type==='Возврат тела').reduce((s,m)=>s+m.sum,0), {compact:true})}`} />
        <KPI label="Выплат %" value={dataset.movements.filter(m=>m.type==='Выплата %').length} unit="шт"
             sub={`сумма ${fmt.money(dataset.movements.filter(m=>m.type==='Выплата %').reduce((s,m)=>s+m.sum,0), {compact:true})}`} />
        <KPI label="В фильтре" value={filt.length} unit="зап"
             sub={`возвр ${fmt.money(sumBack,{compact:true})} · % ${fmt.money(sumPct,{compact:true})}`} accent />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Лента движений</div>
          <div className="panel-sub">{filt.length} записей</div>
          <div className="panel-actions">
            <div className="seg-toggle">
              {[['all','все'],['Возврат тела','тело'],['Выплата %','%']].map(([k,l]) => (
                <button key={k} className={type===k?'on':''} onClick={()=>setType(k)}>{l}</button>
              ))}
            </div>
            <input className="search-input" placeholder="ID, контрагент, комментарий…" value={search} onChange={e=>setSearch(e.target.value)} />
            <button className="btn primary" onClick={onAdd}>{Icons.plus}<span>Движение</span></button>
          </div>
        </div>
        <div className="t-wrap">
          <table className="t">
            <thead><tr>
              <th>ID</th><th>Дата</th><th>Тип</th><th>Транш</th><th>Контрагент</th><th>Проект</th>
              <th className="num">Сумма</th><th>Комментарий</th>
            </tr></thead>
            <tbody>
              {filt.map(m => (
                <tr key={m.id}>
                  <td className="id-cell">{m.id}</td>
                  <td className="muted">{fmt.dateShort(m.date)}</td>
                  <td><span className={'tag ' + (m.type==='Возврат тела' ? 'move-back' : 'move-pct')}>{m.type}</span></td>
                  <td className="id-cell">{m.tranche}</td>
                  <td className="strong" style={{maxWidth:240, overflow:'hidden', textOverflow:'ellipsis'}}>{m.carrier?.split('(')[0].trim()}</td>
                  <td><span className={'tag ' + fmt.projectClass(m.project)}>{fmt.projectShort(m.project)}</span></td>
                  <td className="num strong">{fmt.money(m.sum)}</td>
                  <td className="muted" style={{maxWidth: 260, whiteSpace:'normal'}}>{m.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =================== ГРУППЫ =================== */

function ScreenGroups({ dataset, computed }){
  const [active, setActive] = useStateS(dataset.groups[0]);
  const tabsAgg = {};
  for (const g of dataset.groups) tabsAgg[g] = computed.filter(t=>t.group===g);
  const own = tabsAgg[active] || [];

  const totals = {
    issued: own.reduce((s,t)=>s+(t.sum||0),0),
    returns: own.reduce((s,t)=>s+(t.returns||0),0),
    balance: own.reduce((s,t)=>s+(t.balance||0),0),
    accrued: own.reduce((s,t)=>s+(t.accrued||0),0),
    paidPct: own.reduce((s,t)=>s+(t.paidPct||0),0),
    debtPct: own.reduce((s,t)=>s+(t.debtPct||0),0),
  };

  const expected = dataset.shares[active];
  const totalAll = computed.reduce((s,t)=>s+(t.balance||0),0);
  const factual = totalAll ? totals.balance / totalAll : 0;
  const contributed = dataset.contributions[active];

  return (
    <div className="content">
      <div className="page-eyebrow">Раздел · Группы акционеров</div>
      <h1 className="page-title">Группы</h1>
      <div className="page-sub">Все транши, выданные через каждую группу. Сравнение плановой и фактической доли.</div>

      <div className="group-tabs">
        {dataset.groups.map(g => (
          <button key={g} className={active===g?'on':''} onClick={()=>setActive(g)}>
            {g} <span className="tab-meta">{tabsAgg[g].length}</span>
          </button>
        ))}
      </div>

      <div className="kpi-grid" style={{marginTop:18}}>
        <KPI label="Тело в работе" value={fmt.money(totals.balance, {compact:true})}
             sub={`выдано ${fmt.money(totals.issued, {compact:true})} · возвращено ${fmt.money(totals.returns, {compact:true})}`} accent />
        <KPI label="Внесено в капитал"
             value={contributed != null ? fmt.money(contributed, {compact:true}) : 'не указано'}
             sub={`плановая доля ${fmt.pct(expected, 1)}`} />
        <KPI label="Фактическая доля" value={fmt.pct(factual, 1)}
             sub={`Δ ${factual >= expected ? '+' : ''}${fmt.pct(factual - expected, 2)}`}
             bar={factual} />
        <KPI label="Долг по %" value={fmt.money(totals.debtPct, {compact:true})}
             sub={`накоплено ${fmt.money(totals.accrued,{compact:true})} · выплачено ${fmt.money(totals.paidPct,{compact:true})}`} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Транши группы «{active}»</div>
          <div className="panel-sub">{own.length} траншей</div>
        </div>
        <div className="t-wrap">
          <table className="t">
            <thead><tr>
              <th>ID</th><th>Дата</th><th>Контрагент</th><th>Проект</th><th>Тип</th>
              <th className="num">Тело</th><th className="num">Остаток</th><th>Ставка</th>
              <th className="num">Долг %</th>
            </tr></thead>
            <tbody>
              {own.map(t => (
                <tr key={t.id}>
                  <td className="id-cell">{t.id}</td>
                  <td className="muted">{fmt.dateShort(t.date)}</td>
                  <td className="strong" style={{maxWidth: 220, overflow:'hidden', textOverflow:'ellipsis'}}>{t.carrier?.split('(')[0].trim()}</td>
                  <td><span className={'tag ' + fmt.projectClass(t.project)}>{fmt.projectShort(t.project)}</span></td>
                  <td><span className={'tag ' + fmt.kindClass(t.kind)}>{t.kind||'—'}</span></td>
                  <td className="num strong">{fmt.money(t.sum)}</td>
                  <td className="num">{fmt.money(t.balance)}</td>
                  <td>{t.rateType==='плав' ? <span className="tag rate-flo">ЦБ +{fmt.pct(t.addRate||0,1)}</span> : <span className="tag rate-fix">{fmt.pct(t.rate||0,1)}</span>}</td>
                  <td className="num" style={{color: t.debtPct>0?'var(--warn)':'var(--fg-3)'}}>{fmt.money(t.debtPct,{compact:true})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =================== ПАРИТЕТ =================== */

function ScreenParity({ dataset, computed }){
  const groupAgg = E.aggregateByGroup(computed, dataset.projects);
  const totalBal = Object.values(groupAgg).reduce((s,g)=>s+g.balance,0);
  const totalIssued = Object.values(groupAgg).reduce((s,g)=>s+g.issued,0);

  return (
    <div className="content">
      <div className="page-eyebrow">Раздел · Паритет</div>
      <h1 className="page-title">Паритет долей</h1>
      <div className="page-sub">Сравнение плановой структуры капитала (40% / 35,7% / 24,3%) с фактическими долями в выданных и активных займах.</div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Тело в работе на {fmt.date(dataset.reportDate)}</div>
          <div className="panel-sub">{fmt.money(totalBal, {compact:true})} итого</div>
        </div>
        <div style={{padding:'18px 22px'}}>
          <div className="stacked">
            {dataset.groups.map((g, idx) => {
              const cls = ['p','n','c'][idx];
              const w = totalBal ? (groupAgg[g]?.balance||0) / totalBal * 100 : 0;
              return <div key={g} className={'seg ' + cls} style={{flex: w}}>{w > 6 ? fmt.pct(w/100, 1) : ''}</div>;
            })}
          </div>
          <div className="legend">
            {dataset.groups.map((g, idx) => (
              <span key={g}><span className="swatch" style={{background: ['#8fcfa3','#d9a55c','#9bb6e0'][idx]}}></span>{g}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">План vs Факт</div>
        </div>
        <div className="t-wrap">
          <table className="t">
            <thead><tr>
              <th>Группа</th>
              <th className="num">Внесено</th>
              <th className="num">Плановая доля</th>
              <th className="num">Выдано (тело)</th>
              <th className="num">Доля в выданном</th>
              <th className="num">Тело в работе</th>
              <th className="num">Доля факт.</th>
              <th className="num">Δ</th>
            </tr></thead>
            <tbody>
              {dataset.groups.map(g => {
                const a = groupAgg[g] || {};
                const expected = dataset.shares[g];
                const issuedShare = totalIssued ? a.issued/totalIssued : 0;
                const balShare = totalBal ? a.balance/totalBal : 0;
                const delta = balShare - expected;
                return (
                  <tr key={g}>
                    <td>
                      <span className="tag" style={{background: 'transparent', color: fmt.groupColor(g), borderColor: fmt.groupColor(g)+'55'}}>
                        {fmt.groupInitials(g)}
                      </span>{' '}
                      <span className="strong">{g}</span>
                    </td>
                    <td className="num">{dataset.contributions[g] != null ? fmt.money(dataset.contributions[g]) : '—'}</td>
                    <td className="num">{fmt.pct(expected, 1)}</td>
                    <td className="num">{fmt.money(a.issued||0)}</td>
                    <td className="num">{fmt.pct(issuedShare, 1)}</td>
                    <td className="num strong">{fmt.money(a.balance||0)}</td>
                    <td className="num">{fmt.pct(balShare, 1)}</td>
                    <td className="num" style={{color: Math.abs(delta) < 0.02 ? 'var(--accent-strong)' : (delta > 0 ? 'var(--warn)' : 'var(--neg)')}}>
                      {delta>=0?'+':''}{fmt.pct(delta, 2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note" style={{marginTop:18}}>
        <span className="nlabel">прим.</span>
        Доля Чил-Акопова в капитале (24,3%) определена через остаток при долях Преснякова и N&K. Сумма в капитале не указана и может быть введена в Excel-снапшоте.
      </div>
    </div>
  );
}

/* =================== СТАВКИ ЦБ =================== */

function ScreenCB({ dataset }){
  const segs = E.normalizeCBRates(dataset.cbrates);
  const max = Math.max(...segs.map(s=>s.rate));
  const today = dataset.reportDate;
  const current = segs.find(s => s.start <= today && s.end >= today);

  return (
    <div className="content">
      <div className="page-eyebrow">Раздел · Ставки</div>
      <h1 className="page-title">Ключевая ставка ЦБ РФ</h1>
      <div className="page-sub">Историческая таблица ставок. По траншам с плавающей ставкой проценты пересчитываются по соответствующему сегменту.</div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        <KPI label="Текущая ставка"
             value={current ? fmt.pct(current.rate, 2) : '—'}
             sub={current ? `с ${fmt.dateShort(current.start)}` : ''}
             accent />
        <KPI label="Максимум" value={fmt.pct(max, 2)} sub={`в сегменте от ${fmt.dateShort(segs.find(s=>s.rate===max).start)}`} />
        <KPI label="Сегментов" value={segs.length} sub={`${fmt.dateShort(segs[0].start)} → сейчас`} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">История ставок</div>
          <div className="panel-sub">{segs.length} сегментов</div>
        </div>
        <div>
          {[...segs].reverse().map((s, i) => (
            <div key={i} className="rate-row" style={{background: s === current ? 'rgba(109,179,131,0.05)' : 'transparent'}}>
              <span className="rd">{fmt.dateShort(s.start)}</span>
              <div className="rb"><div style={{width: (s.rate / max * 100) + '%'}}></div></div>
              <span className="rv">{fmt.pct(s.rate, 2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.ScreenRegistry = ScreenRegistry;
window.ScreenJournal = ScreenJournal;
window.ScreenGroups = ScreenGroups;
window.ScreenParity = ScreenParity;
window.ScreenCB = ScreenCB;
window.KPI = KPI;
