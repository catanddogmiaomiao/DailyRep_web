export const subtypes = {
  swimming: [
    {value: "breaststroke", label: "蛙泳"},
    {value: "butterfly", label: "蝶泳"},
    {value: "freestyle", label: "自由泳"},
  ],
  abs: [
    {value: "situps", label: "仰卧起坐"},
    {value: "abwheel", label: "腹肌轮"},
  ],
};
/** @param {string} sport @returns {{value: string, label: string}[]} */
export const subtypeOptions = sport => Object.hasOwn(subtypes, sport) ? subtypes[sport] : [];
export const subtypeLabel = (sport, value) => subtypeOptions(sport).find(s => s.value === value)?.label || (subtypeOptions(sport).length ? "未分类" : "—");
// A legacy single-type record is equivalent to one detail, without changing its ID.
export const recordDetails = record => {
  const details = typeof record.details === "string" ? JSON.parse(record.details) : record.details;
  return Array.isArray(details) && details.length ? details : [{subtype: record.subtype || null, value: record.value, duration: record.duration}];
};
export const matchesSubtype = (record, subtype) => !subtype || recordDetails(record).some(d => subtype === "unclassified" ? !d.subtype : d.subtype === subtype);
export const projectRecord = (record, subtype = "") => {
  const details = recordDetails(record).filter(d => !subtype || (subtype === "unclassified" ? !d.subtype : d.subtype === subtype));
  return {...record, details, value: details.reduce((sum,d) => sum + d.value,0), duration: details.reduce((sum,d) => sum + d.duration,0)};
};
export const hydrateRecord = record => ({...record, details: record.details ? recordDetails(record) : null});
export const exportDetails = (records, subtype = "") => records.flatMap(record => recordDetails(record)
  .filter(d => !subtype || (subtype === "unclassified" ? !d.subtype : d.subtype === subtype))
  .map(d => ({...record, ...d, checkinId: record.id})));
