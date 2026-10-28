import {subtypeOptions, matchesSubtype, projectRecord, countableVolume} from "./subtypes.js";
export function report(records, sport, period, anchor = new Date(), subtype = "") {
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
  const periodRows = records.filter(
    (r) =>
      r.sport === sport &&
      new Date(r.occurredAt) >= start &&
      new Date(r.occurredAt) < end,
  );
  const rows = periodRows.filter(r => matchesSubtype(r, subtype)).map(r => projectRecord(r, subtype));
  const groups = [...subtypeOptions(sport)];
  if (groups.length && periodRows.some(r => matchesSubtype(r, "unclassified"))) groups.push({value: "unclassified", label: "未分类"});
  const breakdown = groups.map(group => {
    const items = periodRows.filter(r => matchesSubtype(r, group.value)).map(r => projectRecord(r, group.value));
    return {...group, total: items.reduce((sum, r) => sum + countableVolume(r), 0), duration: items.reduce((sum, r) => sum + r.duration, 0), setCount: items.reduce((sum,r) => sum+r.details.reduce((n,d) => n+(d.sets?.length || 0),0),0), count: items.length};
  });
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
    bars[i].value += countableVolume(r);
  });
  return {
    start,
    end,
    breakdown,
    setCount: rows.reduce((sum,r) => sum+r.details.reduce((n,d) => n+(d.sets?.length || 0),0),0),
    rows,
    bars,
    total: rows.reduce((n, r) => n + countableVolume(r), 0),
    legacyCount: sport === "abs" ? rows.filter(r => r.quantityUnit !== "reps").length : 0,
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
