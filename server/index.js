import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import ExcelJS from "exceljs";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { validateRecord, sports } from "./domain.js";
import {subtypeOptions, subtypeLabel, matchesSubtype, hydrateRecord, exportDetails, recordUnit, formatSets} from "../src/subtypes.js";
const app = express(),
  dir = path.resolve(process.env.DATA_DIR || "data");
mkdirSync(path.join(dir, "photos"), { recursive: true });
const db = new DatabaseSync(path.join(dir, "dailyrep.sqlite"));
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,sport TEXT NOT NULL,value REAL NOT NULL,duration INTEGER NOT NULL,occurredAt TEXT NOT NULL,photo TEXT);`,
);
if (!db.prepare("PRAGMA table_info(records)").all().some(column => column.name === "subtype")) {
  db.exec("ALTER TABLE records ADD COLUMN subtype TEXT");
}
if (!db.prepare("PRAGMA table_info(records)").all().some(column => column.name === "details")) {
  db.exec("ALTER TABLE records ADD COLUMN details TEXT");
}
if (!db.prepare("PRAGMA table_info(records)").all().some(column => column.name === "quantityUnit")) {
  db.exec("ALTER TABLE records ADD COLUMN quantityUnit TEXT");
}
if (!db.prepare("SELECT id FROM account").get()) {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase(),
    password = process.env.OWNER_PASSWORD;
  if (!email || !password || password.length < 8)
    throw new Error("首次启动须设置 OWNER_EMAIL 和至少8位的 OWNER_PASSWORD");
  const salt = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO account VALUES (1,?,?,?)").run(
    email,
    salt,
    scryptSync(password, salt, 64).toString("hex"),
  );
}
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "blob:", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.headers.origin;
  if (origin && process.env.ALLOWED_ORIGIN === origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.header("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const cookieToken = (req) =>
  req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("dailyrep="))
    ?.slice(9);
const tokenOf = (req) =>
  req.headers.authorization?.replace(/^Bearer /, "") || cookieToken(req);
const secure =
  process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_HTTP;
app.post(
  "/api/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  (req, res) => {
    const a = db.prepare("SELECT * FROM account").get(),
      { email, password } = req.body || {};
    if (
      typeof password !== "string" ||
      password.length > 1024 ||
      typeof email !== "string"
    )
      return res.status(400).json({ error: "请输入邮箱和密码" });
    const candidate = scryptSync(password, a.salt, 64);
    if (
      !timingSafeEqual(candidate, Buffer.from(a.hash, "hex")) ||
      email.trim().toLowerCase() !== a.email
    )
      return res.status(401).json({ error: "邮箱或密码错误" });
    db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?)").run(
      token,
      Date.now() + 7 * 86400000,
    );
    res.cookie("dailyrep", token, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      maxAge: 7 * 86400000,
      path: "/",
    });
    res.json({ token, email: a.email });
  },
);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const session = db
    .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
    .get(tokenOf(req) || "", Date.now());
  if (!session) return res.status(401).json({ error: "请先登录" });
  next();
});
app.get("/api/me", (req, res) =>
  res.json({ email: db.prepare("SELECT email FROM account").get().email }),
);
app.post("/api/logout", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token=?").run(tokenOf(req));
  res.clearCookie("dailyrep", { path: "/" }).sendStatus(204);
});
app.get("/api/records", (req, res) =>
  res.json(db.prepare("SELECT * FROM records ORDER BY occurredAt DESC").all().map(hydrateRecord)),
);
const upload = multer({
  dest: path.join(dir, "photos"),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    cb(
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
        ? null
        : new multer.MulterError("LIMIT_UNEXPECTED_FILE"),
      true,
    ),
});
app.post("/api/records", upload.single("photo"), (req, res) => {
  try {
    const r = validateRecord(req.body);
    let photo = null;
    if (req.file) {
      const b = readFileSync(req.file.path);
      const valid =
        (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
        b
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        (b.toString("ascii", 0, 4) === "RIFF" &&
          b.toString("ascii", 8, 12) === "WEBP");
      if (!valid) throw new Error("请选择有效的 JPEG、PNG 或 WebP 图片");
      photo = req.file.filename;
    }
    const record = { id: randomBytes(16).toString("hex"), ...r, photo };
    db.prepare("INSERT INTO records(id,sport,value,duration,occurredAt,photo,subtype,details,quantityUnit) VALUES (?,?,?,?,?,?,?,?,?)").run(
      record.id,
      r.sport,
      r.value,
      r.duration,
      r.occurredAt,
      photo,
      r.subtype,
      r.details ? JSON.stringify(r.details) : null,
      r.quantityUnit,
    );
    res.status(201).json(record);
  } catch (e) {
    if (req.file) unlinkSync(req.file.path);
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/photos/:id", (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.sendStatus(404);
  const p = path.join(dir, "photos", req.params.id);
  if (!existsSync(p)) return res.sendStatus(404);
  const b = readFileSync(p);
  res.type(b[0] === 255 ? "jpg" : b[0] === 137 ? "png" : "webp").send(b);
});
app.delete("/api/records/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM records WHERE id=?").get(req.params.id);
  if (!r) return res.sendStatus(404);
  db.prepare("DELETE FROM records WHERE id=?").run(r.id);
  if (r.photo && existsSync(path.join(dir, "photos", r.photo)))
    unlinkSync(path.join(dir, "photos", r.photo));
  res.sendStatus(204);
});
app.get("/api/export", (req, res, next) => {
  (async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("运动记录");
    sheet.columns = [
      { header: "项目", key: "sport", width: 15 },
      { header: "运动时间 (UTC)", key: "occurredAt", width: 28 },
      { header: "运动量", key: "value", width: 14 },
      { header: "单位", key: "unit", width: 12 },
      { header: "时长（秒）", key: "duration", width: 16 },
      { header: "运动类型", key: "subtype", width: 18 },
      { header: "打卡编号", key: "checkinId", width: 36 },
      { header: "分组明细", key: "setsText", width: 55 },
    ];
    const names = {
        running: "跑步",
        swimming: "游泳",
        pushups: "俯卧撑",
        abs: "腹肌训练",
      },
      units = { running: "km", swimming: "m", pushups: "次", abs: "分钟" };
    const rows = sports.includes(req.query.sport)
      ? db
          .prepare(
            "SELECT * FROM records WHERE sport=? ORDER BY occurredAt DESC",
          )
          .all(req.query.sport)
      : db.prepare("SELECT * FROM records ORDER BY occurredAt DESC").all();
    const subtype = req.query.subtype || "";
    if (subtype && subtype !== "unclassified" && !subtypeOptions(req.query.sport).some(s => s.value === subtype)) return res.status(400).json({error: "请选择有效的运动类型"});
    exportDetails(rows, subtype).forEach((r) =>
      sheet.addRow({ ...r, sport: names[r.sport], unit: recordUnit(r), setsText: formatSets(r.sets,recordUnit(r)), subtype: subtypeLabel(r.sport,r.subtype) }),
    );
    sheet.getRow(1).font = { bold: true, color: { argb: "FF1F2A44" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = "A1:H1";
    res.attachment("dailyRep.xlsx");
    res.type(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await book.xlsx.write(res);
    res.end();
  })().catch(next);
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
app.use((err, req, res, next) => {
  res
    .status(err instanceof multer.MulterError ? 400 : 500)
    .json({
      error:
        err instanceof multer.MulterError
          ? "仅支持单张JPEG、PNG或WebP照片，且不能超过8MB"
          : "服务暂时不可用，请重试",
    });
});
const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("dailyRep API listening " + server.address().port),
);
