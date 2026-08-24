const CONFIG = {
  SPREADSHEET_ID: "1i-bg6Jd2bNiJhwB90UjrJZs_wSaUEenYydTcLgOKnNI",
  SHEET_ASEM: "asem",
  SHEET_FINAL: "angka final inflasi",
  USERNAME: "harga1900",
  PASSWORD: "harga1900",

  // Metadata filter disimpan 6 jam.
  FILTER_CACHE_SECONDS: 21600,
  INDEX_CACHE_SECONDS: 21600,

  // Hasil tabel per kombinasi filter disimpan 10 menit.
  DATA_CACHE_SECONDS: 600,

  // Naikkan versi ini setiap struktur backend berubah agar cache lama tidak terbaca.
  CACHE_VERSION: "v10.33"
};

// Cache lokal selama SATU eksekusi Apps Script.
// Ini penting untuk bulk export: satu blok tahun-bulan hanya dibaca sekali,
// lalu dipakai ulang oleh 10 sheet workbook.
const REQUEST_PERIOD_ROWS_ = {};

const REQUEST_FILTERS_ = {};

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = String(p.action || "");

    let result;
    if (action === "login") result = login_(p.username, p.password);
    else if (action === "filters") result = getFilters_(p.source);
    else if (action === "table") result = getPivotTable_(p);
    else if (action === "headline") result = getHeadline_(p);
    else if (action === "headlineCompare") result = getHeadlineCompare_(p);
    else if (action === "commodity") result = getCommodity_(p);
    else if (action === "bulkExport") result = getBulkExport_(p);
    else if (action === "dashboardBootstrap") result = getDashboardBootstrap_(p);
    else if (action === "dashboardYear") result = getDashboardYear_(p);
    else if (action === "warmPeriod") result = warmPeriod_(p);
    else if (action === "getUpdatedAt") result = getUpdatedAt_();
    else if (action === "setUpdatedAt") result = setUpdatedAt_(p.value, p.token);
    else if (action === "clearCache") result = clearCache_(p.token);
    else if (action === "dashboardPing") result = {message:"Dashboard API aktif"};
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
function getPeriodIndex_(source){
  const cache=CacheService.getScriptCache(),key=CONFIG.CACHE_VERSION+":periodIndex:"+source,cached=cache.get(key);if(cached)return JSON.parse(cached);
  const sh=sheet_(source).sh,lastRow=sh.getLastRow();if(lastRow<2)return {};const ym=sh.getRange(2,1,lastRow-1,2).getDisplayValues(),index={};
  let ck=null,start=null,prev=null;const close=()=>{if(ck&&start!==null&&prev!==null){if(!index[ck])index[ck]=[];index[ck].push({start,count:prev-start+1});}};
  for(let i=0;i<ym.length;i++){const y=clean_(ym[i][0]),m=clean_(ym[i][1]),row=i+2,k=y&&m?y+"|"+m:"";if(k!==ck||(prev!==null&&row!==prev+1)){close();ck=k;start=k?row:null;}prev=row;}close();
  try{const txt=JSON.stringify(index);if(txt.length<95000)cache.put(key,txt,CONFIG.INDEX_CACHE_SECONDS);}catch(e){}return index;
}

function getPeriodRows_(source,year,month){
  const memoKey=String(source)+"|"+String(year)+"|"+String(month);
  if(Object.prototype.hasOwnProperty.call(REQUEST_PERIOD_ROWS_,memoKey)){
    return REQUEST_PERIOD_ROWS_[memoKey];
  }

  const cache=CacheService.getScriptCache(),
        key=CONFIG.CACHE_VERSION+":period:"+source+":"+year+":"+month,
        cached=cache.get(key);

  if(cached){
    const parsed=JSON.parse(cached);
    REQUEST_PERIOD_ROWS_[memoKey]=parsed;
    return parsed;
  }

  const obj=sheet_(source),
        segments=getPeriodIndex_(source)[String(year)+"|"+String(month)]||[];

  if(!segments.length){
    REQUEST_PERIOD_ROWS_[memoKey]=[];
    return [];
  }

  let rows=[];
  segments.forEach(seg=>{
    rows=rows.concat(
      obj.sh.getRange(seg.start,1,seg.count,obj.cfg.lastCol).getDisplayValues()
    );
  });

  REQUEST_PERIOD_ROWS_[memoKey]=rows;

  try{
    const txt=JSON.stringify(rows);
    if(txt.length<95000){
      cache.put(key,txt,CONFIG.DATA_CACHE_SECONDS);
    }
  }catch(e){}

  return rows;
}

function getFilters_(source) {
  if (REQUEST_FILTERS_[source]) return REQUEST_FILTERS_[source];

  const cache = CacheService.getScriptCache();
  const key = CONFIG.CACHE_VERSION + ":filters:" + source;
  const cached = cache.get(key);
  if (cached) {
    const parsed = JSON.parse(cached);
    REQUEST_FILTERS_[source] = parsed;
    return parsed;
  }

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

  REQUEST_FILTERS_[source] = result;

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

  REQUEST_FILTERS_[source]=result;
  cacheSmall_(key,result);
  return result;
}



/* ==========================================================================
   V10.33 — STABLE DASHBOARD BACKEND
   Uses the same proven getFilters_ / period rows logic as normal menus.
   Dashboard remains STRICT Flag 0 through getHeadline_.
   ========================================================================== */

function dashboardYears_() {
  const f = getFilters_("final");
  return (f.years || []).slice();
}

function buildDashboardStablePayload_(year) {
  year = String(year || "");
  if (!year) throw new Error("Tahun Dashboard belum tersedia.");

  const cache = CacheService.getScriptCache();
  const key = CONFIG.CACHE_VERSION + ":dashboardStable:" + year;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const filters = getFilters_("final");
  const months = ((filters.monthsByYear || {})[year] || [])
    .slice()
    .sort(numericSort_);

  if (!months.length) {
    throw new Error("Bulan untuk tahun " + year + " tidak tersedia.");
  }

  function normCode_(v) {
    const x = clean_(v);
    return (x === "19" || x === "1900") ? "1900" : x;
  }

  const cityMap = {};
  (filters.cities || []).forEach(c => {
    const code = normCode_(c.code);
    if (code) cityMap[code] = c.name || code;
  });

  const monthRows = {};

  // getHeadline_ is already the same backend used by Inflasi Final/Asem.
  // It is strict Flag 0 in V10.30+.
  months.forEach(month => {
    const h = getHeadline_({
      source:"final",
      year:year,
      month:String(month)
    });

    monthRows[String(month)] = {};

    (h.rows || []).forEach(row => {
      const code = normCode_(row[0]);
      if (!code) return;

      if (!cityMap[code]) cityMap[code] = clean_(row[1]) || code;

      monthRows[String(month)][code] = {
        month:String(month),
        mtm:row[2],
        ytd:row[3],
        yoy:row[4]
      };
    });
  });

  const preferred = ["1900","1902","1903","1906","1971"];
  const codes = preferred.filter(code => cityMap[code]);

  Object.keys(cityMap)
    .filter(code => preferred.indexOf(code) === -1)
    .sort(numericSort_)
    .forEach(code => codes.push(code));

  const cities = codes.map(code => ({
    code:code,
    name:cityMap[code]
  }));

  const comparisonSeries = cities.map(city => ({
    code:city.code,
    name:city.name,
    series:months
      .filter(month => monthRows[String(month)] && monthRows[String(month)][city.code])
      .map(month => monthRows[String(month)][city.code])
  }));

  const result = {
    year:year,
    cities:cities,
    months:months.map(String),
    comparisonSeries:comparisonSeries
  };

  cacheSmall_(key, result);
  return result;
}

function getDashboardBootstrap_(p) {
  const filters = getFilters_("final");
  const years = (filters.years || []).slice();

  if (!years.length) {
    throw new Error("Data Angka Final belum tersedia.");
  }

  const requested = String((p && p.year) || "");
  const year = requested && years.indexOf(requested) >= 0
    ? requested
    : String(years[0]);

  return {
    years:years,
    ...buildDashboardStablePayload_(year)
  };
}

function getDashboardYear_(p) {
  const filters = getFilters_("final");
  const years = (filters.years || []).slice();
  const year = String((p && p.year) || "");

  if (!year || years.indexOf(year) === -1) {
    throw new Error("Tahun Dashboard tidak tersedia.");
  }

  return {
    years:years,
    ...buildDashboardStablePayload_(year)
  };
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

    // KHUSUS Inflasi Asem dan Inflasi Final:
    // headline wajib membaca Flag = 0.
    // Menu lainnya tetap menggunakan pilihan Flag masing-masing.
    if(flag!=="0") return;

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


function getHeadlineCompare_(p) {
  const asemYear=String(p.asemYear||"");
  const asemMonth=String(p.asemMonth||"");
  const finalYear=String(p.finalYear||"");
  const finalMonth=String(p.finalMonth||"");

  if(!asemYear||!asemMonth||!finalYear||!finalMonth){
    throw new Error("Periode angka sementara dan periode final pembanding harus dipilih.");
  }

  const key=[
    CONFIG.CACHE_VERSION,"headlineCompare",
    asemYear,asemMonth,finalYear,finalMonth
  ].join(":");

  const cache=CacheService.getScriptCache();
  const cached=cache.get(key);
  if(cached) return JSON.parse(cached);

  const asem=getHeadline_({source:"asem",year:asemYear,month:asemMonth});
  const fin=getHeadline_({source:"final",year:finalYear,month:finalMonth});

  function normCode_(code){
    code=clean_(code);
    return (code==="1900"||code==="19") ? "19" : code;
  }

  const map={};

  (fin.rows||[]).forEach(r=>{
    const k=normCode_(r[0]);
    if(!map[k]) map[k]={};
    map[k].code=k;
    map[k].finalName=r[1];
    map[k].final=[r[2],r[3],r[4]];
  });

  (asem.rows||[]).forEach(r=>{
    const k=normCode_(r[0]);
    if(!map[k]) map[k]={};
    map[k].code=k;
    map[k].asemName=r[1];
    map[k].asem=[r[2],r[3],r[4]];
  });

  const preferred=["1902","1903","1906","1971","19"];
  const keys=preferred.filter(k=>map[k]);
  Object.keys(map)
    .filter(k=>preferred.indexOf(k)===-1)
    .sort(numericSort_)
    .forEach(k=>keys.push(k));

  const rows=keys.map(k=>{
    const x=map[k];
    const f=x.final||[null,null,null];
    const a=x.asem||[null,null,null];
    return [
      x.code,
      x.asemName||x.finalName||"",
      f[0],f[1],f[2],
      a[0],a[1],a[2]
    ];
  });

  const result={
    title:"Inflasi Asem vs Inflasi Final",
    info:"Final "+finalYear+"-"+finalMonth+
      " • dibandingkan dengan Angka Sementara "+asemYear+"-"+asemMonth,
    finalPeriod:{year:finalYear,month:finalMonth},
    asemPeriod:{year:asemYear,month:asemMonth},
    columns:[
      "Kode Kota","Nama Kota",
      "Final MtM","Final YtD","Final YoY",
      "Sementara MtM","Sementara YtD","Sementara YoY"
    ],
    rows:rows
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

    const lowFinal =
      mode==="all" ? lows :
      mode==="threshold" ? lows.filter(x=>x.value<=-0.01) :
      lows.slice(0,10);

    const highFinal =
      mode==="all" ? highs :
      mode==="threshold" ? highs.filter(x=>x.value>=0.01) :
      highs.slice(0,10);

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


function flattenCommodityForBulk_(commodityResult){
  const rows=[];
  (commodityResult.cities||[]).forEach(city=>{
    (city.lowest||[]).forEach(r=>{
      rows.push([
        city.code,city.name,"Terendah",
        r[0],r[1],r[2],r[3]
      ]);
    });
    (city.highest||[]).forEach(r=>{
      rows.push([
        city.code,city.name,"Tertinggi",
        r[0],r[1],r[2],r[3]
      ]);
    });
  });

  return {
    columns:[
      "Kode Kota","Nama Kota","Kelompok","No",
      "Kode Komoditas","Nama Komoditas","Andil"
    ],
    rows:rows
  };
}

function sheetPayload_(name,result){
  return {
    name:name,
    title:result.title||name,
    info:result.info||"",
    columns:result.columns||[],
    rows:result.rows||[]
  };
}

function getBulkExport_(p){
  const source=String(p.source||"");
  const year=String(p.year||"");
  const month=String(p.month||"");
  const flag=String(p.flag||"");

  if(source!=="asem" && source!=="final"){
    throw new Error("Sumber bulk export tidak valid.");
  }
  if(!year||!month||flag===""){
    throw new Error("Tahun, bulan, dan flag harus dipilih.");
  }

  // Warm-up satu kali. Setelah ini semua fungsi lain memakai REQUEST_PERIOD_ROWS_.
  getPeriodRows_(source,year,month);

  const sheets=[];
  const periods=[
    {key:"mtm",label:"MtM"},
    {key:"ytd",label:"YtD"},
    {key:"yoy",label:"YoY"}
  ];

  periods.forEach(period=>{
    const inflasi=getPivotTable_({
      source:source,period:period.key,view:"inflasi",
      year:year,month:month,flag:flag
    });
    sheets.push(sheetPayload_(period.label+" - Inflasi",inflasi));

    const andil=getPivotTable_({
      source:source,period:period.key,view:"andil",
      year:year,month:month,flag:flag
    });
    sheets.push(sheetPayload_(period.label+" - Andil",andil));

    // Bulk berarti SEMUA komoditas positif/negatif, bukan hanya Top 10.
    const commodity=getCommodity_({
      source:source,period:period.key,
      year:year,month:month,flag:flag,mode:"all"
    });
    const flat=flattenCommodityForBulk_(commodity);
    sheets.push({
      name:period.label+" - Komoditas",
      title:"Komoditas Andil "+period.label,
      info:sourceLabel_(source)+" • Tahun "+year+" • Bulan "+month+" • Flag "+flag,
      columns:flat.columns,
      rows:flat.rows
    });
  });

  if(source==="asem"){
    const finalYear=String(p.finalYear||"");
    const finalMonth=String(p.finalMonth||"");

    if(finalYear && finalMonth){
      const cmp=getHeadlineCompare_({
        asemYear:year,asemMonth:month,
        finalYear:finalYear,finalMonth:finalMonth
      });
      sheets.push(sheetPayload_("Inflasi Asem",cmp));
    }else{
      const headline=getHeadline_({
        source:"asem",year:year,month:month
      });
      sheets.push(sheetPayload_("Inflasi Asem",headline));
    }
  }else{
    const headline=getHeadline_({
      source:"final",year:year,month:month
    });
    sheets.push(sheetPayload_("Inflasi Final",headline));
  }

  return {
    source:source,
    sourceLabel:sourceLabel_(source),
    year:year,
    month:month,
    flag:flag,
    sheets:sheets
  };
}


function warmPeriod_(p){
  const source=String(p.source||"");
  const year=String(p.year||"");
  const month=String(p.month||"");
  const flag=String(p.flag||"");

  if((source!=="asem" && source!=="final") || !year || !month || flag===""){
    return {warmed:false};
  }

  getPivotTable_({
    source:source,
    period:"mtm",
    view:"inflasi",
    year:year,
    month:month,
    flag:flag
  });

  return {warmed:true};
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