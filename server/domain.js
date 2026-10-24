export const sports = ["running", "swimming", "pushups", "abs"];
export function validateRecord(body = {}) {
  const value = Number(body.value),
    duration = Number(body.duration);
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
  return { sport: body.sport, value, duration, occurredAt: time.toISOString() };
}
