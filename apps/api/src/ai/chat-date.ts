export function dateParts(text: string, localToday?: string, locale = 'pt-BR') {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const clock = /\b([01]?\d|2[0-3])(?:h([0-5]\d)?|:([0-5]\d))\b/.exec(normalized);
  const ampm = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/.exec(normalized);
  let hour = clock?.[1] ?? (localToday && /\b(?:as|at|a\s+las?)\s+([01]?\d|2[0-3])\b(?![/:\d])/.exec(normalized)?.[1]);
  let minute = clock?.[2] ?? clock?.[3] ?? '00';
  if (!hour && ampm) {
    let h = Number(ampm[1]);
    if (ampm[3] === 'pm' && h < 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    hour = String(h);
    minute = ampm[2] ?? '00';
  }
  const isoDate = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  const numericDate = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?\b/.exec(text);
  let day: string | undefined;
  let invalidDate = false;
  if (isoDate) {
    const proposed = `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
    const instant = new Date(proposed+'T12:00:00Z');
    if (Number.isFinite(+instant) && instant.toISOString().slice(0,10) === proposed) day = proposed;
    else invalidDate = true;
  } else if (numericDate && (numericDate[3] || localToday)) {
    const usOrder = locale === 'en-US';
    const month = (usOrder ? numericDate[1] : numericDate[2]).padStart(2, '0');
    const dateOfMonth = (usOrder ? numericDate[2] : numericDate[1]).padStart(2, '0');
    const monthDay = `${month}-${dateOfMonth}`;
    let year = Number(numericDate[3] ?? localToday!.slice(0, 4));
    if (!numericDate[3] && monthDay < localToday!.slice(5)) year++;
    const proposed = `${year}-${monthDay}`;
    const instant = new Date(proposed + 'T12:00:00Z');
    if (Number.isFinite(+instant) && instant.toISOString().slice(0, 10) === proposed) day = proposed;
    else invalidDate = true;
  }
  return {
    time: hour ? hour.padStart(2,'0') + ':' + minute : undefined,
    relative: /\b(?:depois de amanha|pasado manana|day after tomorrow)\b/.test(normalized) ? 2
      : /\b(?:amanha|manana|tomorrow)\b/.test(normalized) ? 1
        : /\b(?:hoje|hoy|today)\b/.test(normalized) ? 0 : undefined,
    day, invalidDate,
  };
}
