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
  CACHE_VERSION: "v10.26"
};

// Cache lokal selama SATU eksekusi Apps Script.
// Ini penting untuk bulk export: satu blok tahun-bulan hanya dibaca sekali,
// lalu dipakai ulang oleh 10 sheet workbook.
const REQUEST_PERIOD_ROWS_ = {};

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
  const cache=CacheService.getScriptCache();
  const key=CONFIG.CACHE_VERSION+":filters:"+source;
  const cached=cache.get(key);
  if(cached) return JSON.parse(cached);

  const obj=sheet_(source), sh=obj.sh, lastRow=sh.getLastRow();
  if(lastRow<2) return {years:[],flags:[],cities:[],monthsByYear:{}};

  // Years/months are already available in period index (A:B scan).
  // Dashboard warms this index first, so menu filter loading is usually cache-only.
  const periodIndex=getPeriodIndex_(source);
  const yearsMap={}, monthsByYear={};

  Object.keys(periodIndex).forEach(k=>{
    const parts=String(k).split("|");
    const y=parts[0], m=parts[1];
    if(!y) return;
    yearsMap[y]=true;
    if(!monthsByYear[y]) monthsByYear[y]={};
    if(m) monthsByYear[y][m]=true;
  });

  // Only C:D and G are still needed (3 columns instead of A:D + G = 5 columns).
  const cityMeta=sh.getRange(2,3,lastRow-1,2).getDisplayValues();
  const flagMeta=sh.getRange(2,7,lastRow-1,1).getDisplayValues();

  const citiesMap={}, flagsMap={};
  for(let i=0;i<cityMeta.length;i++){
    const code=clean_(cityMeta[i][0]);
    const name=clean_(cityMeta[i][1]);
    const flag=clean_(flagMeta[i] ? flagMeta[i][0] : "");
    if(code && !citiesMap[code]) citiesMap[code]=name;
    if(flag!=="") flagsMap[flag]=true;
  }

  const years=Object.keys(yearsMap).sort((a,b)=>Number(b)-Number(a));
  const resultMonths={};
  years.forEach(y=>{
    resultMonths[y]=Object.keys(monthsByYear[y]||{}).sort((a,b)=>Number(b)-Number(a));
  });

  const flags=Object.keys(flagsMap).sort(numericSort_);
  const preferred=["1902","1903","1906","1971","1900","19"];
  const cityCodes=preferred.filter((x,i)=>citiesMap[x] && preferred.indexOf(x)===i);
  Object.keys(citiesMap)
    .filter(x=>preferred.indexOf(x)===-1)
    .sort(numericSort_)
    .forEach(x=>cityCodes.push(x));

  const result={
    years:years,
    flags:flags,
    cities:cityCodes.map(code=>({code:code,name:citiesMap[code]})),
    monthsByYear:resultMonths
  };

  cacheSmall_(key,result);
  return result;
}


function warmPeriod_(p){
  const source=String(p.source||"");
  const year=String(p.year||"");
  const month=String(p.month||"");
  const flag=String(p.flag||"");

  if((source!=="asem" && source!=="final") || !year || !month || flag===""){
    return {warmed:false};
  }

  // One cheap pivot request warms:
  // - period rows cache
  // - pivot result cache
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