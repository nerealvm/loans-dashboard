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
        {E.isInvest(t.kind)
          ? <span className="tag kind-inv">{fmt.pct(t.corpRate ?? 0, 1)} корп</span>
          : t.rateType === 'плав'
            ? <span className="tag rate-flo">ЦБ +{fmt.pct(t.addRate||0,1)}</span>
            : <span className="tag rate-fix">{fmt.pct(t.rate||0,1)}</span>}
      </td>
      <td className="num">{fmt.money(t.accrued, {compact:true})}</td>
      <td className="num" style={{color: t.debtPct > 0 ? 'var(--warn)' : 'var(--fg-3)'}}>{fmt.money(t.debtPct, {compact:true})}</td>
      <td className="muted">{fmt.days(t.daysFrom)}</td>
    </tr>
  );
}

function Chevron({ open }){
  return (
    <svg viewBox="0 0 10 10" width="10" height="10"
         style={{display:'inline-block', verticalAlign:'middle', marginRight:6, flexShrink:0,
                 transition:'transform 0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)'}}>
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ScreenRegistry({ dataset, computed, selectedProj, setSelectedProj, projAgg, onSelect, groupFilter, setGroupFilter }){
  const [search, setSearch] = useStateS('');
  const [kindFilter, setKindFilter] = useStateS('all'); // all | invest | work
  const [collapsedGroups, setCollapsedGroups] = useStateS(new Set());
  const [collapsedCarriers, setCollapsedCarriers] = useStateS(new Set());

  function toggleGroup(g) {
    setCollapsedGroups(prev => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s; });
  }
  function toggleCarrier(c) {
    setCollapsedCarriers(prev => { const s = new Set(prev); s.has(c) ? s.delete(c) : s.add(c); return s; });
  }

  const filt = useMemoS(()=> {
    return computed.filter(t => {
      if (!selectedProj.includes(t.project)) return false;
      if (groupFilter !== 'all' && t.group !== groupFilter) return false;
      // Оборотное = всё, что не «инвестиционный» (включая «старое говно»).
      if (kindFilter === 'invest' && !E.isInvest(t.kind)) return false;
      if (kindFilter === 'work'   &&  E.isInvest(t.kind)) return false;
      if (search){
        const s = search.toLowerCase();
        if (!(t.id.toLowerCase().includes(s) ||
              (t.carrier||'').toLowerCase().includes(s) ||
              (t.kind||'').toLowerCase().includes(s) ||
              (t.project||'').toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [computed, selectedProj, groupFilter, kindFilter, search]);

  const totals = useMemoS(()=> ({
    issued: filt.reduce((s,t)=>s+(t.sum||0),0),
    returns: filt.reduce((s,t)=>s+(t.returns||0),0),
    balance: filt.reduce((s,t)=>s+(t.balance||0),0),
    accrued: filt.reduce((s,t)=>s+(t.accrued||0),0),
    debtPct: filt.reduce((s,t)=>s+(t.debtPct||0),0),
  }), [filt]);

  const grouped = useMemoS(()=> {
    if (groupFilter !== 'all') return null;
    return dataset.groups.map(g => {
      const rows = filt.filter(t => t.group === g);
      return {
        g,
        rows,
        sub: {
          issued:  rows.reduce((s,t)=>s+(t.sum||0),0),
          returns: rows.reduce((s,t)=>s+(t.returns||0),0),
          balance: rows.reduce((s,t)=>s+(t.balance||0),0),
          accrued: rows.reduce((s,t)=>s+(t.accrued||0),0),
          debtPct: rows.reduce((s,t)=>s+(t.debtPct||0),0),
        },
      };
    }).filter(x => x.rows.length > 0);
  }, [filt, groupFilter, dataset.groups]);

  const carrierGrouped = useMemoS(()=> {
    if (groupFilter === 'all') return null;
    const map = new Map();
    for (const t of filt) {
      const name = t.carrier?.split('(')[0].trim() || '—';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(t);
    }
    return Array.from(map.entries()).map(([carrier, rows]) => ({
      carrier,
      rows,
      sub: {
        issued:  rows.reduce((s,t)=>s+(t.sum||0),0),
        returns: rows.reduce((s,t)=>s+(t.returns||0),0),
        balance: rows.reduce((s,t)=>s+(t.balance||0),0),
        accrued: rows.reduce((s,t)=>s+(t.accrued||0),0),
        debtPct: rows.reduce((s,t)=>s+(t.debtPct||0),0),
      },
    }));
  }, [filt, groupFilter]);

  return (
    <div className="content">
      <div className="page-eyebrow">Раздел · Реестр</div>
      <h1 className="page-title">Реестр траншей</h1>
      <div className="page-sub">Все займы по дате выдачи. Каждая строка — отдельный транш с остатком тела, начисленными % и долгом по %. Инвестиционные — сложные проценты по ставке корп договора, оборотные и старые — простые по договорной ставке или ключу ЦБ + надбавка.</div>

      <FilterBar projects={dataset.projects} selected={selectedProj} setSelected={setSelectedProj} projAgg={projAgg} />

      <div className="panel panel-fill">
        <div className="panel-head">
          <div className="panel-title">Транши</div>
          <div className="panel-sub">{filt.length} из {computed.length}</div>
          <div className="panel-actions">
            <div className="seg-toggle">
              {['all'].concat(dataset.groups).map(g => (
                <button key={g} className={groupFilter===g?'on':''} onClick={()=>setGroupFilter(g)}>{g==='all'?'все группы':g}</button>
              ))}
            </div>
            <div className="seg-toggle">
              {[['all','все'],['invest','инвест'],['work','оборотные']].map(([v,label]) => (
                <button key={v} className={kindFilter===v?'on':''} onClick={()=>setKindFilter(v)}>{label}</button>
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
              {grouped
                ? grouped.map(({ g, rows, sub }) => {
                  const collapsed = collapsedGroups.has(g);
                  return (
                    <React.Fragment key={g}>
                      <tr className="t-group-hdr" onClick={() => toggleGroup(g)}>
                        <td colSpan={12}>
                          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                            <span>
                              <Chevron open={!collapsed} />
                              <span className="group-mark" style={{background: fmt.groupColor(g), display:'inline-grid', placeItems:'center', width:20, height:20, borderRadius:4, fontSize:10, fontWeight:700, color:'var(--bg-0)', marginRight:8, verticalAlign:'middle'}}>
                                {fmt.groupInitials(g)}
                              </span>
                              {g} · {rows.length} траншей
                            </span>
                            {collapsed && (
                              <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--fg-2)', display:'flex', gap:20}}>
                                <span>остаток {fmt.money(sub.balance, {compact:true})}</span>
                                {sub.debtPct > 0 && <span style={{color:'var(--warn)'}}>долг {fmt.money(sub.debtPct, {compact:true})}</span>}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {!collapsed && rows.map(t => <TrancheRow key={t.id} t={t} onSelect={onSelect}/>)}
                      {!collapsed && (
                        <tr className="t-subtotal" onClick={() => toggleGroup(g)}>
                          <td colSpan={5}>Итого {g}</td>
                          <td className="num">{fmt.money(sub.issued)}</td>
                          <td className="num">{fmt.money(sub.returns)}</td>
                          <td className="num">{fmt.money(sub.balance)}</td>
                          <td></td>
                          <td className="num">{fmt.money(sub.accrued, {compact:true})}</td>
                          <td className="num" style={{color: sub.debtPct > 0 ? 'var(--warn)' : 'inherit'}}>{fmt.money(sub.debtPct, {compact:true})}</td>
                          <td></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
                : carrierGrouped
                  ? carrierGrouped.map(({ carrier, rows, sub }) => {
                    const collapsed = collapsedCarriers.has(carrier);
                    return (
                      <React.Fragment key={carrier}>
                        <tr className="t-carrier-hdr" onClick={() => toggleCarrier(carrier)}>
                          <td colSpan={12}>
                            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                              <span><Chevron open={!collapsed}/>{carrier} · {rows.length} траншей</span>
                              {collapsed && rows.length > 1 && (
                                <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--fg-2)', display:'flex', gap:20}}>
                                  <span>остаток {fmt.money(sub.balance, {compact:true})}</span>
                                  {sub.debtPct > 0 && <span style={{color:'var(--warn)'}}>долг {fmt.money(sub.debtPct, {compact:true})}</span>}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {!collapsed && rows.map(t => <TrancheRow key={t.id} t={t} onSelect={onSelect}/>)}
                        {!collapsed && rows.length > 1 && (
                          <tr className="t-carrier-sub" onClick={() => toggleCarrier(carrier)}>
                            <td colSpan={5}>Итого {carrier.split(' ')[0]}</td>
                            <td className="num">{fmt.money(sub.issued)}</td>
                            <td className="num">{fmt.money(sub.returns)}</td>
                            <td className="num">{fmt.money(sub.balance)}</td>
                            <td></td>
                            <td className="num">{fmt.money(sub.accrued, {compact:true})}</td>
                            <td className="num" style={{color: sub.debtPct > 0 ? 'var(--warn)' : 'inherit'}}>{fmt.money(sub.debtPct, {compact:true})}</td>
                            <td></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                  : filt.map(t => <TrancheRow key={t.id} t={t} onSelect={onSelect}/>)
              }
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

      <div className="panel panel-fill">
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

  const totals = E.aggregate(own, dataset.projects);
  totals.returns = totals.returned;

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
             sub={`сложные по инвест ${fmt.money(totals.investDebtPct,{compact:true})} · простые по оборотным ${fmt.money(totals.workDebtPct,{compact:true})}`} />
        <KPI label="Инвест / оборотные"
             value={fmt.money(totals.investBalance, {compact:true})}
             sub={`оборотных и прочих ${fmt.money(totals.workBalance, {compact:true})}`}
             bar={totals.balance ? totals.investBalance / totals.balance : 0} />
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
                  <td>{E.isInvest(t.kind)
                    ? <span className="tag kind-inv">{fmt.pct(t.corpRate ?? 0, 1)} корп</span>
                    : t.rateType==='плав'
                      ? <span className="tag rate-flo">ЦБ +{fmt.pct(t.addRate||0,1)}</span>
                      : <span className="tag rate-fix">{fmt.pct(t.rate||0,1)}</span>}</td>
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

const AA_PROJECT = 'Ассортимент Агро';

function ParityTable({ dataset, computedSubset, shares, isAA }){
  const groupAgg   = E.aggregateByGroup(computedSubset, dataset.projects);
  const totalBal   = Object.values(groupAgg).reduce((s,g)=>s+g.balance,0);

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Тело в работе на {fmt.date(dataset.reportDate)}</div>
          <div className="panel-sub">{fmt.money(totalBal, {compact:true})} итого</div>
        </div>
        <div style={{padding:'18px 22px'}}>
          <div className="stacked">
            {dataset.groups.map((g, idx) => {
              const w = totalBal ? (groupAgg[g]?.balance||0) / totalBal * 100 : 0;
              return <div key={g} className={'seg ' + ['p','n','c'][idx]} style={{flex: w}}>{w > 6 ? fmt.pct(w/100, 1) : ''}</div>;
            })}
          </div>
          <div className="legend">
            {dataset.groups.map((g, idx) => (
              <span key={g}><span className="swatch" style={{background: ['#8fcfa3','#d9a55c','#9bb6e0'][idx]}}></span>{g}{isAA && g==='N&K' ? ' (Горшков + Кузьмин)' : ''}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            {isAA ? 'Паритет · Ассортимент Агро' : 'Паритет · Основной БЕЗ проекта АА'}
          </div>
        </div>
        <div className="t-wrap">
          <table className="t">
            <thead><tr>
              <th>Группа</th>
              <th className="num">Плановая доля</th>
              <th className="num">Тело в работе</th>
              <th className="num">Доля факт.</th>
              <th className="num">Δ доля</th>
              <th className="num">Δ сумма</th>
            </tr></thead>
            <tbody>
              {dataset.groups.map(g => {
                const a        = groupAgg[g] || {};
                const expected = shares[g] || 0;
                const balShare = totalBal ? a.balance/totalBal : 0;
                const delta    = balShare - expected;
                const deltaAbs = delta * totalBal;
                const neutral  = Math.abs(delta) < 0.005;
                const color    = neutral ? 'var(--fg-3)' : delta > 0 ? 'var(--pos)' : 'var(--neg)';
                return (
                  <tr key={g}>
                    <td>
                      <span className="tag" style={{background:'transparent', color:fmt.groupColor(g), borderColor:fmt.groupColor(g)+'55'}}>
                        {fmt.groupInitials(g)}
                      </span>{' '}
                      <span className="strong">{g}</span>
                      {isAA && g==='N&K' && <span className="muted" style={{fontSize:11,marginLeft:6}}>Горшков + Кузьмин</span>}
                    </td>
                    <td className="num">{fmt.pct(expected, 1)}</td>
                    <td className="num strong">{fmt.money(a.balance||0)}</td>
                    <td className="num">{fmt.pct(balShare, 1)}</td>
                    <td className="num" style={{color}}>{delta>=0?'+':''}{fmt.pct(delta, 2)}</td>
                    <td className="num" style={{color}}>{delta>=0?'+':''}{fmt.money(deltaAbs, {compact:true})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ScreenParity({ dataset, computed }){
  const [tab, setTab] = useStateS('main');
  const computedMain = useMemoS(()=>computed.filter(t=>t.project!==AA_PROJECT), [computed]);
  const computedAA   = useMemoS(()=>computed.filter(t=>t.project===AA_PROJECT),  [computed]);

  return (
    <div className="content">
      <div className="page-eyebrow">Раздел · Паритет</div>
      <h1 className="page-title">Паритет долей</h1>
      <div className="page-sub">Сравнение плановой структуры капитала с фактическими долями в активных займах.</div>

      <div className="seg-toggle" style={{marginBottom:20, width:'fit-content'}}>
        <button className={tab==='main'?'on':''} onClick={()=>setTab('main')}>Основной · без АА</button>
        <button className={tab==='aa'?'on':''} onClick={()=>setTab('aa')}>Ассортимент Агро</button>
      </div>

      {tab === 'main'
        ? <ParityTable dataset={dataset} computedSubset={computedMain} shares={dataset.shares} />
        : <ParityTable dataset={dataset} computedSubset={computedAA}   shares={dataset.sharesAA || {}} isAA />
      }

      <div className="note" style={{marginTop:18}}>
        <span className="nlabel">прим.</span>
        {tab === 'main'
          ? 'Паритет считается по трём группам БЕЗ проекта «Ассортимент Агро» (АА). '
          : 'Паритет только по проекту АА. N&K = Горшков Константин Олегович + Кузьмин Никита Владимирович. '}
        Плановые доли из листа «Справочники»: {dataset.groups.map((g, i) => (
          <React.Fragment key={g}>
            {i ? ', ' : ''}{g} {fmt.pct((tab === 'main' ? dataset.shares : (dataset.sharesAA || {}))[g], 1)}
          </React.Fragment>
        ))}.
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
