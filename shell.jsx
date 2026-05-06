// App shell, sidebar nav, top bar, screen routing.
const { useState, useEffect, useMemo, useRef } = React;

// Data-source status indicator shown in TopBar
function SourcePill({ status, onRefresh }) {
  const labels = {
    loading:  'Загрузка…',
    sheets:   'Google Sheets',
    cache:    'Sheets (кэш)',
    snapshot: 'Снапшот',
    error:    'Снапшот (ошибка)',
  };
  const colors = {
    loading:  'var(--fg-4)',
    sheets:   'var(--pos)',
    cache:    'var(--ok)',
    snapshot: 'var(--fg-3)',
    error:    'var(--warn)',
  };
  return (
    <span className="report-pill" title={status === 'error' ? 'Не удалось подключиться к Google Sheets' : ''}>
      <span className="dot" style={{background: colors[status] || 'var(--fg-4)'}}></span>
      <span>{labels[status] || status}</span>
      {(status === 'sheets' || status === 'cache' || status === 'error') && (
        <button
          onClick={onRefresh}
          title="Перезагрузить из Google Sheets"
          style={{marginLeft:4, padding:'0 2px', background:'none', border:'none',
                  cursor:'pointer', color:'var(--fg-3)', fontSize:13, lineHeight:1}}
        >⟳</button>
      )}
    </span>
  );
}
window.SourcePill = SourcePill;

const IcPin = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="10" x2="8" y2="14"/>
    <path d="M5 2h6l1 8H4z"/>
    <line x1="3" y1="10" x2="13" y2="10"/>
  </svg>
);
const IcPinFill = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="10" x2="8" y2="14" strokeWidth="1.5" fill="none"/>
    <path d="M5 2h6l1 8H4z" strokeWidth="0.5"/>
    <line x1="3" y1="10" x2="13" y2="10" strokeWidth="1.5" fill="none"/>
  </svg>
);

function Sidebar({ active, setActive, dataset, computed, open, onClose, pinned, onTogglePin }){
  const [hovered, setHovered] = React.useState(false);
  const expanded = pinned || hovered;

  const items = [
    { id: 'dash', label: 'Телевизор', icon: Icons.dashboard, meta: '' },
    { id: 'reg',  label: 'Реестр траншей', icon: Icons.list, meta: dataset.tranches.length },
    { id: 'log',  label: 'Журнал движений', icon: Icons.journal, meta: dataset.movements.length },
    { id: 'grp',  label: 'Группы', icon: Icons.groups, meta: 3 },
    { id: 'par',  label: 'Паритет', icon: Icons.parity, meta: '' },
    { id: 'cb',   label: 'Ставки ЦБ', icon: Icons.cb, meta: dataset.cbrates.length },
  ];

  const totalBalance = computed.reduce((s,t) => s + (t.balance||0), 0);
  const totalDebtPct = computed.reduce((s,t) => s + (t.debtPct||0), 0);

  return (
    <aside
      className={'sidebar' + (open ? ' open' : '') + (expanded ? ' expanded' : ' collapsed')}
      onMouseEnter={() => { if (!pinned && window.innerWidth > 1000) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}>
      <div className="brand">
        <div className="brand-mark">
          <div className="brand-glyph">К</div>
          <div className="brand-text">
            <div className="brand-name">Корма · Капитал</div>
            <div className="brand-sub">Investor Loans Console</div>
          </div>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-section">Основное</div>
        {items.slice(0,3).map(it => (
          <div key={it.id} className={'nav-item' + (active===it.id?' active':'')}
               onClick={()=>setActive(it.id)} title={it.label}>
            <span className="nav-icon">{it.icon}</span>
            <span className="nav-label">{it.label}</span>
            {it.meta !== '' && <span className="nav-meta">{it.meta}</span>}
          </div>
        ))}
        <div className="nav-section">Аналитика</div>
        {items.slice(3).map(it => (
          <div key={it.id} className={'nav-item' + (active===it.id?' active':'')}
               onClick={()=>setActive(it.id)} title={it.label}>
            <span className="nav-icon">{it.icon}</span>
            <span className="nav-label">{it.label}</span>
            {it.meta !== '' && <span className="nav-meta">{it.meta}</span>}
          </div>
        ))}
        <div className="nav-spacer"/>
        <div className={'nav-item sb-pin-item' + (pinned ? ' active' : '')}
             onClick={onTogglePin}
             title={pinned ? 'Открепить меню' : 'Закрепить меню'}>
          <span className="nav-icon">{pinned ? <IcPinFill/> : <IcPin/>}</span>
          <span className="nav-label">{pinned ? 'Открепить меню' : 'Закрепить меню'}</span>
        </div>
      </nav>
      <div className="sidebar-footer">
        <div className="row"><span>Тело в работе</span><span className="v">{fmt.money(totalBalance, {compact:true})}</span></div>
        <div className="row"><span>Долг по %</span><span className="v">{fmt.money(totalDebtPct, {compact:true})}</span></div>
        <div className="row"><span>Данные</span><span className="v">{fmt.date(dataset.reportDate)}</span></div>
      </div>
    </aside>
  );
}

function TopBar({ title, sub, dataset, onAdd, onMenu, dataStatus, onRefresh, onSettings }){
  return (
    <div className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Меню">
        <span><span className="bar"></span><span className="bar"></span><span className="bar"></span></span>
      </button>
      <div>
        <div className="topbar-title">{title}</div>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
      <div className="topbar-actions">
        <SourcePill status={dataStatus || 'snapshot'} onRefresh={onRefresh} />
        <button className="btn" onClick={onSettings} title="Настройки источника данных">
          {Icons.settings}<span>Sheets</span>
        </button>
        <button className="btn primary" onClick={onAdd}>{Icons.plus}<span>Движение</span></button>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
window.TopBar = TopBar;
