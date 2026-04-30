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
            <span className="chip-count">{ag ? ag.count : 0}</span>
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

function ProjectMini({ name, agg }){
  return (
    <div className="proj-card">
      <div className="ph">
        <div className="pname">{fmt.projectShort(name)}</div>
        <div className="pcount">{agg?.count || 0} тр.</div>
      </div>
      <div className="pval">{fmt.money(agg?.balance || 0, {compact:true})}</div>
      <div className="psub">тело в работе · долг {fmt.money(agg?.debtPct || 0, {compact:true})}</div>
    </div>
  );
}

function GroupQuick({ groups, dataset }){
  const total = Object.values(groups).reduce((s,g)=>s+g.balance, 0);
  return (
    <div className="group-grid">
      {dataset.groups.map(g => {
        const a = groups[g] || { issued:0, returned:0, balance:0, accrued:0, paidPct:0, debtPct:0, count:0 };
        const share = total ? a.balance/total : 0;
        const expected = dataset.shares[g];
        const delta = share - expected;
        return (
          <div className="group-card" key={g}>
            <div className="gh">
              <div className="group-mark" style={{background: fmt.groupColor(g)}}>{fmt.groupInitials(g)}</div>
              <div>
                <div className="gtitle">{g}</div>
                <div className="gshare">плановая доля {fmt.pct(expected, 1)}</div>
              </div>
            </div>
            <dl>
              <dt>Тело в работе</dt><dd>{fmt.money(a.balance, {compact:true})}</dd>
              <dt>Накоплено %</dt><dd>{fmt.money(a.accrued, {compact:true})}</dd>
              <dt>Выплачено %</dt><dd>{fmt.money(a.paidPct, {compact:true})}</dd>
              <dt>Долг по %</dt><dd>{fmt.money(a.debtPct, {compact:true})}</dd>
              <dt>Факт. доля</dt><dd style={{color: Math.abs(delta) < 0.02 ? 'var(--accent-strong)' : 'var(--warn)'}}>
                {fmt.pct(share, 1)} <span style={{opacity:0.6, marginLeft:4}}>{delta>=0?'+':''}{fmt.pct(delta,1)}</span>
              </dd>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function ScreenDashboard({ dataset, computed, projAgg, groupAgg, selectedProj, setSelectedProj }){
  const filt = useMemoD(()=>computed.filter(t=>selectedProj.includes(t.project)), [computed, selectedProj]);
  const agg = E.aggregate(computed, selectedProj);
  const limitUsed = agg.balance / dataset.invLimit;

  // Recent movements
  const recent = [...dataset.movements].filter(Boolean).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6);

  return (
    <div className="content">
      <div className="page-eyebrow">Главная панель · Телевизор</div>
      <h1 className="page-title">Сводка по займам</h1>
      <div className="page-sub">Что должны акционеры компании, что компания должна акционерам, в разрезе проектов и групп. Расчёт на отчётную дату {fmt.date(dataset.reportDate)}.</div>

      <FilterBar
        projects={dataset.projects}
        selected={selectedProj}
        setSelected={setSelectedProj}
        projAgg={projAgg} />

      <div className="kpi-grid">
        <KPI label="Всего выдано тела"
             value={fmt.money(agg.issued, {compact:true})}
             sub={`${agg.count} траншей в фильтре`} />
        <KPI label="Возвращено тела"
             value={fmt.money(agg.returned, {compact:true})}
             sub={`${fmt.pct(agg.issued ? agg.returned/agg.issued : 0)} от выданного`}
             bar={agg.issued ? agg.returned/agg.issued : 0} />
        <KPI label="Тело в работе"
             value={fmt.money(agg.balance, {compact:true})}
             accent />
        <KPI label="Долг компании по %"
             value={fmt.money(agg.debtPct, {compact:true})}
             sub={`накоплено ${fmt.money(agg.accrued, {compact:true})} · выплачено ${fmt.money(agg.paidPct, {compact:true})}`} />
      </div>

      <div style={{marginTop: 28}}>
        <div className="page-eyebrow" style={{marginBottom: 4}}>По проектам</div>
        <div className="proj-grid">
          {dataset.projects.map(p => (
            <ProjectMini key={p} name={p} agg={projAgg[p]} />
          ))}
        </div>
      </div>

      <div style={{marginTop: 28}}>
        <div className="page-eyebrow" style={{marginBottom: 4}}>По группам акционеров</div>
        <GroupQuick groups={groupAgg} dataset={dataset} />
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
