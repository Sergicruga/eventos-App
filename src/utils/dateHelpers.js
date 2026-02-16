/**
 * Centralized date/time utilities used across the app
 */

export const toLocalMidnightMs = (dateStr) => {
  if (!dateStr) return NaN;
  
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    const [, y, mm, dd] = m;
    return new Date(Number(y), Number(mm) - 1, Number(dd), 0, 0, 0, 0).getTime();
  }
  
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return NaN;
  
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
};

export const todayLocalMidnightMs = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
};

export const isUpcoming = (dateStr) => {
  const eventMs = toLocalMidnightMs(dateStr);
  const todayMs = todayLocalMidnightMs();
  return !Number.isNaN(eventMs) && eventMs >= todayMs;
};

export const formatDateDMY = (dateStr) => {
  if (!dateStr) return '';
  
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  
  const m2 = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(dateStr);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  
  const d = new Date(dateStr);
  if (!isNaN(d)) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }
  
  return dateStr;
};

export const formatDateOnlyEs = (dateStr) => {
  if (!dateStr) return '';
  
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dateStr);
  
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  
  return `${d} de ${monthNames[mo - 1]} de ${y}`;
};

export const getEventDateFromEvent = (ev) => {
  const s = ev?.startsAt ?? ev?.starts_at ?? ev?.event_at ?? ev?.date ?? null;
  
  if (typeof s === 'string') {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  
  return null;
};

export const getEventTimeHHMM = (ev) => {
  const plain = ev?.timeStart ?? ev?.time_start ?? null;
  if (typeof plain === 'string' && /^\d{2}:\d{2}/.test(plain)) {
    return plain.slice(0, 5);
  }

  const s = ev?.startsAt ?? ev?.starts_at ?? ev?.event_at ?? null;
  if (typeof s === 'string') {
    const m = s.match(/T(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  
  return null;
};

export const formatTimeHHMM = (evOrStr) => {
  if (!evOrStr) return '';
  
  if (typeof evOrStr === 'string') {
    const m = evOrStr.match(/T(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
    if (/^\d{2}:\d{2}/.test(evOrStr)) return evOrStr.slice(0, 5);
    return '';
  }
  
  return getEventTimeHHMM(evOrStr) ?? '';
};
