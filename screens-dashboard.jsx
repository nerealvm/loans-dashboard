// Screen: Телевизор (Dashboard)
const { useState: useStateD, useMemo: useMemoD } = React;

function FilterBar({ projects, selected, setSelected, projAgg }){
  const isAll = selected.length === projects.length;
  return (
    <div className="filter-bar">
      <span className="filter-label">Проекты</span>
      {projects.map(p => {
        const on = selected.includes(p);
        const ag = projAgg[p];
        return (
          <button key={p} className={'chip' + (on?' on':'')}
            onClick={() => {
              if (on) setSelected(selected.filter(x=>x!==p));
              else setSelected([...selected, p]);
            }}>
            <span className="chip-dot"></span>
            <span>{fmt.projectShort(p)}</span>
            <span className="chip-count">{ag ? fmt.money(ag.balance, {compact:true}) : '0'}</span>
          </button>
        );
      })}
      <div className="filter-actions">
        <span className="mini" onClick={()=>setSelected([...projects])}>все</span>
        <span className="mini" onClick={()=>setSelected([])}>сброс</span>
      </div>
    </div>
  );
}

function KPI({ label, value, unit, sub, accent, bar }){
  return (
    <div className={'kpi' + (accent?' accent':'')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}{unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="kpi-foot">{sub}</div>}
      {bar != null && <div className="kpi-bar"><div style={{width: Math.min(100, bar*100) + '%'}}></div></div>}
    </div>
  );
}

function ProjectMini({ name, agg, onNavigate }){
  return (
    <div className={'proj-card' + (onNavigate ? ' link' : '')}
         onClick={onNavigate ? () => onNavigate('reg', {projects: [name]}) : undefined}
         title={onNavigate ? `Открыть в реестре: ${fmt.projectShort(name)}` : undefined}>
      <div className="ph">
        <div className="pname">{fmt.projectShort(name)}</div>
        <div className="pcount">{agg?.count || 0} тр.</div>
      </div>
      <div className="pval">{fmt.money(agg?.balance || 0, {compact:true})}</div>
      <div className="psub">тело в работе</div>
    </div>
  );
}

function GroupQuick({ groups, dataset, onNavigate }){
  const total = Object.values(groups).reduce((s,g)=>s+g.balance, 0);
  return (
    <div className="group-grid">
      {dataset.groups.map(g => {
        const a = groups[g] || { issued:0, returned:0, balance:0, accrued:0, paidPct:0, debtPct:0, count:0 };
        const share = total ? a.balance/total : 0;
        const expected = dataset.shares[g];
        const delta = share - expected;
        return (
          <div className={'group-card' + (onNavigate ? ' link' : '')} key={g}
               onClick={onNavigate ? () => onNavigate('reg', {group: g}) : undefined}
               title={onNavigate ? `Открыть в реестре: ${g}` : undefined}>
            <div className="gh">
              <div className="group-mark" style={{background: fmt.groupColor(g)}}>{fmt.groupInitials(g)}</div>
              <div>
                <div className="gtitle">{g}</div>
                <div className="gshare">плановая доля {fmt.pct(expected, 1)}</div>
              </div>
            </div>
            <dl>
              <dt>Тело в работе</dt><dd>{fmt.money(a.balance, {compact:true})}</dd>
              <dt>Факт. доля</dt><dd style={{color: Math.abs(delta) < 0.02 ? 'var(--accent-strong)' : (delta > 0 ? 'var(--pos)' : 'var(--neg)')}}>
                {fmt.pct(share, 1)} <span style={{opacity:0.7, marginLeft:4}}>{delta>=0?'+':''}{fmt.pct(delta,1)}</span>
              </dd>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function GroupFilterBar({ groups, selected, setSelected }){
  return (
    <div className="filter-bar">
      <span className="filter-label">Группы</span>
      {groups.map(g => {
        const on = selected.includes(g);
        return (
          <button key={g} className={'chip' + (on?' on':'')}
            onClick={() => setSelected(on ? selected.filter(x=>x!==g) : [...selected, g])}>
            <span className="chip-dot" style={{background: fmt.groupColor(g)}}></span>
            <span>{g}</span>
          </button>
        );
      })}
      <div className="filter-actions">
        <span className="mini" onClick={()=>setSelected([...groups])}>все</span>
        <span className="mini" onClick={()=>setSelected([])}>сброс</span>
      </div>
    </div>
  );
}

function ScreenDashboard({ dataset, computed, selectedProj, setSelectedProj, onNavigate }){
  const [selectedGroups, setSelectedGroups] = useStateD(dataset.groups);
  // Фильтр по группам — как в новом Телевизоре (веса G8:G10).
  const inGroups = useMemoD(
    ()=>computed.filter(t=>selectedGroups.includes(t.group)),
    [computed, selectedGroups]);

  const agg      = E.aggregate(inGroups, selectedProj);
  const projAgg  = useMemoD(()=>E.aggregateByProject(inGroups), [inGroups]);
  const groupSub = useMemoD(
    ()=>E.aggregateByGroup(inGroups, selectedProj),
    [inGroups, selectedProj]);

  // Инвестиционный лимит: превышение уходит в оборотные (Телевизор, B34:B37).
  const limitUsed = dataset.invLimit ? agg.investBalance / dataset.invLimit : 0;
  const overLimit = Math.max(0, agg.investBalance - (dataset.invLimit || 0));

  // Recent movements
  const recent = [...dataset.movements].filter(Boolean).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6);

  return (
    <div className="content">
      <div className="page-eyebrow">Главная панель · Телевизор</div>
      <h1 className="page-title">Сводка по займам</h1>
      <div className="page-sub">
        Что должны акционеры компании, что компания должна акционерам, в разрезе проектов и групп.
        Тело и простые проценты — на отчётную дату {fmt.date(dataset.reportDate)},
        сложные по инвестиционным — на {fmt.date(dataset.compoundDate || dataset.reportDate)}.
      </div>

      <FilterBar
        projects={dataset.projects}
        selected={selectedProj}
        setSelected={setSelectedProj}
        projAgg={projAgg} />

      <GroupFilterBar groups={dataset.groups} selected={selectedGroups} setSelected={setSelectedGroups} />

      <div className="kpi-grid">
        <KPI label="Остаток тела займов"
             value={fmt.money(agg.balance, {compact:true})}
             sub={`${agg.count} траншей · выдано ${fmt.money(agg.issued, {compact:true})}, возвращено ${fmt.money(agg.returned, {compact:true})}`}
             accent />
        <KPI label="Всего %"
             value={fmt.money(agg.debtPct, {compact:true})}
             sub={`сложные по инвест ${fmt.money(agg.investDebtPct, {compact:true})} · простые по оборотным ${fmt.money(agg.workDebtPct, {compact:true})}`} />
        <KPI label="Всего тело + %"
             value={fmt.money(agg.balance + agg.debtPct, {compact:true})} />
      </div>

      <div style={{marginTop: 28}}>
        <div className="page-eyebrow" style={{marginBottom: 4}}>Инвестиционные и оборотные</div>
        <div className="kpi-grid">
          <KPI label="Тело инвестиционных займов"
               value={fmt.money(agg.investBalance, {compact:true})}
               sub={`сложные % ${fmt.money(agg.investDebtPct, {compact:true})} · итого ${fmt.money(agg.investBalance + agg.investDebtPct, {compact:true})}`}
               bar={agg.balance ? agg.investBalance / agg.balance : 0} />
          <KPI label="Тело оборотных и прочих"
               value={fmt.money(agg.workBalance, {compact:true})}
               sub={`простые % ${fmt.money(agg.workDebtPct, {compact:true})} · итого ${fmt.money(agg.workBalance + agg.workDebtPct, {compact:true})}`}
               bar={agg.balance ? agg.workBalance / agg.balance : 0} />
          <KPI label="Инвестиционный лимит"
               value={fmt.money(dataset.invLimit, {compact:true})}
               sub={overLimit > 0
                 ? `превышение ${fmt.money(overLimit, {compact:true})} — уходит в оборотные`
                 : `использовано ${fmt.pct(limitUsed, 0)} · запас ${fmt.money((dataset.invLimit||0) - agg.investBalance, {compact:true})}`}
               bar={limitUsed} />
        </div>
        <div className="note" style={{marginTop:12}}>
          <span className="nlabel">как считаем</span>
          Инвестиционные — сложные проценты по ставке корп договора {fmt.pct(dataset.corpRate, 0)} с капитализацией «{dataset.capPeriod}».
          Оборотные и старые займы — простые проценты факт/365: фикс по ставке договора, плав по ключу ЦБ + надбавка.
        </div>
      </div>

      <div style={{marginTop: 28}}>
        <div className="page-eyebrow" style={{marginBottom: 4}}>По проектам</div>
        <div className="proj-grid">
          {dataset.projects.map(p => (
            <ProjectMini key={p} name={p} agg={projAgg[p]} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      <div style={{marginTop: 28}}>
        <div className="page-eyebrow" style={{marginBottom: 4}}>По группам акционеров</div>
        <GroupQuick groups={groupSub} dataset={dataset} onNavigate={onNavigate} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Последние движения</div>
          <div className="panel-sub">{recent.length} записей · последние возвраты тела и выплаты %</div>
        </div>
        <div className="t-wrap">
          <table className="t">
            <thead><tr>
              <th>Дата</th><th>Тип</th><th>Транш</th><th>Контрагент</th><th>Проект</th>
              <th className="num">Сумма</th><th>Комментарий</th>
            </tr></thead>
            <tbody>
              {recent.map(m => (
                <tr key={m.id}>
                  <td className="muted">{fmt.dateShort(m.date)}</td>
                  <td><span className={'tag ' + (m.type==='Возврат тела' ? 'move-back' : 'move-pct')}>{m.type}</span></td>
                  <td className="id-cell">{m.tranche}</td>
                  <td className="strong">{m.carrier?.split('(')[0].trim()}</td>
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

window.ScreenDashboard = ScreenDashboard;
window.FilterBar = FilterBar;
