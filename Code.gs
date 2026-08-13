const CONFIG = {
  SPREADSHEET_ID: "1i-bg6Jd2bNiJhwB90UjrJZs_wSaUEenYydTcLgOKnNI",
  SHEET_ASEM: "asem",
  SHEET_FINAL: "angka final inflasi",

  // Login
  USERNAME: "harga1900",
  PASSWORD: "harga1900",

  // Cache
  CACHE_SECONDS: 300
};

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = String(p.action || "").trim();

    let result;
    switch (action) {
      case "login":
        result = login_(p.username, p.password);
        break;
      case "filters":
        result = getFilters_(p.source);
        break;
      case "table":
        result = getPivotTable_(p);
        break;
      case "headline":
        result = getHeadline_(p);
        break;
      case "commodity":
        result = getCommodity_(p);
        break;
      case "getUpdatedAt":
        result = getUpdatedAt_();
        break;
      case "setUpdatedAt":
        result = setUpdatedAt_(p.value, p.token);
        break;
      case "ping":
        result = { message: "API aktif" };
        break;
      default:
        throw new Error("Action tidak dikenali.");
    }

    return json_({ ok: true, ...result });
  } catch (err) {
    return json_({ ok: false, message: err.message || String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function login_(username, password) {
  if (String(username) !== CONFIG.USERNAME || String(password) !== CONFIG.PASSWORD) {
    throw new Error("Username atau password salah.");
  }

  const token = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      CONFIG.USERNAME + "|" + CONFIG.PASSWORD + "|" + new Date().toISOString().slice(0,10)
    )
  );

  return { token: token };
}

function validateToken_(token) {
  const expected = login_(CONFIG.USERNAME, CONFIG.PASSWORD).token;
  if (!token || token !== expected) throw new Error("Sesi login tidak valid.");
}

function sourceConfig_(source) {
  source = String(source || "").toLowerCase();
  if (source === "asem") {
    return {
      sheetName: CONFIG.SHEET_ASEM,
      cols: {
        year: 1, month: 2, cityCode: 3, cityName: 4,
        commodityCode: 5, commodityName: 6, flag: 7,
        ihk: 8,
        inflasiMtm: 9, inflasiYtd: 10, inflasiYoy: 11,
        andilMtm: 12, andilYtd: 13, andilYoy: 14
      }
    };
  }

  if (source === "final") {
    return {
      sheetName: CONFIG.SHEET_FINAL,
      cols: {
        year: 1, month: 2, cityCode: 3, cityName: 4,
        commodityCode: 5, commodityName: 6, flag: 7,
        nk: 8, ihk: 9,
        inflasiMtm: 10, inflasiYtd: 11, inflasiYoy: 12,
        andilMtm: 13, andilYtd: 14, andilYoy: 15
      }
    };
  }

  throw new Error("Sumber data tidak valid.");
}

function getSheetData_(source) {
  const cfg = sourceConfig_(source);
  const cache = CacheService.getScriptCache();
  const key = "sheetData:" + source;
  const cached = cache.get(key);

  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) throw new Error("Sheet tidak ditemukan: " + cfg.sheetName);

  const lastRow = sh.getLastRow();
  const lastCol = Math.max(sh.getLastColumn(), source === "final" ? 15 : 14);
  if (lastRow < 2) return [];

  // getDisplayValues dipakai agar kode kota/komoditas tidak rusak oleh format angka.
  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

  // Cache data Asem saja. Sheet final sangat besar, jadi tidak dipaksa masuk cache.
  if (source === "asem") {
    try {
      cache.put(key, JSON.stringify(values), CONFIG.CACHE_SECONDS);
    } catch (err) {}
  }

  return values;
}

function getFilters_(source) {
  const cfg = sourceConfig_(source);
  const rows = getSheetData_(source);
  const c = cfg.cols;

  const yearsSet = {};
  const monthsByYear = {};
  const flagsSet = {};
  const cityMap = {};

  rows.forEach(r => {
    const year = clean_(r[c.year - 1]);
    const month = clean_(r[c.month - 1]);
    const flag = clean_(r[c.flag - 1]);
    const cityCode = clean_(r[c.cityCode - 1]);
    const cityName = clean_(r[c.cityName - 1]);

    if (year) {
      yearsSet[year] = true;
      if (!monthsByYear[year]) monthsByYear[year] = {};
      if (month) monthsByYear[year][month] = true;
    }
    if (flag !== "") flagsSet[flag] = true;
    if (cityCode) cityMap[cityCode] = cityName;
  });

  const years = Object.keys(yearsSet).sort((a,b) => Number(b)-Number(a));
  const flags = Object.keys(flagsSet).sort(numericSort_);
  const cities = Object.keys(cityMap)
    .sort(numericSort_)
    .map(code => ({ code: code, name: cityMap[code] }));

  const mb = {};
  Object.keys(monthsByYear).forEach(y => {
    mb[y] = Object.keys(monthsByYear[y]).sort(numericSort_);
  });

  return {
    years: years,
    flags: flags,
    cities: cities,
    monthsByYear: mb
  };
}

function getPivotTable_(p) {
  const source = p.source;
  const period = String(p.period || "").toLowerCase();
  const view = String(p.view || "").toLowerCase();
  const year = String(p.year || "");
  const month = String(p.month || "");
  const flag = String(p.flag || "");

  if (!year || !month || flag === "") throw new Error("Tahun, bulan, dan flag harus dipilih.");

  const cfg = sourceConfig_(source);
  const c = cfg.cols;
  const metricCol = metricColumn_(c, period, view);

  const rows = getSheetData_(source);

  const cityMap = {};
  const commodityMap = {};
  const matrix = {};

  rows.forEach(r => {
    if (clean_(r[c.year-1]) !== year) return;
    if (clean_(r[c.month-1]) !== month) return;
    if (clean_(r[c.flag-1]) !== flag) return;

    const cityCode = clean_(r[c.cityCode-1]);
    const cityName = clean_(r[c.cityName-1]);
    const commodityCode = clean_(r[c.commodityCode-1]);
    const commodityName = clean_(r[c.commodityName-1]);

    if (!cityCode || !commodityCode) return;

    cityMap[cityCode] = cityName;
    commodityMap[commodityCode] = commodityName;

    if (!matrix[commodityCode]) matrix[commodityCode] = {};
    matrix[commodityCode][cityCode] = toNumber_(r[metricCol-1]);
  });

  const cities = Object.keys(cityMap).sort(numericSort_);
  const commodities = Object.keys(commodityMap).sort(numericSort_);

  const columns = ["Kode Komoditas", "Nama Komoditas"].concat(
    cities.map(code => code + (cityMap[code] ? " - " + cityMap[code] : ""))
  );

  const out = commodities.map(code => {
    const row = [code, commodityMap[code]];
    cities.forEach(city => {
      row.push(matrix[code] && matrix[code].hasOwnProperty(city) ? matrix[code][city] : null);
    });
    return row;
  });

  return {
    title: labelView_(view, period),
    info: sourceLabel_(source) + " • Tahun " + year + " • Bulan " + month + " • Flag " + flag,
    columns: columns,
    rows: out
  };
}

function getHeadline_(p) {
  const source = p.source;
  const year = String(p.year || "");
  const month = String(p.month || "");

  if (!year || !month) throw new Error("Tahun dan bulan harus dipilih.");

  const cfg = sourceConfig_(source);
  const c = cfg.cols;
  const rows = getSheetData_(source);

  const result = [];

  rows.forEach(r => {
    if (clean_(r[c.year-1]) !== year) return;
    if (clean_(r[c.month-1]) !== month) return;

    const flag = clean_(r[c.flag-1]);
    const commodityCode = clean_(r[c.commodityCode-1]);
    const commodityName = clean_(r[c.commodityName-1]);

    // Inflasi umum: Flag 0 / kode komoditas 0 / UMUM.
    if (!(flag === "0" || commodityCode === "0" || commodityName.toUpperCase() === "UMUM")) return;

    result.push([
      clean_(r[c.cityCode-1]),
      clean_(r[c.cityName-1]),
      toNumber_(r[c.inflasiMtm-1]),
      toNumber_(r[c.inflasiYtd-1]),
      toNumber_(r[c.inflasiYoy-1])
    ]);
  });

  result.sort((a,b) => numericSort_(a[0],b[0]));

  return {
    title: source === "asem" ? "Inflasi Asem" : "Inflasi Final",
    info: sourceLabel_(source) + " • Tahun " + year + " • Bulan " + month,
    columns: ["Kode Kota", "Nama Kota", "Inflasi MtM", "Inflasi YtD", "Inflasi YoY"],
    rows: result
  };
}

function getCommodity_(p) {
  const source = p.source;
  const period = String(p.period || "").toLowerCase();
  const year = String(p.year || "");
  const month = String(p.month || "");
  const flag = String(p.flag || "");
  const city = String(p.city || "");
  const mode = String(p.mode || "top10");

  if (!year || !month || flag === "" || !city) {
    throw new Error("Tahun, bulan, flag, dan kode kota harus dipilih.");
  }

  const cfg = sourceConfig_(source);
  const c = cfg.cols;
  const metricCol = metricColumn_(c, period, "andil");
  const rows = getSheetData_(source);

  const list = [];

  rows.forEach(r => {
    if (clean_(r[c.year-1]) !== year) return;
    if (clean_(r[c.month-1]) !== month) return;
    if (clean_(r[c.flag-1]) !== flag) return;
    if (clean_(r[c.cityCode-1]) !== city) return;

    const code = clean_(r[c.commodityCode-1]);
    const name = clean_(r[c.commodityName-1]);
    if (!code || !name) return;

    const value = toNumber_(r[metricCol-1]);
    if (value === null) return;

    list.push({ code:code, name:name, value:value });
  });

  const lowestAll = list.filter(x => x.value < 0).sort((a,b) => a.value - b.value);
  const highestAll = list.filter(x => x.value > 0).sort((a,b) => b.value - a.value);

  let lowest, highest;
  if (mode === "threshold") {
    lowest = lowestAll.filter(x => x.value <= -0.01);
    highest = highestAll.filter(x => x.value >= 0.01);
  } else {
    lowest = lowestAll.slice(0,10);
    highest = highestAll.slice(0,10);
  }

  return {
    lowest: lowest.map((x,i) => [i+1, x.code, x.name, x.value]),
    highest: highest.map((x,i) => [i+1, x.code, x.name, x.value])
  };
}

function metricColumn_(c, period, view) {
  const prefix = view === "andil" ? "andil" : "inflasi";
  const suffix = period === "mtm" ? "Mtm" : period === "ytd" ? "Ytd" : period === "yoy" ? "Yoy" : "";
  if (!suffix) throw new Error("Periode tidak valid.");

  const key = prefix + suffix;
  if (!c[key]) throw new Error("Kolom metrik tidak ditemukan.");
  return c[key];
}

function getUpdatedAt_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty("ASEM_UPDATED_AT") || "";
  return formatUpdatedAt_(raw);
}

function setUpdatedAt_(value, token) {
  validateToken_(token);

  value = String(value || "").trim();
  if (!value) throw new Error("Tanggal dan jam kosong.");

  PropertiesService.getScriptProperties().setProperty("ASEM_UPDATED_AT", value);
  return formatUpdatedAt_(value);
}

function formatUpdatedAt_(raw) {
  if (!raw) return { raw:"", display:"Belum diatur", inputValue:"" };

  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return { raw:raw, display:raw, inputValue:raw };
  }

  const tz = Session.getScriptTimeZone() || "Asia/Jakarta";
  const display = Utilities.formatDate(d, tz, "dd MMMM yyyy, HH:mm") + " WIB";
  const inputValue = Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm");

  return { raw:raw, display:display, inputValue:inputValue };
}

function sourceLabel_(source) {
  return source === "asem" ? "Angka Sementara" : "Angka Final Inflasi";
}

function labelView_(view, period) {
  const p = period === "mtm" ? "MtM" : period === "ytd" ? "YtD" : "YoY";
  return (view === "andil" ? "Andil " : "Inflasi ") + p;
}

function clean_(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function toNumber_(v) {
  if (v === null || v === undefined || v === "") return null;

  let s = String(v).trim();
  if (!s) return null;

  // Format Indonesia: titik ribuan, koma desimal.
  if (s.indexOf(",") >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  }

  const n = Number(s);
  return isNaN(n) ? null : n;
}

function numericSort_(a,b) {
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), "id");
}