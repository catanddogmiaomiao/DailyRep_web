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
export const subtypeOptions = sport => Object.hasOwn(subtypes, sport) ? subtypes[sport] : [];
export const subtypeLabel = (sport, value) => subtypeOptions(sport).find(s => s.value === value)?.label || (subtypeOptions(sport).length ? "未分类" : "—");
export const matchesSubtype = (record, subtype) => !subtype || (subtype === "unclassified" ? !record.subtype : record.subtype === subtype);
