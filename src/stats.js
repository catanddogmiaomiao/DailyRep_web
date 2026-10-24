export function report(records, sport, period, anchor = new Date()) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  let count;
  if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    count = 7;
  } else if (period === "month") {
    start.setDate(1);
    count = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  } else {
    start.setMonth(0, 1);
    count = 12;
  }
  const end = new Date(start);
  if (period === "week") end.setDate(end.getDate() + 7);
  else if (period === "month") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  const rows = records.filter(
    (r) =>
      r.sport === sport &&
      new Date(r.occurredAt) >= start &&
      new Date(r.occurredAt) < end,
  );
  const bars = Array.from({ length: count }, (_, i) => ({
    label:
      period === "week"
        ? ["一", "二", "三", "四", "五", "六", "日"][i]
        : String(i + 1),
    value: 0,
  }));
  rows.forEach((r) => {
    const t = new Date(r.occurredAt);
    const i =
      period === "year"
        ? t.getMonth()
        : period === "month"
          ? t.getDate() - 1
          : Math.round(
              (Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) -
                Date.UTC(
                  start.getFullYear(),
                  start.getMonth(),
                  start.getDate(),
                )) /
                86400000,
            );
    bars[i].value += r.value;
  });
  return {
    start,
    end,
    rows,
    bars,
    total: rows.reduce((n, r) => n + r.value, 0),
    duration: rows.reduce((n, r) => n + r.duration, 0),
  };
}
export function movePeriod(anchor, period, offset) {
  const d = new Date(anchor);
  if (period === "week") d.setDate(d.getDate() + 7 * offset);
  else if (period === "month") {
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
  } else d.setFullYear(d.getFullYear() + offset);
  return d;
}
