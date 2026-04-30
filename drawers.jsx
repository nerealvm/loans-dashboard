// Drawer: добавить новое движение + панель деталей транша.

const { useState: useStateX, useEffect: useEffectX } = React;

function AddMovementDrawer({ dataset, computed, onClose, onSave, prefilledTranche }){
  const today = dataset.reportDate;
  const [type, setType] = useStateX('Возврат тела');
  const [tranche, setTranche] = useStateX(prefilledTranche || '');
  const [date, setDate] = useStateX(today);
  const [sum, setSum] = useStateX('');
  const [comment, setComment] = useStateX('');

  const trancheObj = computed.find(t => t.id === tranche);
  const balance = trancheObj?.balance || 0;
  const debtPct = trancheObj?.debtPct || 0;

  // Sort active tranches first
  const options = [...computed].sort((a,b) => {
    if ((a.balance>0) !== (b.balance>0)) return a.balance > 0 ? -1 : 1;
    return (a.id||'').localeCompare(b.id||'');
  });

  const sumNum = parseFloat(String(sum).replace(/\s/g,'').replace(',','.')) || 0;
  const overflow = type === 'Возврат тела' ? sumNum > balance : false;
  const overdebt = type === 'Выплата %' ? sumNum > debtPct + 1 : false;

  function handleSave(){
    if (!tranche || !sumNum || !date) return;
    const id = 'M' + String(dataset.movements.length + 1).padStart(4,'0');
    onSave({
      id, type, tranche, date, sum: sumNum, comment,
      carrier: trancheObj?.carrier, project: trancheObj?.project,
    });
    onClose();
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}></div>
      <div className="drawer">
        <div className="drawer-head">
          <h3>Новое движение</h3>
          <button className="btn" onClick={onClose}>{Icons.close}</button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label>Тип движения</label>
            <div className="seg-toggle">
              <button className={type==='Возврат тела'?'on':''} onClick={()=>setType('Возврат тела')}>Возврат тела</button>
              <button className={type==='Выплата %'?'on':''} onClick={()=>setType('Выплата %')}>Выплата %</button>
            </div>
          </div>

          <div className="field">
            <label>Транш (обязательно)</label>
            <select value={tranche} onChange={e=>setTranche(e.target.value)}>
              <option value="">— выберите транш —</option>
              {options.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id} · {(t.carrier||'').split('(')[0].trim().slice(0,28)} · {fmt.projectShort(t.project)} · ост. {fmt.money(t.balance, {compact:true})}
                </option>
              ))}
            </select>
          </div>

          {trancheObj && (
            <div className="note">
              <span className="nlabel">сводка</span>
              <strong>{trancheObj.id}</strong> · выдан {fmt.dateShort(trancheObj.date)} ·
              тело {fmt.money(trancheObj.sum, {compact:true})} ·
              остаток <strong>{fmt.money(balance, {compact:true})}</strong> ·
              долг по % <strong>{fmt.money(debtPct, {compact:true})}</strong>
            </div>
          )}

          <div className="field">
            <label>Дата движения</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>

          <div className="field">
            <label>Сумма, ₽</label>
            <input type="text" placeholder="например 1 500 000" value={sum} onChange={e=>setSum(e.target.value)} />
          </div>

          {overflow && (
            <div className="note warn">
              <span className="nlabel">внимание</span>
              Сумма возврата ({fmt.money(sumNum)}) больше остатка тела ({fmt.money(balance)}).
            </div>
          )}
          {overdebt && (
            <div className="note warn">
              <span className="nlabel">внимание</span>
              Сумма выплаты больше накопленного долга по % ({fmt.money(debtPct)}). Излишек уйдёт в авансовую переплату.
            </div>
          )}

          <div className="field">
            <label>Комментарий</label>
            <textarea rows={3} placeholder="Опционально" value={comment} onChange={e=>setComment(e.target.value)}></textarea>
          </div>
        </div>
        <div className="drawer-foot">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" onClick={handleSave} disabled={!tranche || !sumNum}>Сохранить</button>
        </div>
      </div>
    </>
  );
}

function TrancheDetail({ tranche, movements, onClose, onAddMovement }){
  const own = movements.filter(m => m.tranche === tranche.id).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  return (
    <div className="detail-side">
      <div className="dh">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <div className="page-eyebrow" style={{margin:0}}>Транш</div>
            <div style={{fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, color:'var(--fg-0)', marginTop:4}}>{tranche.id}</div>
          </div>
          <button className="btn" onClick={onClose}>{Icons.close}</button>
        </div>
        <div style={{display:'flex', gap:8, marginTop:10}}>
          <span className={'tag ' + fmt.projectClass(tranche.project)}>{fmt.projectShort(tranche.project)}</span>
          <span className={'tag ' + fmt.kindClass(tranche.kind)}>{tranche.kind || '—'}</span>
          {tranche.rateType==='плав'
            ? <span className="tag rate-flo">ЦБ +{fmt.pct(tranche.addRate||0,1)}</span>
            : <span className="tag rate-fix">{fmt.pct(tranche.rate||0,1)}</span>}
        </div>
      </div>
      <div className="meta-grid">
        <div><div className="k">Контрагент</div><div className="v">{tranche.carrier||'—'}</div></div>
        <div><div className="k">Группа</div><div className="v">{tranche.group||'—'}</div></div>
        <div><div className="k">Дата выдачи</div><div className="v">{fmt.date(tranche.date)}</div></div>
        <div><div className="k">Прошло</div><div className="v">{fmt.days(tranche.daysFrom)}</div></div>
        <div><div className="k">Тело</div><div className="v">{fmt.money(tranche.sum)}</div></div>
        <div><div className="k">Возвращено</div><div className="v">{fmt.money(tranche.returns)}</div></div>
        <div><div className="k">Остаток</div><div className="v" style={{color:'var(--accent-strong)'}}>{fmt.money(tranche.balance)}</div></div>
        <div><div className="k">Срок (план)</div><div className="v">{tranche.term ? tranche.term + ' дн' : '—'}</div></div>
        <div><div className="k">Накоплено %</div><div className="v">{fmt.money(tranche.accrued)}</div></div>
        <div><div className="k">Выплачено %</div><div className="v">{fmt.money(tranche.paidPct)}</div></div>
        <div><div className="k">Долг по %</div><div className="v" style={{color: tranche.debtPct>0?'var(--warn)':'var(--fg-0)'}}>{fmt.money(tranche.debtPct)}</div></div>
        <div><div className="k">Документ</div><div className="v" style={{color:'var(--fg-2)'}}>{tranche.doc || '—'}</div></div>
      </div>

      <div style={{padding: '0 22px 22px'}}>
        <div className="panel" style={{marginTop: 0}}>
          <div className="panel-head">
            <div className="panel-title">Движения по траншу</div>
            <div className="panel-sub">{own.length}</div>
            <div className="panel-actions">
              <button className="btn primary" onClick={()=>onAddMovement(tranche.id)}>{Icons.plus}<span>Добавить</span></button>
            </div>
          </div>
          {own.length === 0 ? (
            <div style={{padding:'18px 22px', color:'var(--fg-3)', fontSize:12.5}}>Движений пока нет.</div>
          ) : (
            <table className="t">
              <thead><tr><th>Дата</th><th>Тип</th><th className="num">Сумма</th><th>Комментарий</th></tr></thead>
              <tbody>
                {own.map(m => (
                  <tr key={m.id}>
                    <td className="muted">{fmt.dateShort(m.date)}</td>
                    <td><span className={'tag ' + (m.type==='Возврат тела'?'move-back':'move-pct')}>{m.type}</span></td>
                    <td className="num strong">{fmt.money(m.sum)}</td>
                    <td className="muted" style={{whiteSpace:'normal', maxWidth:200}}>{m.comment||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {tranche.notes && (
          <div className="note" style={{marginTop:14}}>
            <span className="nlabel">прим.</span>
            {tranche.notes}
          </div>
        )}
      </div>
    </div>
  );
}

window.AddMovementDrawer = AddMovementDrawer;
window.TrancheDetail = TrancheDetail;
