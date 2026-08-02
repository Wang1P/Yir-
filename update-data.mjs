import { mkdir, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);

async function fetchText(url, timeoutMs = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 YirWorkbench/1.0",
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSON(url, timeoutMs = 15000) {
  return JSON.parse(await fetchText(url, timeoutMs));
}

function chinaNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

function ymd(date = chinaNow()) {
  return date.toISOString().slice(0, 10);
}

function ymdCompact(date = chinaNow()) {
  return ymd(date).replaceAll("-", "");
}

function normalizeDiff(diff) {
  if (!diff) return [];
  return Array.isArray(diff) ? diff : Object.values(diff);
}

function percent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) > 100 ? n / 100 : n;
}

async function buildNews() {
  const generatedAt = new Date().toISOString();
  try {
    const json = await fetchJSON("https://60s.viki.moe/v2/60s", 12000);
    const news = (json.data?.news || []).slice(0, 10);
    return {
      date: json.data?.date || ymd(),
      generatedAt,
      source: "60秒读懂世界",
      news,
      financeSignals: buildFinanceSignals(news),
    };
  } catch (error) {
    return {
      date: ymd(),
      generatedAt,
      source: "fallback",
      news: [],
      financeSignals: [],
      error: String(error.message || error),
    };
  }
}

function buildFinanceSignals(news) {
  const text = news.join(" ");
  const rules = [
    [/人工智能|算力|芯片|数据|大模型/, "AI算力、半导体与数据要素板块关注度提升。"],
    [/消费|文旅|餐饮|零售|以旧换新|暑运/, "消费、文旅、交通出行与零售链条可能受益。"],
    [/新能源|光伏|风电|储能|电网|台风|气象/, "新能源、电网设备与应急基础设施方向可跟踪。"],
    [/房价|地产|城市更新|基建|铁路|航班/, "地产链、基建、交运与工程机械存在观察线索。"],
    [/医药|医保|创新药|养老|医院/, "创新药、医疗服务与养老产业可继续跟踪。"],
    [/教育|教师|职业教育|学校/, "教育信息化、职业教育与出版方向可记录观察。"],
  ];
  const out = [];
  for (const [re, note] of rules) if (re.test(text)) out.push(note);
  return out.length ? out.slice(0, 5) : ["今日新闻未识别出强主题，可先观察政策、资金与产业关键词。"];
}

async function fetchIndices() {
  const url =
    "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006&fields=f12,f14,f2,f3,f4";
  const json = await fetchJSON(url, 12000);
  return normalizeDiff(json.data?.diff).map((x) => ({
    code: x.f12,
    name: x.f14,
    price: x.f2,
    change: x.f4,
    changePct: x.f3,
  }));
}

async function fetchLimitUpPool() {
  const url =
    "https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=300&sort=lbc%3Adesc&date=" +
    ymdCompact();
  const json = await fetchJSON(url, 12000);
  const pool = json.data?.pool || [];
  const sectorMap = new Map();
  for (const x of pool) {
    const sector = x.hybk || "其他";
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + 1);
  }
  const sectorLimitUps = [...sectorMap.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count);
  return {
    qdate: String(json.data?.qdate || ymdCompact()).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
    total: Number(json.data?.tc || pool.length || 0),
    sectorLimitUps,
    consecutiveLimitUps: pool
      .filter((x) => Number(x.lbc || 0) >= 2)
      .slice(0, 20)
      .map((x) => ({
        code: x.c,
        name: x.n,
        boards: Number(x.lbc || 1),
        sector: x.hybk || "",
        changePct: x.zdp,
      })),
  };
}

async function fetchMarketBreadth() {
  const base =
    "https://push2delay.eastmoney.com/api/qt/clist/get?po=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f3,f12,f14,f100&np=1&pn=";
  const first = await fetchJSON(`${base}1&pz=100`, 12000);
  const total = Number(first.data?.total || 0);
  const pages = Math.max(1, Math.ceil(total / 100));
  let up = 0;
  let down = 0;
  let flat = 0;
  let approxLimitUp = 0;

  async function consume(pageJson) {
    for (const x of normalizeDiff(pageJson.data?.diff)) {
      const p = Number(x.f3);
      if (!Number.isFinite(p)) continue;
      if (p > 0) up += 1;
      else if (p < 0) down += 1;
      else flat += 1;
      if (p >= 9.8) approxLimitUp += 1;
    }
  }

  await consume(first);
  for (let page = 2; page <= pages; page += 1) {
    try {
      await consume(await fetchJSON(`${base}${page}&pz=100`, 12000));
    } catch {
      // Keep partial breadth rather than failing the whole market board.
    }
  }
  return { total, up, down, flat, approxLimitUp };
}

async function buildMarket() {
  const generatedAt = new Date().toISOString();
  const [indicesResult, limitResult, breadthResult] = await Promise.allSettled([
    fetchIndices(),
    fetchLimitUpPool(),
    fetchMarketBreadth(),
  ]);

  const indices = indicesResult.status === "fulfilled" ? indicesResult.value : [];
  const limit = limitResult.status === "fulfilled" ? limitResult.value : { total: 0, sectorLimitUps: [], consecutiveLimitUps: [] };
  const breadth = breadthResult.status === "fulfilled" ? breadthResult.value : { total: 0, up: 0, down: 0, flat: 0, approxLimitUp: 0 };
  const top = limit.sectorLimitUps?.[0] || { sector: "待补充", count: 0 };

  return {
    date: ymd(),
    tradingDate: limit.qdate || ymd(),
    generatedAt,
    source: "GitHub Actions · 东方财富公开接口",
    indices,
    total: breadth.total,
    up: breadth.up,
    down: breadth.down,
    flat: breadth.flat,
    limitUpCount: limit.total || breadth.approxLimitUp,
    downLimitCount: 0,
    topSector: top.sector,
    topSectorCount: top.count,
    sectorLimitUps: limit.sectorLimitUps || [],
    consecutiveLimitUps: limit.consecutiveLimitUps || [],
    errors: [
      indicesResult.status === "rejected" ? `indices: ${indicesResult.reason?.message || indicesResult.reason}` : "",
      limitResult.status === "rejected" ? `limitPool: ${limitResult.reason?.message || limitResult.reason}` : "",
      breadthResult.status === "rejected" ? `breadth: ${breadthResult.reason?.message || breadthResult.reason}` : "",
    ].filter(Boolean),
  };
}

await mkdir(DATA_DIR, { recursive: true });
await writeFile(new URL("news.json", DATA_DIR), JSON.stringify(await buildNews(), null, 2), "utf8");
await writeFile(new URL("market.json", DATA_DIR), JSON.stringify(await buildMarket(), null, 2), "utf8");

console.log("Updated data/news.json and data/market.json");
