require("dotenv").config();
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

// Use persistent storage in production
const dbPath = process.env.DB_PATH ||
  path.join(__dirname, "appointments.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create database tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  UNIQUE(date,start_time,end_time)
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  CHECK(status IN ('pending','approved','rejected','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_slot_status
ON appointments(slot_id,status);
`);

// Create admin using environment variables
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
const adminName = process.env.ADMIN_NAME || "OpenSlot Admin";

if (!adminEmail || !adminPassword) {
  throw new Error("Admin credentials must be configured in .env");
}

const existingAdmin = db.prepare(
  "SELECT id FROM users WHERE email = ? COLLATE NOCASE"
).get(adminEmail);

if (!existingAdmin) {
  db.prepare(`
    INSERT INTO users (name, email, password, role)
    VALUES (?, ?, ?, 'admin')
  `).run(
    adminName,
    adminEmail,
    bcrypt.hashSync(adminPassword, 10)
  );
}

// Generate default availability
const count = db.prepare(
  "SELECT COUNT(*) n FROM slots"
).get().n;

if (count === 0) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO slots
    (date,start_time,end_time)
    VALUES (?,?,?)
  `);

  const dates = [];
  const now = new Date();

  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);

    const date = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");

    dates.push(date);
  }

  const times = [
    ["09:00", "09:30"],
    ["10:00", "10:30"],
    ["11:00", "11:30"],
    ["12:00", "12:30"],
    ["14:00", "14:30"],
    ["15:00", "15:30"],
    ["16:00", "16:30"]
  ];

  const seed = db.transaction(() => {
    dates.forEach(date => {
      times.forEach(time => {
        insert.run(date, time[0], time[1]);
      });
    });
  });

  seed();
}

module.exports = db;
