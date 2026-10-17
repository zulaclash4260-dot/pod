#!/usr/bin/env node
/**
 * bulk-import-sample.mjs — نمونه‌ی آموزشی «ورودی گروهی سوالات»
 * ------------------------------------------------------------------
 * این اسکریپت نشان می‌دهد برنامه‌ی پودمان‌بان چطور سوال‌ها را به‌صورت
 * گروهی می‌گیرد، قدم‌به‌قدم:
 *
 *   ۱. لاگین مدیر  →  POST /api/auth/login   (کوکی نشست + توکن CSRF)
 *   ۲. ورودی گروهی →  POST /api/admin/questions/bulk
 *
 * نکته‌های امنیتی که از روی همین کد یاد می‌گیری:
 * - یوزر/پسورد فقط از متغیر محیطی خوانده می‌شود، هیچ‌وقت داخل کد نیست
 *   و هیچ‌وقت لاگ نمی‌شود.
 * - توکن CSRF هم در هدر x-csrf-token و هم در کوکی pb_csrf فرستاده
 *   می‌شود؛ سرور هر سه مقدار (هدر، کوکی، نشست کاربر) را با هم چک می‌کند.
 * - خطاهای اعتبارسنجی سرور (zod) مستقیم چاپ می‌شوند تا بفهمی کدام
 *   سوال ایراد دارد.
 *
 * اجرا:
 *   PB_USER=hadi PB_PASS='...' MODULE_ID='<id>' node scripts/bulk-import-sample.mjs
 *   PB_USER=hadi PB_PASS='...' MODULE_ID='<id>' node scripts/bulk-import-sample.mjs ./my-questions.json
 *
 * پیدا کردن MODULE_ID: در پنل مدیر روی «ورودی گروهی» یک پودمان کلیک کن،
 * یا:  curl -b cookies.txt http://localhost:3001/api/admin/books
 */

import { readFileSync } from "node:fs"

// ---------------------------------------------------------------- config

const BASE = (process.env.PB_BASE ?? "http://localhost:3001").replace(/\/$/, "")
const USERNAME = process.env.PB_USER
const PASSWORD = process.env.PB_PASS
const MODULE_ID = process.env.MODULE_ID ?? process.argv[3]
const JSON_PATH = process.argv[2]

if (!USERNAME || !PASSWORD) {
  console.error("خطا: PB_USER و PB_PASS را در محیط ست کن.")
  console.error("مثال: PB_USER=hadi PB_PASS='...' MODULE_ID='<id>' node scripts/bulk-import-sample.mjs")
  process.exit(1)
}

if (!MODULE_ID) {
  console.error("خطا: MODULE_ID لازم است (متغیر محیطی یا آرگومان دوم).")
  process.exit(2)
}

// ------------------------------------------------------------ sample data
// قالب استاندارد ورودی گروهی — دقیقاً همان که در پنل مدیر هم پذیرفته می‌شود.

const SAMPLE_QUESTIONS = [
  {
    text: "واحد اندازه‌گیری جریان الکتریکی چیست؟",
    options: ["ولت", "آمپر", "اهم", "وات"],
    correctOption: 1,
    explanation: "جریان الکتریکی با واحد آمپر (A) سنجیده می‌شود؛ ولت واحد ولتاژ و اهم واحد مقاومت است.",
  },
  {
    text: "قانون اهم کدام رابطه را بیان می‌کند؟",
    options: ["V = I × R", "P = V × I", "I = V × R"],
    correctOption: 0,
    explanation: "طبق قانون اهم، ولتاژ (V) برابر حاصل‌ضرب جریان (I) در مقاومت (R) است.",
  },
  {
    text: "پروتکل HTTP به‌صورت پیش‌فرض روی کدام پورت کار می‌کند؟",
    options: ["۲۱", "۲۵", "۸۰", "۴۴۳"],
    correctOption: 2,
    explanation: "پورت ۸۰ پورت پیش‌فرض HTTP و پورت ۴۴۳ مخصوص نسخه امن آن (HTTPS) است.",
  },
]

function loadQuestions() {
  if (!JSON_PATH) return SAMPLE_QUESTIONS
  const raw = readFileSync(JSON_PATH, "utf8")
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error("فایل JSON باید یک آرایه باشد.")
  return data
}

// ------------------------------------------------------------ tiny cookie jar
// fetch در نود کوکی را خودش نگه نمی‌دارد؛ پس ست‌کوکی‌های پاسخ را می‌گیریم
// و در درخواست‌های بعدی پس می‌فرستیم.

class CookieJar {
  /** @type {Map<string, string>} */
  #store = new Map()

  /** @param {Response} res */
  save(res) {
    for (const header of res.headers.getSetCookie?.() ?? []) {
      const pair = header.split(";", 1)[0]
      const eq = pair.indexOf("=")
      if (eq > 0) this.#store.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }

  header() {
    return [...this.#store.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
  }
}

/**
 * @param {CookieJar} jar
 * @param {string} path
 * @param {{ method?: string, body?: unknown, csrf?: string }} opts
 */
async function api(jar, path, opts = {}) {
  const headers = { "content-type": "application/json" }
  const cookie = jar.header()
  if (cookie) headers.cookie = cookie
  if (opts.csrf) headers["x-csrf-token"] = opts.csrf

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  jar.save(res)

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text.slice(0, 200) }
  }

  if (!res.ok) {
    const msg = data?.error ?? `HTTP ${res.status}`
    throw new Error(`[${opts.method ?? "GET"} ${path}] ${msg}`)
  }
  return data
}

// ------------------------------------------------------------------ main

const jar = new CookieJar()

// ۱) لاگین مدیر — پاسخ شامل { user, csrf } است و کوکی‌های نشست را ست می‌کند.
console.log(`→ لاگین ${USERNAME} در ${BASE} ...`)
const login = await api(jar, "/api/auth/login", {
  method: "POST",
  body: { username: USERNAME, password: PASSWORD },
})

if (login.user?.role !== "ADMIN") {
  throw new Error(`کاربر «${USERNAME}» مدیر نیست؛ ورودی گروهی فقط برای مدیر است.`)
}
console.log("✓ لاگین موفق، توکن CSRF گرفته شد.")

// ۲) ورودی گروهی
const questions = loadQuestions()
console.log(`→ ارسال ${questions.length} سوال به پودمان ${MODULE_ID} ...`)

const result = await api(jar, "/api/admin/questions/bulk", {
  method: "POST",
  csrf: login.csrf,
  body: { moduleId: MODULE_ID, questions },
})

console.log(`✓ تمام شد: ${result.count} سوال افزوده شد.`)
