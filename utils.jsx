// Shared utilities, formatters, icons.
(function(){
  const fmt = {};
  fmt.money = (n, opts) => {
    if (n == null || isNaN(n)) return '—';
    opts = opts || {};
    const abs = Math.abs(n);
    if (opts.compact && abs >= 1_000_000){
      return (n / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' млн';
    }
    if (opts.compact && abs >= 1_000){
      return (n / 1_000).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' тыс';
    }
    return Math.round(n).toLocaleString('ru-RU');
  };
  fmt.moneyExact = (n) => n == null ? '—' : Math.round(n).toLocaleString('ru-RU');
  fmt.pct = (n, digits) => {
    if (n == null || isNaN(n)) return '—';
    return (n * 100).toFixed(digits ?? 1) + '%';
  };
  fmt.date = (iso) => {
    if (!iso) return '—';
    const [y,m,d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };
  fmt.dateShort = (iso) => {
    if (!iso) return '—';
    const [y,m,d] = iso.split('-');
    const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    return `${+d} ${months[+m - 1]} ${y.slice(2)}`;
  };
  fmt.days = (n) => n == null ? '—' : `${n} дн`;

  fmt.projectClass = (p) => {
    if (!p) return 'proj-other';
    if (p.includes('Биотех')) return 'proj-biotech';
    if (p.includes('Ассортимент')) return 'proj-aa';
    if (p.includes('ОТЗ') || p.includes('ОПТ')) return 'proj-otz';
    if (p.includes('NU')) return 'proj-nu';
    return 'proj-other';
  };
  fmt.projectShort = (p) => {
    if (!p) return '—';
    if (p === 'Биотех') return 'Биотех';
    if (p === 'Ассортимент Агро') return 'Асс.Агро';
    if (p === 'ОТЗ/ОПТ Трейдинг') return 'ОТЗ/ОПТ';
    if (p === 'NU TREAT') return 'NU TREAT';
    return p;
  };

  fmt.kindClass = (k) => {
    if (!k) return 'kind-other';
    const s = String(k).toLowerCase();
    if (s.includes('инвест')) return 'kind-inv';
    if (s.includes('обор')) return 'kind-ob';
    if (s.includes('old') || s.includes('hist')) return 'kind-old';
    return 'kind-other';
  };

  fmt.groupColor = (g) => {
    if (g === 'Пресняков') return '#8fcfa3';
    if (g === 'N&K') return '#d9a55c';
    if (g === 'Чил-Акопов') return '#9bb6e0';
    return '#969aa3';
  };
  fmt.groupInitials = (g) => {
    if (g === 'Пресняков') return 'ПР';
    if (g === 'N&K') return 'NK';
    if (g === 'Чил-Акопов') return 'ЧА';
    return '··';
  };

  // Icons
  const I = {
    dashboard: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="5" height="6" rx="1"/><rect x="9" y="2" width="5" height="3" rx="1"/><rect x="9" y="7" width="5" height="7" rx="1"/><rect x="2" y="10" width="5" height="4" rx="1"/></svg>,
    list:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="3" y1="4" x2="13" y2="4"/><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="12" x2="13" y2="12"/></svg>,
    journal:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="2.5" width="10" height="11" rx="1"/><line x1="6" y1="6" x2="11" y2="6"/><line x1="6" y1="9" x2="11" y2="9"/><line x1="6" y1="12" x2="9" y2="12"/></svg>,
    groups:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5.5" cy="6" r="2.2"/><circle cx="11" cy="6.6" r="1.8"/><path d="M2 13c0-2 1.5-3 3.5-3s3.5 1 3.5 3"/><path d="M9 13c0-1.6 1.2-2.5 2.5-2.5s2.5 0.9 2.5 2.5"/></svg>,
    parity:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 8h10"/><path d="M3 12h10"/><path d="M3 4h10"/><circle cx="6" cy="4" r="1.5" fill="currentColor"/><circle cx="10" cy="8" r="1.5" fill="currentColor"/><circle cx="5" cy="12" r="1.5" fill="currentColor"/></svg>,
    cb:        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 13l3-3 3 2 5-6"/><path d="M11 6h2v2"/></svg>,
    plus:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>,
    close:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>,
    download:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2v8m0 0l-3-3m3 3l3-3"/><path d="M3 13h10"/></svg>,
    search:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="13" y2="13"/></svg>,
    arrow:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 8h6m-2-3l3 3-3 3"/></svg>,
    info:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><line x1="8" y1="7" x2="8" y2="11"/><circle cx="8" cy="5" r="0.6" fill="currentColor"/></svg>,
    settings:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="2"/><path d="M8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1"/></svg>,
  };

  window.fmt = fmt;
  window.Icons = I;
})();
