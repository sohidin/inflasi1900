const CONFIG = {
  SPREADSHEET_ID: "1i-bg6Jd2bNiJhwB90UjrJZs_wSaUEenYydTcLgOKnNI",
  SHEET_ASEM: "asem",
  SHEET_FINAL: "angka final inflasi",
  USERNAME: "harga1900",
  PASSWORD: "harga1900",

  // Metadata filter disimpan 6 jam.
  FILTER_CACHE_SECONDS: 21600,

  // Hasil tabel per kombinasi filter disimpan 10 menit.
  DATA_CACHE_SECONDS: 600,

  // Naikkan versi ini setiap struktur backend berubah agar cache lama tidak terbaca.
  CACHE_VERSION: "v6"
};

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = String(p.action || "");

    let result;
    if (action === "login") result = login_(p.username, p.password);
    else if (action === "filters") result = getFilters_(p.source);
    else if (action === "table") result = getPivotTable_(p);
    else if (action === "headline") result = getHeadline_(p);
    else if (action === "commodity") result = getCommodity_(p);
    else if (action === "getUpdatedAt") result = getUpdatedAt_();
    else if (action === "setUpdatedAt") result = setUpdatedAt_(p.value, p.token);
    else if (action === "clearCache") result = clearCache_(p.token);
    else if (action === "ping") result = {message:"API aktif"};
    else throw new Error("Action tidak dikenali.");

    return json_({ok:true, ...result});
  } catch (err) {
    return json_({ok:false, message:err.message || String(err)});
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function login_(username, password) {
  if (String(username) !== CONFIG.USERNAME || String(password) !== CONFIG.PASSWORD) {
    throw new Error("Username atau password salah.");
  }
  return {token:token_()};
}

function token_() {
  const base = CONFIG.USERNAME + "|" + CONFIG.PASSWORD + "|" +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base)
  );
}

function validateToken_(token) {
  if (!token || token !== token_()) throw new Error("Sesi login tidak valid.");
}

function sourceConfig_(source) {
  if (source === "asem") {
    return {
      sheetName: CONFIG.SHEET_ASEM,
      lastCol: 14,
      cols: {
        year:1, month:2, cityCode:3, cityName:4,
        commodityCode:5, commodityName:6, flag:7,
        ihk:8,
        inflasiMtm:9, inflasiYtd:10, inflasiYoy:11,
        andilMtm:12, andilYtd:13, andilYoy:14
      }
    };
  }

  if (source === "final") {
    return {
      sheetName: CONFIG.SHEET_FINAL,
      lastCol: 15,
      cols: {
        year:1, month:2, cityCode:3, cityName:4,
        commodityCode:5, commodityName:6, flag:7,
        nk:8, ihk:9,
        inflasiMtm:10, inflasiYtd:11, inflasiYoy:12,
        andilMtm:13, andilYtd:14, andilYoy:15
      }
    };
  }

  throw new Error("Sumber data tidak valid.");
}

function sheet_(source) {
  const cfg = sourceConfig_(source);
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) throw new Error("Sheet tidak ditemukan: " + cfg.sheetName);
  return {sh:sh, cfg:cfg};
}

/**
 * OPTIMASI UTAMA:
 * - Tidak lagi membaca 108 ribu x 15 kolom setiap klik.
 * - Hanya membaca kolom A:B untuk menemukan blok tahun-bulan.
 * - Setelah blok ditemukan, hanya blok tersebut yang dibaca.
 * - Posisi blok tahun-bulan di-cache.
 */
function getPeriodRows_(source, year, month) {
  const cache = CacheService.getScriptCache();
  const cacheKey = CONFIG.CACHE_VERSION + ":period:" + source + ":" + year + ":" + month;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const obj = sheet_(source);
  const sh = obj.sh;
  const cfg = obj.cfg;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  /*
   * DATA FINAL tersusun per blok Kode Kota.
   * Contoh: seluruh periode 1900 selesai dahulu,
   * lalu blok 1902 dimulai lagi dari periode awal.
   *
   * Karena itu TIDAK boleh berhenti setelah blok periode pertama.
   * Kita scan A:C yang relatif ringan untuk menemukan semua baris
   * dengan Tahun+Bulan yang diminta pada SELURUH kode kota.
   */
  const meta = sh.getRange(2, 1, lastRow - 1, 3).getDisplayValues();

  const matchedRows = [];
  for (let i = 0; i < meta.length; i++) {
    if (clean_(meta[i][0]) === String(year) &&
        clean_(meta[i][1]) === String(month)) {
      matchedRows.push(i + 2);
    }
  }
  if (!matchedRows.length) return [];

  // Gabungkan nomor baris berurutan menjadi segmen supaya panggilan getRange sedikit.
  const segments = [];
  let start = matchedRows[0];
  let prev = matchedRows[0];

  for (let i = 1; i < matchedRows.length; i++) {
    const cur = matchedRows[i];
    if (cur === prev + 1) {
      prev = cur;
    } else {
      segments.push({start:start, count:prev-start+1});
      start = cur;
      prev = cur;
    }
  }
  segments.push({start:start, count:prev-start+1});

  let rows = [];
  segments.forEach(seg => {
    const part = sh.getRange(seg.start, 1, seg.count, cfg.lastCol).getDisplayValues();
    rows = rows.concat(part);
  });

  // Cache hanya jika ukurannya memungkinkan. Hasil pivot sendiri juga di-cache.
  try {
    const txt = JSON.stringify(rows);
    if (txt.length < 95000) {
      cache.put(cacheKey, txt, CONFIG.DATA_CACHE_SECONDS);
    }
  } catch (e) {}

  return rows;
}

function getFilters_(source) {
  const cache = CacheService.getScriptCache();
  const key = CONFIG.CACHE_VERSION + ":filters:" + source;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const obj = sheet_(source);
  const sh = obj.sh;
  const cfg = obj.cfg;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {years:[],flags:[],cities:[],monthsByYear:{}};

  // Metadata filter: baca A:D dan G saja. Tidak perlu E:F.
  const mainMeta = sh.getRange(2,1,lastRow-1,4).getDisplayValues();
  const flagMeta = sh.getRange(2,7,lastRow-1,1).getDisplayValues();

  const years = {};
  const monthsByYear = {};
  const flags = {};
  const cities = {};

  mainMeta.forEach((r,i) => {
    const y=clean_(r[0]), m=clean_(r[1]), code=clean_(r[2]), name=clean_(r[3]);
    const flag=clean_(flagMeta[i] ? flagMeta[i][0] : "");
    if(y){
      years[y]=true;
      if(!monthsByYear[y]) monthsByYear[y]={};
      if(m) monthsByYear[y][m]=true;
    }
    if(flag!=="") flags[flag]=true;
    if(code) cities[code]=name;
  });

  const result = {
    years:Object.keys(years).sort((a,b)=>Number(b)-Number(a)),
    flags:Object.keys(flags).sort(numericSort_),
    cities:Object.keys(cities).sort(numericSort_).map(code=>({code:code,name:cities[code]})),
    monthsByYear:{}
  };

  Object.keys(monthsByYear).forEach(y=>{
    result.monthsByYear[y]=Object.keys(monthsByYear[y]).sort(numericSort_);
  });

  try{
    const txt=JSON.stringify(result);
    if(txt.length<95000) cache.put(key,txt,CONFIG.FILTER_CACHE_SECONDS);
  }catch(e){}

  return result;
}

function getPivotTable_(p) {
  const source = String(p.source || "");
  const period = String(p.period || "").toLowerCase();
  const view = String(p.view || "").toLowerCase();
  const year = String(p.year || "");
  const month = String(p.month || "");
  const flag = String(p.flag || "");

  if (!year || !month || flag === "") throw new Error("Tahun, bulan, dan flag harus dipilih.");

  const cache = CacheService.getScriptCache();
  const key = [CONFIG.CACHE_VERSION,"pivot",source,period,view,year,month,flag].join(":");
  const cached = cache.get(key);
  if(cached) return JSON.parse(cached);

  const cfg = sourceConfig_(source);
  const c = cfg.cols;
  const metricCol = metricColumn_(c, period, view);
  const rows = getPeriodRows_(source, year, month);

  const cityMap = {};
  const commodityMap = {};
  const matrix = {};

  rows.forEach(r => {
    if (clean_(r[c.flag-1]) !== flag) return;

    const cityCode=clean_(r[c.cityCode-1]);
    const cityName=clean_(r[c.cityName-1]);
    const commodityCode=clean_(r[c.commodityCode-1]);
    const commodityName=clean_(r[c.commodityName-1]);
    if(!cityCode || !commodityCode) return;

    cityMap[cityCode]=cityName;
    commodityMap[commodityCode]=commodityName;
    if(!matrix[commodityCode]) matrix[commodityCode]={};
    matrix[commodityCode][cityCode]=toNumber_(r[metricCol-1]);
  });

  // Urutan kab/kota utama sesuai kebutuhan dashboard.
  const preferredCities=["1902","1903","1906","1971","1900"];
  const cityCodes=preferredCities.filter(code=>cityMap[code]);
  Object.keys(cityMap)
    .filter(code=>preferredCities.indexOf(code)===-1)
    .sort(numericSort_)
    .forEach(code=>cityCodes.push(code));

  const commodityCodes=Object.keys(commodityMap).sort(numericSort_);

  const result = {
    title:labelView_(view,period),
    info:sourceLabel_(source)+" • Tahun "+year+" • Bulan "+month+" • Flag "+flag,
    columns:["Kode Komoditas","Nama Komoditas"].concat(cityCodes.map(code=>code+" - "+cityMap[code])),
    rows:commodityCodes.map(code=>{
      const out=[code,commodityMap[code]];
      cityCodes.forEach(city=>out.push(
        matrix[code] && Object.prototype.hasOwnProperty.call(matrix[code],city) ? matrix[code][city] : null
      ));
      return out;
    })
  };

  cacheSmall_(key,result);
  return result;
}

function getHeadline_(p) {
  const source=String(p.source||"");
  const year=String(p.year||"");
  const month=String(p.month||"");
  if(!year||!month) throw new Error("Tahun dan bulan harus dipilih.");

  const key=[CONFIG.CACHE_VERSION,"headline",source,year,month].join(":");
  const cache=CacheService.getScriptCache();
  const cached=cache.get(key);
  if(cached) return JSON.parse(cached);

  const cfg=sourceConfig_(source);
  const c=cfg.cols;
  const rows=getPeriodRows_(source,year,month);

  const resultRows=[];
  rows.forEach(r=>{
    const flag=clean_(r[c.flag-1]);
    const code=clean_(r[c.commodityCode-1]);
    const name=clean_(r[c.commodityName-1]).toUpperCase();
    if(!(flag==="0" || code==="0" || name==="UMUM")) return;

    resultRows.push([
      clean_(r[c.cityCode-1]),
      clean_(r[c.cityName-1]),
      toNumber_(r[c.inflasiMtm-1]),
      toNumber_(r[c.inflasiYtd-1]),
      toNumber_(r[c.inflasiYoy-1])
    ]);
  });

  resultRows.sort((a,b)=>numericSort_(a[0],b[0]));

  const result={
    title:source==="asem"?"Inflasi Asem":"Inflasi Final",
    info:sourceLabel_(source)+" • Tahun "+year+" • Bulan "+month,
    columns:["Kode Kota","Nama Kota","Inflasi MtM","Inflasi YtD","Inflasi YoY"],
    rows:resultRows
  };

  cacheSmall_(key,result);
  return result;
}

function getCommodity_(p) {
  const source=String(p.source||"");
  const period=String(p.period||"").toLowerCase();
  const year=String(p.year||"");
  const month=String(p.month||"");
  const flag=String(p.flag||"");
  const mode=String(p.mode||"top10");

  if(!year||!month||flag==="") throw new Error("Tahun, bulan, dan flag harus dipilih.");

  const key=[CONFIG.CACHE_VERSION,"commodityAll",source,period,year,month,flag,mode].join(":");
  const cache=CacheService.getScriptCache();
  const cached=cache.get(key);
  if(cached) return JSON.parse(cached);

  const cfg=sourceConfig_(source);
  const c=cfg.cols;
  const metricCol=metricColumn_(c,period,"andil");
  const rows=getPeriodRows_(source,year,month);

  const cityMap={};

  rows.forEach(r=>{
    if(clean_(r[c.flag-1])!==flag) return;

    const cityCode=clean_(r[c.cityCode-1]);
    const cityName=clean_(r[c.cityName-1]);
    const code=clean_(r[c.commodityCode-1]);
    const name=clean_(r[c.commodityName-1]);
    const value=toNumber_(r[metricCol-1]);

    if(!cityCode||!code||!name||value===null) return;

    if(!cityMap[cityCode]) cityMap[cityCode]={code:cityCode,name:cityName,items:[]};
    cityMap[cityCode].items.push({code:code,name:name,value:value});
  });

  // Urutan prioritas sesuai permintaan.
  const preferred=["1902","1903","1906","1971","1900"];
  const allCodes=Object.keys(cityMap);
  const ordered=preferred.filter(x=>cityMap[x]);

  allCodes
    .filter(x=>preferred.indexOf(x)===-1)
    .sort(numericSort_)
    .forEach(x=>ordered.push(x));

  const cities=ordered.map(cityCode=>{
    const city=cityMap[cityCode];
    const lows=city.items.filter(x=>x.value<0).sort((a,b)=>a.value-b.value);
    const highs=city.items.filter(x=>x.value>0).sort((a,b)=>b.value-a.value);

    const lowFinal=mode==="threshold"?lows.filter(x=>x.value<=-0.01):lows.slice(0,10);
    const highFinal=mode==="threshold"?highs.filter(x=>x.value>=0.01):highs.slice(0,10);

    return {
      code:city.code,
      name:city.name,
      lowest:lowFinal.map((x,i)=>[i+1,x.code,x.name,x.value]),
      highest:highFinal.map((x,i)=>[i+1,x.code,x.name,x.value])
    };
  });

  const result={cities:cities};
  cacheSmall_(key,result);
  return result;
}

function metricColumn_(c,period,view){
  const prefix=view==="andil"?"andil":"inflasi";
  const suffix=period==="mtm"?"Mtm":period==="ytd"?"Ytd":period==="yoy"?"Yoy":"";
  const key=prefix+suffix;
  if(!suffix||!c[key]) throw new Error("Periode/metrik tidak valid.");
  return c[key];
}

function cacheSmall_(key,obj){
  try{
    const txt=JSON.stringify(obj);
    if(txt.length<95000) CacheService.getScriptCache().put(key,txt,CONFIG.DATA_CACHE_SECONDS);
  }catch(e){}
}

function getUpdatedAt_(){
  const raw=PropertiesService.getScriptProperties().getProperty("ASEM_UPDATED_AT")||"";
  return formatUpdatedAt_(raw);
}
function setUpdatedAt_(value,token){
  validateToken_(token);
  value=String(value||"").trim();
  if(!value) throw new Error("Tanggal dan jam belum diisi.");
  PropertiesService.getScriptProperties().setProperty("ASEM_UPDATED_AT",value);
  return formatUpdatedAt_(value);
}
function formatUpdatedAt_(raw){
  if(!raw) return {display:"Belum diatur",inputValue:""};
  const d=new Date(raw);
  if(isNaN(d.getTime())) return {display:raw,inputValue:raw};
  const tz=Session.getScriptTimeZone()||"Asia/Jakarta";
  return {
    display:Utilities.formatDate(d,tz,"dd MMMM yyyy, HH:mm")+" WIB",
    inputValue:Utilities.formatDate(d,tz,"yyyy-MM-dd'T'HH:mm")
  };
}

function clearCache_(token){
  validateToken_(token);
  // CacheService tidak menyediakan clear-all; ubah CACHE_VERSION jika ingin reset menyeluruh.
  return {message:"Cache akan kedaluwarsa otomatis."};
}

function sourceLabel_(source){return source==="asem"?"Angka Sementara":"Angka Final Inflasi";}
function labelView_(view,period){
  const p=period==="mtm"?"MtM":period==="ytd"?"YtD":"YoY";
  return (view==="andil"?"Andil ":"Inflasi ")+p;
}
function clean_(v){return v===null||v===undefined?"":String(v).trim();}
function toNumber_(v){
  if(v===null||v===undefined||v==="") return null;
  let s=String(v).trim();
  if(s.indexOf(",")>=0) s=s.replace(/\./g,"").replace(",",".");
  const n=Number(s);
  return isNaN(n)?null:n;
}
function numericSort_(a,b){
  const na=Number(a),nb=Number(b);
  if(!isNaN(na)&&!isNaN(nb)) return na-nb;
  return String(a).localeCompare(String(b),"id");
}