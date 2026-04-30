// Main app: composes screens, manages global state, drawer, Google Sheets import.
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useCallback: useCallbackA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#3047d6",
  "density": "comfortable",
  "showFooterTotals": true,
  "sheetsEnabled": true,
  "spreadsheetId": "1AzTRuDRRcw6M0rnerzeuJ6IY-rk8E2WW",
  "sheetReestр": "Реестр траншей",
  "sheetJournal": "Журнал движений",
  "sheetCBRates": "Ставки ЦБ"
}/*EDITMODE-END*/;

// ─── Data source status indicator ─────────────────────────────────────────────
function SourcePill({ status, onRefresh }) {
  const labels = {
    loading:  'Загрузка…',
    sheets:   'Google Sheets',
    cache:    'Google Sheets (кэш)',
    snapshot: 'Снапшот v14',
    error:    'Снапшот (ошибка Sheets)',
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
          style={{
            marginLeft: 4, padding: '0 2px', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--fg-3)', fontSize: 13, lineHeight: 1,
          }}
        >⟳</button>
      )}
    </span>
  );
}

// ─── Settings drawer for Google Sheets config ─────────────────────────────────
function SheetsSettingsDrawer({ tw, setTw, onClose, onRefresh }) {
  const [id, setId] = React.useState(tw.spreadsheetId || '');
  const [re, setRe] = React.useState(tw.sheetReestр || 'Реестр траншей');
  const [jn, setJn] = React.useState(tw.sheetJournal || 'Журнал движений');
  const [cb, setCb] = React.useState(tw.sheetCBRates || 'Ставки ЦБ');

  function handleSave() {
    setTw('spreadsheetId', id.trim());
    setTw('sheetReestр', re.trim());
    setTw('sheetJournal', jn.trim());
    setTw('sheetCBRates', cb.trim());
    if (window.SL) {
      SL.setConfig({
        spreadsheetId: id.trim(),
        sheetReestр: re.trim(),
        sheetJournal: jn.trim(),
        sheetCBRates: cb.trim(),
      });
      SL.clearCache();
    }
    onRefresh();
    onClose();
  }

  function handleIdChange(v) {
    const m = v.match(/spreadsheets\/d\/([\w-]+)/);
    setId(m ? m[1] : v);
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}></div>
      <div className="drawer">
        <div className="drawer-head">
          <h3>Источник данных · Google Sheets</h3>
          <button className="btn" onClick={onClose}>{Icons.close}</button>
        </div>
        <div className="drawer-body">
          <div className="note">
            <span className="nlabel">как работает</span>
            Приложение читает данные напрямую из Google Таблицы (gviz API).
            Таблица должна быть открыта «Всем с ссылкой — Просмотр».
            Кэш 1 час, кнопка ⟳ в топбаре — принудительное обновление.
          </div>

          <div className="field">
            <label>ID таблицы или полная ссылка</label>
            <input
              type="text"
              placeholder="1bvHJQHH6… или https://docs.google.com/spreadsheets/d/…"
              value={id}
              onChange={e => handleIdChange(e.target.value)}
            />
          </div>

          <div style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--fg-3)',
                       textTransform:'uppercase',letterSpacing:'0.08em',marginTop:4}}>
            Названия листов
          </div>
          {[
            ['Реестр траншей', re, setRe],
            ['Журнал движений', jn, setJn],
            ['Ставки ЦБ', cb, setCb],
          ].map(([label, val, setter]) => (
            <div className="field" key={label} style={{marginTop:0}}>
              <label>{label}</label>
              <input type="text" value={val} onChange={e => setter(e.target.value)} />
            </div>
          ))}
        </div>
        <div className="drawer-foot">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" onClick={handleSave}>Сохранить и обновить</button>
        </div>
      </div>
    </>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────
function AppRoot() {
  const [data, setData] = useStateA(null);
  const [active, setActive] = useStateA('dash');
  const [selectedProj, setSelectedProj] = useStateA([]);
  const [drawerOpen, setDrawerOpen] = useStateA(false);
  const [prefillTranche, setPrefillTranche] = useStateA(null);
  const [detail, setDetail] = useStateA(null);
  const [extraMoves, setExtraMoves] = useStateA([]);
  const [navOpen, setNavOpen] = useStateA(false);
  const [dataStatus, setDataStatus] = useStateA('loading');
  const [settingsOpen, setSettingsOpen] = useStateA(false);
  const tweaks = useTweaks ? useTweaks(TWEAK_DEFAULTS) : [TWEAK_DEFAULTS, () => {}];
  const [tw, setTw] = tweaks;

  const loadData = useCallbackA(async (forceFresh) => {
    setDataStatus('loading');
    try {
      if (tw.sheetsEnabled && window.SL) {
        // Sync tweaks → SL config before loading
        SL.setConfig({
          enabled: true,
          spreadsheetId: tw.spreadsheetId,
          sheetReestр: tw.sheetReestр || 'Реестр траншей',
          sheetJournal: tw.sheetJournal || 'Журнал движений',
          sheetCBRates: tw.sheetCBRates || 'Ставки ЦБ',
        });
        const d = await SL.loadFromSheets(forceFresh);
        setData(d);
        setSelectedProj([...d.projects]);
        setDataStatus(d._fromCache ? 'cache' : 'sheets');
        return;
      }
    } catch (err) {
      console.warn('[Sheets] Load failed:', err.message);
      setDataStatus('error');
    }

    // Fall back to embedded snapshot JSON
    try {
      const datasetUrl = (window.__resources && window.__resources.dataset) || 'data/dataset.json';
      const resp = await fetch(datasetUrl);
      const d = await resp.json();
      setData(d);
      setSelectedProj([...d.projects]);
      setDataStatus('snapshot');
    } catch (e) {
      console.error('[Snapshot] Load failed:', e);
    }
  }, [tw.sheetsEnabled, tw.spreadsheetId, tw.sheetReestр, tw.sheetJournal, tw.sheetCBRates]);

  useEffectA(() => { loadData(false); }, []);

  useEffectA(() => {
    document.documentElement.setAttribute('data-theme', tw.theme);
    document.documentElement.style.setProperty('--accent', tw.accent);
  }, [tw.theme, tw.accent]);

  const dataset = useMemoA(() => {
    if (!data) return null;
    return { ...data, movements: [...(data.movements || []), ...extraMoves] };
  }, [data, extraMoves]);

  const computed = useMemoA(() => {
    if (!dataset) return [];
    return E.computeAll(dataset);
  }, [dataset]);

  const projAgg  = useMemoA(() => dataset ? E.aggregateByProject(computed) : {}, [dataset, computed]);
  const groupAgg = useMemoA(() => dataset ? E.aggregateByGroup(computed, selectedProj) : {}, [computed, selectedProj]);

  if (!dataset) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', gap: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: 13,
      }}>
        <div style={{width: 24, height: 24, border: '2px solid var(--accent)', borderTopColor: 'transparent',
                     borderRadius: '50%', animation: 'spin 0.7s linear infinite'}}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div>Загрузка данных…</div>
        {dataStatus === 'error' && (
          <div style={{maxWidth: 480, textAlign: 'center', fontSize: 12, color: 'var(--warn)', marginTop: 8}}>
            Не удалось подключиться к Google Sheets. Проверьте доступ к таблице (должна быть «Всем с ссылкой»).
            Загружаем снапшот…
          </div>
        )}
      </div>
    );
  }

  const titles = {
    dash: ['Главная', 'Сводка по займам акционеров «Корма»'],
    reg:  ['Реестр', `${dataset.tranches.length} траншей · обновлено ${fmt.date(dataset.reportDate)}`],
    log:  ['Журнал', `${dataset.movements.length + extraMoves.length} движений`],
    grp:  ['Группы', '3 группы акционеров: Пресняков · N&K · Чил-Акопов'],
    par:  ['Паритет', 'Сравнение плановой и фактической структуры капитала'],
    cb:   ['Ставки ЦБ РФ', `${dataset.cbrates.length} сегментов исторических ставок`],
  };
  const [tt, ts] = titles[active] || ['—', ''];

  function openAdd(trancheId) {
    setPrefillTranche(trancheId || null);
    setDrawerOpen(true);
  }

  function go(id) { setActive(id); setNavOpen(false); }

  return (
    <div className="app" data-density={tw.density}>
      <Sidebar active={active} setActive={go} dataset={dataset} computed={computed} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className={'sidebar-scrim' + (navOpen ? ' open' : '')} onClick={() => setNavOpen(false)}></div>
      <div className="main">
        <TopBar
          title={tt} sub={ts} dataset={dataset}
          onAdd={() => openAdd()}
          onMenu={() => setNavOpen(v => !v)}
          dataStatus={dataStatus}
          onRefresh={() => loadData(true)}
          onSettings={() => setSettingsOpen(true)}
        />
        {active === 'dash' && <ScreenDashboard dataset={dataset} computed={computed} projAgg={projAgg} groupAgg={groupAgg} selectedProj={selectedProj} setSelectedProj={setSelectedProj} />}
        {active === 'reg'  && <ScreenRegistry  dataset={dataset} computed={computed} projAgg={projAgg} selectedProj={selectedProj} setSelectedProj={setSelectedProj} onSelect={setDetail} />}
        {active === 'log'  && <ScreenJournal   dataset={dataset} onAdd={() => openAdd()} />}
        {active === 'grp'  && <ScreenGroups    dataset={dataset} computed={computed} />}
        {active === 'par'  && <ScreenParity    dataset={dataset} computed={computed} />}
        {active === 'cb'   && <ScreenCB        dataset={dataset} />}
      </div>

      {detail && (
        <TrancheDetail
          tranche={detail}
          movements={dataset.movements}
          onClose={() => setDetail(null)}
          onAddMovement={(id) => { setDetail(null); openAdd(id); }}
        />
      )}

      {drawerOpen && (
        <AddMovementDrawer
          dataset={dataset}
          computed={computed}
          prefilledTranche={prefillTranche}
          onClose={() => setDrawerOpen(false)}
          onSave={(m) => { setExtraMoves([...extraMoves, m]); }}
        />
      )}

      {settingsOpen && (
        <SheetsSettingsDrawer
          tw={tw}
          setTw={setTw}
          onClose={() => setSettingsOpen(false)}
          onRefresh={() => loadData(true)}
        />
      )}

      {window.TweaksPanel && (
        <TweaksPanel title="Tweaks">
          <TweakSection title="Тема и плотность">
            <TweakRadio label="Тема" value={tw.theme} options={[{value:'dark',label:'Dark'},{value:'light',label:'Light'}]} onChange={v => setTw('theme', v)} />
            <TweakRadio label="Плотность" value={tw.density} options={[{value:'comfortable',label:'Comfort'},{value:'compact',label:'Compact'}]} onChange={v => setTw('density', v)} />
          </TweakSection>
          <TweakSection title="Акцентный цвет">
            <TweakColor label="Accent" value={tw.accent} onChange={v => setTw('accent', v)} />
          </TweakSection>
          <TweakSection title="Поведение">
            <TweakToggle label="Итоги в футере таблиц" value={tw.showFooterTotals} onChange={v => setTw('showFooterTotals', v)} />
          </TweakSection>
          <TweakSection title="Google Sheets">
            <TweakToggle label="Загружать из Sheets" value={tw.sheetsEnabled} onChange={v => setTw('sheetsEnabled', v)} />
            <TweakButton label="Настроить источник" onClick={() => setSettingsOpen(true)} secondary />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AppRoot />);
