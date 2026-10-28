import {subtypeOptions} from "../src/subtypes.js";
export const sports = ["running", "swimming", "pushups", "abs"];
export function validateRecord(body = {}) {
  let details = null;
  if (body.details != null) {
    try { details = typeof body.details === "string" ? JSON.parse(body.details) : body.details; }
    catch { throw new Error("请检查运动明细"); }
    const options = subtypeOptions(body.sport);
    if (!options.length || !Array.isArray(details) || !details.length || details.length > options.length)
      throw new Error("请填写有效的运动明细");
    const seen = new Set();
    details = details.map(item => {
      if (!item || !options.some(o => o.value === item.subtype) || seen.has(item.subtype))
        throw new Error("请选择有效类型，同一种类型请合并填写");
      seen.add(item.subtype);
      const value = Number(item.value), duration = Number(item.duration);
      if (!Number.isFinite(value) || value <= 0 || value > 100000 || !Number.isInteger(duration) || duration < 1 || duration > 86400)
        throw new Error("每项明细需填写有效运动量和时长");
      return {subtype: item.subtype, value, duration};
    });
  }
  const value = details ? details.reduce((sum,d) => sum+d.value,0) : Number(body.value),
    duration = details ? details.reduce((sum,d) => sum+d.duration,0) : Number(body.duration);
  const time = new Date(body.occurredAt);
  if (
    !sports.includes(body.sport) ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 100000 ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 86400 ||
    !Number.isFinite(time.getTime()) ||
    time > new Date()
  )
    throw new Error("请检查运动项目、运动量、时长及时间（不能晚于现在）");
  if (body.sport === "pushups" && !Number.isInteger(value))
    throw new Error("俯卧撑次数必须为整数");
  // Omitted subtype is accepted for already-installed clients; never guess a type.
  const subtype = details ? (details.length === 1 ? details[0].subtype : null) : (body.subtype == null || body.subtype === "" ? null : body.subtype);
  if (subtype !== null && !subtypeOptions(body.sport).some(item => item.value === subtype))
    throw new Error("请选择有效的运动类型");
  return { sport: body.sport, subtype, details, value, duration, occurredAt: time.toISOString() };
}
