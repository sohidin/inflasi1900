// ===========================================================================
// CONFIG
// ===========================================================================
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbzg4v77Qj_rxaZBaqFLzUNc69l8-gSEx2CwwYmUCOiPeEBpt5j_rlA6E7Z6-ZUaFDZK/exec"
};

// ===========================================================================
// STATE
// ===========================================================================
const state = {
  source: "asem",
  period: "mtm",
  view: "inflasi",
  filters: null,
  mainDt: null,
  commodityData: null,
  filterCache: {},
  responseCache: new Map(),
  updatedAtCache: null,
  finalFilterCache: null,
  comparisonData: null,
  finalHeadlineData: null,
  dashboardData: null,
  dashboardFilterCache: null,
  dashboardYearCache: new Map(),
  dashboardSelectedCity: "1900",
  _prefetchStarted: false,
  _viewCache: new Map(),
  _viewInflight: new Map(),
  _lastViewKey: "",
  pageLength: Number(localStorage.getItem("inflasi_page_length") || 25),

  // [OPT-1] Prefetch queue — menyimpan permintaan filter/data yang sedang berjalan
  // agar tidak ada 2 fetch identik sekaligus.
  _inflightKeys: new Map(),
  _stickyHeaderBound: false,
  _stickyHeaderRaf: 0,
};

// ===========================================================================
// API
// ===========================================================================
const Api = {
  async request(params = {}) {
    if (
      !CONFIG.API_URL ||
      CONFIG.API_URL.includes("PASTE_APPS_SCRIPT_WEB_APP_URL_HERE") ||
      !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(CONFIG.API_URL)
    ) {
      throw new Error("URL Apps Script belum valid di script.js");
    }
    const url = new URL(CONFIG.API_URL);
    for (const [k, v] of Object.entries(params)) {
      if (v !== "" && v !== undefined && v !== null) url.searchParams.set(k, v);
    }

    let res;
    try {
      // [OPT-2] Pakai default cache browser untuk GET sederhana;
      // hanya no-store untuk request yang butuh data terbaru.
      res = await fetch(url.toString(), { cache: "no-store" });
    } catch {
      throw new Error("Tidak dapat terhubung ke Apps Script. Periksa deployment Web App dan koneksi internet.");
    }

    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error("Respons Apps Script tidak valid. Pastikan deployment menggunakan Web App dan aksesnya diizinkan.");
    }

    if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}.`);
    if (!json.ok) throw new Error(json.message || "Terjadi kesalahan.");
    return json;
  }
};

// ===========================================================================
// CACHE HELPER
// [OPT-3] In-flight deduplication: bila ada 2 menu yang meminta data sama
// secara bersamaan, hanya 1 fetch yang dikirim ke server.
// ===========================================================================
function cacheKey(prefix, obj) {
  const ordered = Object.keys(obj || {}).sort().reduce((a, k) => (a[k] = obj[k], a), {});
  return prefix + ":" + JSON.stringify(ordered);
}

async function cachedApi(prefix, params, ttlMs = 120000) {
  const key = cacheKey(prefix, params);
  const now = Date.now();
  const hit = state.responseCache.get(key);
  if (hit && now - hit.time < ttlMs) return hit.data;

  // Deduplicate concurrent identical requests
  if (state._inflightKeys.has(key)) return state._inflightKeys.get(key);

  const promise = Api.request(params).then(data => {
    state.responseCache.set(key, { time: Date.now(), data });
    state._inflightKeys.delete(key);
    return data;
  }).catch(err => {
    state._inflightKeys.delete(key);
    throw err;
  });

  state._inflightKeys.set(key, promise);
  return promise;
}


// ===========================================================================
// PERSISTENT FRONTEND CACHE (stale-while-revalidate)
// ===========================================================================
const LOCAL_CACHE_VERSION="10.31";
const LOCAL_TTL={
  dashboard:12*60*60*1000,
  filters:12*60*60*1000
};

function localCacheKey(name){return `inflasi_${LOCAL_CACHE_VERSION}_${name}`;}

function localCacheGet(name,ttl){
  try{
    const raw=localStorage.getItem(localCacheKey(name));
    if(!raw) return null;
    const obj=JSON.parse(raw);
    if(!obj || !obj.time) return null;
    if(Date.now()-obj.time>ttl) return null;
    return obj.data;
  }catch(_){return null;}
}

function localCacheSet(name,data){
  try{
    localStorage.setItem(
      localCacheKey(name),
      JSON.stringify({time:Date.now(),data})
    );
  }catch(_){}
}

// ===========================================================================
// INIT
// ===========================================================================
document.addEventListener("DOMContentLoaded", () => {
  bindLogin();
  bindAccordion();
  bindAppEvents();

  if (sessionStorage.getItem("inflasi_token")) {
    showApp();
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("appPage").classList.add("hidden");
}

async function showApp() {
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("appPage").classList.remove("hidden");

  state.view = "dashboard";
  state.source = "final";
  document.querySelectorAll("[data-view]").forEach(x => x.classList.remove("active"));
  document.getElementById("dashboardMenuBtn")?.classList.add("active");

  // Dashboard memakai endpoint ringkas sendiri; tabel besar tidak dimuat saat login.
  await loadDashboard();
}

// ===========================================================================
// LOGIN
// ===========================================================================
function bindLogin() {
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("loginMessage");
    msg.textContent = "Memeriksa...";
    try {
      const r = await Api.request({
        action: "login",
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value
      });
      sessionStorage.setItem("inflasi_token", r.token);
      msg.textContent = "";
      await showApp();
    } catch (err) { msg.textContent = err.message; }
  });
}

// ===========================================================================
// SIDEBAR ACCORDION
// ===========================================================================
function bindAccordion() {
  // [OPT-5] Gunakan event delegation pada container, bukan listener per-button.
  const menuRoot = document.querySelector(".menu-root");
  if (!menuRoot) return;

  menuRoot.addEventListener("click", e => {
    const dashboardBtn = e.target.closest("#dashboardMenuBtn");
    if (dashboardBtn) {
      document.querySelectorAll("[data-view]").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".submenu").forEach(x => x.classList.remove("open"));
      document.querySelectorAll(".menu-main").forEach(x => x.classList.remove("open"));
      dashboardBtn.classList.add("active");
      state.view = "dashboard";
      state.source = "final";
      loadDashboard();
      return;
    }

    // ---- menu-main (level 1) ----
    const menuBtn = e.target.closest(".menu-main");
    if (menuBtn) {
      const id = menuBtn.dataset.menu;
      const sub = document.getElementById("submenu-" + id);
      const willOpen = !sub.classList.contains("open");
      document.querySelectorAll(".submenu").forEach(x => x.classList.remove("open"));
      document.querySelectorAll(".menu-main").forEach(x => x.classList.remove("open"));
      if (willOpen) { sub.classList.add("open"); menuBtn.classList.add("open"); }
      return;
    }

    // ---- submenu-parent (level 2) ----
    const subParent = e.target.closest(".submenu-parent");
    if (subParent) {
      const target = document.getElementById(subParent.dataset.group);
      const parent = subParent.closest(".submenu");
      parent.querySelectorAll(".submenu-level2").forEach(x => { if (x !== target) x.classList.remove("open"); });
      parent.querySelectorAll(".submenu-parent").forEach(x => { if (x !== subParent) x.classList.remove("open"); });
      target.classList.toggle("open");
      subParent.classList.toggle("open");
      return;
    }

    // ---- leaf button (data-view) ----
    const leafBtn = e.target.closest("[data-view]");
    if (leafBtn && menuRoot.contains(leafBtn)) {
      handleLeafClick(leafBtn);
    }
  });
}

async function handleLeafClick(btn) {
  state._lastViewKey="";
  document.getElementById("dashboardMenuBtn")?.classList.remove("active");
  document.querySelectorAll("[data-view]").forEach(x => x.classList.remove("active"));
  btn.classList.add("active");

  const previousSource = state.source;
  state.source = btn.dataset.source;
  state.period = btn.dataset.period || "";
  state.view = btn.dataset.view;

  if (previousSource !== state.source || !state.filterCache[state.source]) {
    await loadSourceFilters();
  } else {
    state.filters = state.filterCache[state.source];
    hydrateFilterControlsFromState();
  }

  if(state.source==="asem" && !state.updatedAtCache){
    loadUpdatedAt().catch(()=>{});
  }

  await loadCurrentView();
}

// ===========================================================================
// APP EVENTS
// ===========================================================================
function bindAppEvents() {
  document.getElementById("applyFilterBtn").addEventListener("click", async () => {
    state._lastViewKey="";
    if (state.source === "asem" && state.view === "headline") {
      await ensureFinalComparisonFilters();
    }
    await loadCurrentView();
  });

  document.getElementById("filterYear").addEventListener("change", updateMonths);
  document.getElementById("compareFinalYear")?.addEventListener("change", updateCompareFinalMonths);

  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.clear();
    showLogin();
  });

  document.getElementById("spreadsheetBtn")?.addEventListener("click", () => {
    window.open("https://docs.google.com/spreadsheets/d/1i-bg6Jd2bNiJhwB90UjrJZs_wSaUEenYydTcLgOKnNI/edit", "_blank");
  });

  document.getElementById("editUpdatedAtBtn").addEventListener("click", () => {
    document.getElementById("updatedAtModal").classList.remove("hidden");
  });
  document.getElementById("cancelUpdatedAtBtn").addEventListener("click", () => {
    document.getElementById("updatedAtModal").classList.add("hidden");
  });
  document.getElementById("saveUpdatedAtBtn").addEventListener("click", saveUpdatedAt);

  document.getElementById("downloadCommodityImage").addEventListener("click", downloadCommodityPageImage);
  document.getElementById("downloadCommodityPdf").addEventListener("click", downloadCommodityPagePdf);
  document.getElementById("downloadCommodityExcel").addEventListener("click", downloadCommodityWorkbook);
  document.getElementById("downloadCommodityCsv").addEventListener("click", downloadCommodityCsv);

  document.getElementById("commodityGlobalSearch")?.addEventListener("input", applyCommodityGlobalSearch);
  document.getElementById("clearCommoditySearch")?.addEventListener("click", () => {
    const el = document.getElementById("commodityGlobalSearch");
    if (el) { el.value = ""; applyCommodityGlobalSearch(); el.focus(); }
  });

  document.getElementById("downloadAllAsemBtn")?.addEventListener("click", () => {
    downloadAllMainMenu("asem");
  });
  document.getElementById("downloadAllFinalBtn")?.addEventListener("click", () => {
    downloadAllMainMenu("final");
  });

  document.getElementById("dashboardYear")?.addEventListener("change", () => {
    loadDashboardYear(valueOf("dashboardYear"));
  });
  document.getElementById("dashboardCity")?.addEventListener("change", () => {
    state.dashboardSelectedCity=valueOf("dashboardCity")||"1900";
    renderDashboardFromYearData();
  });

  document.getElementById("downloadDashboardImage")?.addEventListener("click", downloadDashboardImage);
  document.getElementById("downloadDashboardPdf")?.addEventListener("click", downloadDashboardPdf);
  document.getElementById("downloadDashboardExcel")?.addEventListener("click", downloadDashboardExcel);

  document.querySelectorAll("[data-compare-export]").forEach(btn => {
    btn.addEventListener("click", () => {
      const metric=btn.dataset.metric;
      const type=btn.dataset.compareExport;
      if(type==="image") downloadComparisonChartImage(metric);
      else if(type==="pdf") downloadComparisonChartPdf(metric);
      else if(type==="excel") downloadComparisonChartExcel(metric);
    });
  });

  document.addEventListener("click", e => {
    if(!e.target.closest(".chart-interactive-point")){
      hideChartTooltip();
    }
  });
}


// ===========================================================================
// BULK EXCEL — SELURUH MENU UTAMA
// ===========================================================================
async function getBulkFilterSelection(source){
  let filters=state.filterCache[source];

  if(!filters){
    filters=await cachedApi(
      "filters",
      {action:"filters",source},
      10*60*1000
    );
    state.filterCache[source]=filters;
  }

  const currentYear=valueOf("filterYear");
  const currentMonth=valueOf("filterMonth");
  const currentFlag=valueOf("filterFlag");

  const years=(filters.years||[]).map(String);
  const year=years.includes(String(currentYear))
    ? String(currentYear)
    : String(years[0]||"");

  const months=(filters.monthsByYear?.[year]||[]).map(String);
  const month=months.includes(String(currentMonth))
    ? String(currentMonth)
    : String(months[0]||"");

  const flags=(filters.flags||[]).map(String);
  const flag=flags.includes(String(currentFlag))
    ? String(currentFlag)
    : String(flags[0]??"");

  return {year,month,flag};
}

async function resolveBulkFinalComparison(asemYear,asemMonth){
  // Jika dropdown pembanding sudah pernah diinisialisasi, hormati pilihan user.
  const selectedYear=valueOf("compareFinalYear");
  const selectedMonth=valueOf("compareFinalMonth");

  if(selectedYear && selectedMonth){
    return {finalYear:selectedYear,finalMonth:selectedMonth};
  }

  if(!state.finalFilterCache){
    state.finalFilterCache=await cachedApi(
      "filters",
      {action:"filters",source:"final"},
      10*60*1000
    );
  }

  const f=state.finalFilterCache;
  let targetYear=Number(asemYear);
  let targetMonth=Number(asemMonth)-1;

  if(targetMonth<1){
    targetMonth=12;
    targetYear-=1;
  }

  const years=(f.years||[]).map(String);
  let finalYear=years.includes(String(targetYear))
    ? String(targetYear)
    : (years.includes(String(asemYear)) ? String(asemYear) : String(years[0]||""));

  const months=(f.monthsByYear?.[finalYear]||[]).map(String);
  let finalMonth=months.includes(String(targetMonth))
    ? String(targetMonth)
    : (months.includes(String(asemMonth)) ? String(asemMonth) : String(months[0]||""));

  return {finalYear,finalMonth};
}

function excelColumnWidth(rows,colIndex,header){
  let max=String(header||"").length;
  const sampleLimit=Math.min(rows.length,250);
  for(let i=0;i<sampleLimit;i++){
    const value=rows[i]?.[colIndex];
    const len=String(value??"").length;
    if(len>max) max=len;
  }
  return Math.min(Math.max(max+2,10),42);
}

function addBulkSheetToWorkbook(wb,sheetData,meta){
  const headerRow=9;
  const rows=sheetData.rows||[];
  const columns=sheetData.columns||[];

  const aoa=[
    ["DASHBOARD INFLASI 1900"],
    ["Sumber",meta.sourceLabel],
    ["Menu",sheetData.title||sheetData.name],
    ["Tahun",meta.year],
    ["Bulan",meta.month],
    ["Flag",meta.flag],
    ["Tanggal Download",meta.dateText],
    ["Jam Download",meta.timeText],
    columns,
    ...rows
  ];

  const ws=XLSX.utils.aoa_to_sheet(aoa);

  // Lebar kolom adaptif, tetapi dibatasi agar file tetap ringan.
  ws["!cols"]=columns.map((c,i)=>({
    wch:excelColumnWidth(rows,i,c)
  }));

  if(columns.length && rows.length){
    const lastCol=XLSX.utils.encode_col(columns.length-1);
    ws["!autofilter"]={ref:`A${headerRow}:${lastCol}${headerRow+rows.length}`};
  }

  // Format angka menjadi dua desimal pada area data.
  const range=XLSX.utils.decode_range(ws["!ref"]||"A1:A1");
  for(let r=headerRow;r<=range.e.r;r++){
    for(let c=0;c<=range.e.c;c++){
      const addr=XLSX.utils.encode_cell({r,c});
      const cell=ws[addr];
      if(cell && cell.t==="n"){
        cell.z="0.00";
      }
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    safeBulkSheetName(sheetData.name)
  );
}

function safeBulkSheetName(name){
  return String(name||"Sheet")
    .replace(/[\\/?*\[\]:]/g,"-")
    .substring(0,31);
}

async function downloadAllMainMenu(source){
  const btn=document.getElementById(
    source==="asem" ? "downloadAllAsemBtn" : "downloadAllFinalBtn"
  );
  if(!btn) return;

  const originalHtml=btn.innerHTML;
  btn.disabled=true;
  btn.classList.add("is-loading");
  btn.innerHTML=`
    <span class="bulk-download-icon">⌛</span>
    <span><strong>Menyiapkan Excel...</strong><small>Mohon tunggu</small></span>`;

  try{
    const selection=await getBulkFilterSelection(source);

    if(!selection.year || !selection.month || selection.flag===""){
      throw new Error("Filter tahun, bulan, atau flag tidak tersedia.");
    }

    const params={
      action:"bulkExport",
      source,
      year:selection.year,
      month:selection.month,
      flag:selection.flag
    };

    if(source==="asem"){
      Object.assign(
        params,
        await resolveBulkFinalComparison(selection.year,selection.month)
      );
    }

    // Sengaja tidak masuk responseCache browser:
    // payload bulk besar dan hanya dibutuhkan saat user menekan tombol download.
    const payload=await Api.request(params);

    if(!payload.sheets || !payload.sheets.length){
      throw new Error("Tidak ada data untuk dibuat menjadi workbook.");
    }

    const meta=getDownloadMeta();
    const wb=XLSX.utils.book_new();

    payload.sheets.forEach(sheetData=>{
      addBulkSheetToWorkbook(wb,sheetData,{
        sourceLabel:payload.sourceLabel,
        year:payload.year,
        month:payload.month,
        flag:payload.flag,
        dateText:meta.dateText,
        timeText:meta.timeText
      });
    });

    const label=source==="asem"
      ? "Angka-Sementara-Semua-Menu"
      : "Angka-Final-Inflasi-Semua-Menu";

    XLSX.writeFile(
      wb,
      safeName(`${label}-${payload.year}-${payload.month}-${meta.fileStamp}`)+".xlsx"
    );
  }catch(err){
    showError(err.message||String(err));
  }finally{
    btn.disabled=false;
    btn.classList.remove("is-loading");
    btn.innerHTML=originalHtml;
  }
}


// ===========================================================================
// DASHBOARD
// ===========================================================================
const DASH_MONTHS = {
  "1":"Jan","2":"Feb","3":"Mar","4":"Apr","5":"Mei","6":"Jun",
  "7":"Jul","8":"Agu","9":"Sep","10":"Okt","11":"Nov","12":"Des"
};

function setDashboardLayout(active) {
  document.getElementById("dashboardSection")?.classList.toggle("hidden", !active);
  document.getElementById("statsStrip")?.classList.toggle("hidden", active);
  document.getElementById("filterCard")?.classList.toggle("hidden", active);

  if (active) {
    cleanupStandardTableUi();
    document.getElementById("standardTableSection")?.classList.add("hidden");
    document.getElementById("commoditySection")?.classList.add("hidden");
    document.getElementById("updateCard")?.classList.add("hidden");
    document.getElementById("pageTitle").textContent = "Dashboard";
    document.getElementById("pageSubtitle").textContent =
      "Ringkasan dan series Inflasi Final Bangka Belitung";
  } else {
    document.getElementById("standardTableSection")?.classList.remove("hidden");
  }
}

function setDashboardFastStatus(text,loading=false){
  const box=document.getElementById("dashboardFastStatus");
  if(!box) return;
  box.classList.toggle("is-loading",!!loading);
  const t=box.querySelector("span:last-child");
  if(t) t.textContent=text;
}

function dashboardCityOptions(data){
  return (data?.cities||[]).map(c=>({value:String(c.code),label:`${c.code} - ${c.name}`}));
}

function hydrateDashboardControls(data,years){
  const y=document.getElementById("dashboardYear"), c=document.getElementById("dashboardCity");
  if(!y||!c) return;

  const oldYear=y.value;
  fillSelect("dashboardYear",years||[]);
  const target=String(data?.year||oldYear||(years||[])[0]||"");
  if([...y.options].some(o=>o.value===target)) y.value=target;

  const oldCity=state.dashboardSelectedCity||c.value||"1900";
  fillSelect("dashboardCity",dashboardCityOptions(data));
  const values=[...c.options].map(o=>o.value);
  c.value=values.includes(oldCity)?oldCity:(values.includes("1900")?"1900":(values[0]||""));
  state.dashboardSelectedCity=c.value;
}

function selectedCityFromYear(data){
  const code=state.dashboardSelectedCity||valueOf("dashboardCity")||"1900";
  return (data?.comparisonSeries||[]).find(x=>String(x.code)===String(code))
    ||(data?.comparisonSeries||[])[0]
    ||{code:"",name:"",series:[]};
}

function makeDashboardData(data){
  const selected=selectedCityFromYear(data);
  const series=selected.series||[];
  const latest=series.length?series[series.length-1]:null;
  const previous=series.length>1?series[series.length-2]:null;

  const summary=metric=>{
    const vals=series.filter(x=>Number.isFinite(Number(x[metric]))).map(x=>({month:x.month,value:Number(x[metric])}));
    if(!vals.length) return {max:null,min:null,maxMonth:"",minMonth:""};
    let max=vals[0],min=vals[0];
    vals.forEach(x=>{if(x.value>max.value)max=x;if(x.value<min.value)min=x;});
    return {max:max.value,min:min.value,maxMonth:max.month,minMonth:min.month};
  };

  return {
    year:data.year,years:data.years||[],
    cityCode:selected.code,cityName:selected.name,
    cities:data.cities||[],series,
    comparisonSeries:data.comparisonSeries||[],
    latest,previous,
    mtmSummary:summary("mtm"),ytdSummary:summary("ytd"),yoySummary:summary("yoy")
  };
}

async function loadDashboard(){
  state.view="dashboard";state.source="final";
  setDashboardLayout(true);clearError();

  // 1) Paint immediately from local cache if available.
  const persisted=localCacheGet("dashboard_bootstrap",LOCAL_TTL.dashboard);
  if(persisted?.year && persisted?.comparisonSeries){
    const data={
      year:persisted.year,
      years:persisted.years||[],
      cities:persisted.cities||[],
      months:persisted.months||[],
      comparisonSeries:persisted.comparisonSeries||[]
    };
    state.dashboardYearCache.set(String(data.year),data);
    hydrateDashboardControls(data,data.years||[]);
    renderDashboardFromYearData();
    setDashboardFastStatus("Cache siap");
  }else{
    setDashboardFastStatus("Memuat data terbaru…",true);
  }

  // 2) Revalidate in background/current request.
  try{
    const r=await cachedApi("dashboardBootstrap",{action:"dashboardBootstrap"},30*60*1000);
    const data={
      year:r.year,years:r.years||[],cities:r.cities||[],
      months:r.months||[],comparisonSeries:r.comparisonSeries||[]
    };

    state.dashboardYearCache.set(String(r.year),data);
    localCacheSet("dashboard_bootstrap",data);

    // Don't unexpectedly change a year the user already selected.
    const currentYear=valueOf("dashboardYear");
    if(!currentYear || currentYear===String(r.year)){
      hydrateDashboardControls(data,r.years||[]);
      renderDashboardFromYearData();
    }else{
      // Refresh only years options while preserving selection.
      const y=document.getElementById("dashboardYear");
      if(y){
        const keep=y.value;
        fillSelect("dashboardYear",r.years||[]);
        if([...y.options].some(o=>o.value===keep)) y.value=keep;
      }
    }

    setDashboardFastStatus("Siap");
    startBackgroundPrefetch();
  }catch(err){
    if(!persisted){
      setDashboardFastStatus("Gagal memuat");
      showError("Dashboard: " + (err.message||String(err)));
    }else{
      setDashboardFastStatus("Cache aktif");
      startBackgroundPrefetch();
    }
  }
}

async function loadDashboardYear(year){
  year=String(year||"");
  if(!year) return;

  // Memory cache = instant.
  if(state.dashboardYearCache.has(year)){
    const data=state.dashboardYearCache.get(year);
    hydrateDashboardControls(data,data.years||[]);
    renderDashboardFromYearData();
    setDashboardFastStatus("Siap");
    return;
  }

  // Persistent browser cache = near instant after page reload.
  const persisted=localCacheGet(`dashboard_year_${year}`,LOCAL_TTL.dashboard);
  if(persisted?.comparisonSeries){
    state.dashboardYearCache.set(year,persisted);
    hydrateDashboardControls(persisted,persisted.years||[]);
    renderDashboardFromYearData();
    setDashboardFastStatus("Cache siap");
  }else{
    setDashboardFastStatus(`Memuat ${year}…`,true);
  }

  try{
    const r=await cachedApi("dashboardYear",{action:"dashboardYear",year},30*60*1000);
    const data={
      year:r.year,years:r.years||[],cities:r.cities||[],
      months:r.months||[],comparisonSeries:r.comparisonSeries||[]
    };
    state.dashboardYearCache.set(year,data);
    localCacheSet(`dashboard_year_${year}`,data);

    // Only repaint if user is still on this requested year.
    if(valueOf("dashboardYear")===year){
      hydrateDashboardControls(data,r.years||[]);
      renderDashboardFromYearData();
    }
    setDashboardFastStatus("Siap");
  }catch(err){
    if(!persisted){
      setDashboardFastStatus("Gagal memuat");
      showError("Dashboard: " + (err.message||String(err)));
    }else{
      setDashboardFastStatus("Cache aktif");
    }
  }
}

function renderDashboardFromYearData(){
  const year=String(valueOf("dashboardYear")||"");
  const data=state.dashboardYearCache.get(year);
  if(!data) return;

  state.dashboardSelectedCity=valueOf("dashboardCity")||state.dashboardSelectedCity||"1900";
  state.dashboardData=makeDashboardData(data);

  renderDashboard(state.dashboardData);
  renderComparisonDashboard(data.comparisonSeries||[],data.year);
}

function startBackgroundPrefetch(){
  if(state._prefetchStarted) return;
  state._prefetchStarted=true;

  const task=async()=>{
    try{
      // Seed memory cache instantly from localStorage.
      ["asem","final"].forEach(source=>{
        const local=localCacheGet(`filters_${source}`,LOCAL_TTL.filters);
        if(local){
          state.filterCache[source]=local;
          if(source==="final") state.finalFilterCache=local;
        }
      });

      // Revalidate both filter sets in parallel.
      const [a,f]=await Promise.all([
        cachedApi("filters",{action:"filters",source:"asem"},20*60*1000),
        cachedApi("filters",{action:"filters",source:"final"},20*60*1000)
      ]);

      state.filterCache.asem=a;
      state.filterCache.final=f;
      state.finalFilterCache=f;
      localCacheSet("filters_asem",a);
      localCacheSet("filters_final",f);

      // Warm latest-period server cache for both main data sources.
      const warmFor=async(source,filters)=>{
        const year=String((filters.years||[])[0]||"");
        const month=String(((filters.monthsByYear||{})[year]||[])[0]||"");
        const preferredFlag=(filters.flags||[]).includes("3")
          ? "3"
          : String((filters.flags||[])[0]??"");
        if(!year||!month||preferredFlag==="") return;

        try{
          await Api.request({
            action:"warmPeriod",
            source,year,month,flag:preferredFlag
          });
        }catch(_){}
      };

      // Run warmups without blocking anything user-visible.
      Promise.all([
        warmFor("asem",a),
        warmFor("final",f)
      ]).catch(()=>{});

      prefetchLikelyCurrentView();

    }catch(_){}

    try{await loadUpdatedAt();}catch(_){}
  };

  if("requestIdleCallback" in window){
    requestIdleCallback(()=>task(),{timeout:1200});
  }else{
    setTimeout(()=>task(),300);
  }
}

function dashboardNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function dashboardSigned(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const prefix = n > 0 ? "+" : "";
  return prefix + n.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function monthLabel(m, year="") {
  return `${DASH_MONTHS[String(m)] || m}${year ? " " + year : ""}`;
}

function renderDashboard(r) {
  const latest = r.latest || {};
  const previous = r.previous || {};
  const hasLatest = latest.month !== undefined;

  document.getElementById("dashLatestPeriod").textContent =
    hasLatest ? monthLabel(latest.month,r.year) : "-";
  document.getElementById("dashCityLabel").textContent =
    `${r.cityCode} • ${r.cityName}`;

  document.getElementById("dashLatestMtm").textContent = dashboardNumber(latest.mtm);
  document.getElementById("dashLatestYtd").textContent = dashboardNumber(latest.ytd);
  document.getElementById("dashLatestYoy").textContent = dashboardNumber(latest.yoy);

  const delta = Number(latest.mtm) - Number(previous.mtm);
  document.getElementById("dashMtmDelta").textContent =
    Number.isFinite(delta) ? dashboardSigned(delta) : "-";

  const ms = r.mtmSummary || {};
  const ys = r.ytdSummary || {};
  const yos = r.yoySummary || {};

  document.getElementById("dashMaxMtm").textContent = dashboardNumber(ms.max);
  document.getElementById("dashMaxMtmMonth").textContent =
    ms.maxMonth ? monthLabel(ms.maxMonth,r.year) : "-";
  document.getElementById("dashMinMtm").textContent = dashboardNumber(ms.min);
  document.getElementById("dashMinMtmMonth").textContent =
    ms.minMonth ? monthLabel(ms.minMonth,r.year) : "-";

  document.getElementById("dashMaxYtd").textContent = dashboardNumber(ys.max);
  document.getElementById("dashMaxYtdMonth").textContent =
    ys.maxMonth ? monthLabel(ys.maxMonth,r.year) : "-";
  document.getElementById("dashMinYtd").textContent = dashboardNumber(ys.min);
  document.getElementById("dashMinYtdMonth").textContent =
    ys.minMonth ? monthLabel(ys.minMonth,r.year) : "-";

  document.getElementById("dashMaxYoy").textContent = dashboardNumber(yos.max);
  document.getElementById("dashMaxYoyMonth").textContent =
    yos.maxMonth ? monthLabel(yos.maxMonth,r.year) : "-";
  document.getElementById("dashMinYoy").textContent = dashboardNumber(yos.min);
  document.getElementById("dashMinYoyMonth").textContent =
    yos.minMonth ? monthLabel(yos.minMonth,r.year) : "-";

  document.getElementById("dashboardChartSubtitle").textContent =
    `${r.cityCode} • ${r.cityName} • Tahun ${r.year}`;

  drawFinalSeriesChart(r.series || [], r.year, r.cityCode, r.cityName);
}

function svgNode(tag, attrs={}, text="") {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,String(v)));
  if (text !== "") el.textContent = text;
  return el;
}

function drawFinalSeriesChart(series, year, cityCode, cityName) {
  const svg = document.getElementById("finalSeriesChart");
  if (!svg) return;
  svg.innerHTML = "";

  const W=1100, H=430;
  const margin={left:72,right:32,top:28,bottom:58};
  const pw=W-margin.left-margin.right;
  const ph=H-margin.top-margin.bottom;

  const metrics = [
    {key:"mtm", label:"MtM", color:"#078bd3"},
    {key:"ytd", label:"YtD", color:"#08a685"},
    {key:"yoy", label:"YoY", color:"#7657d6"}
  ];

  const allVals=[];
  (series||[]).forEach(d=>{
    metrics.forEach(m=>{
      const n=Number(d[m.key]);
      if(Number.isFinite(n)) allVals.push(n);
    });
  });

  if(!series.length || !allVals.length){
    svg.appendChild(svgNode("text",{
      x:W/2,y:H/2,"text-anchor":"middle",
      fill:"#70869a","font-size":"18","font-weight":"700"
    },"Data series belum tersedia"));
    return;
  }

  let min=Math.min(...allVals), max=Math.max(...allVals);
  if(min===max){ min-=1; max+=1; }
  const pad=Math.max((max-min)*0.12,0.25);
  min-=pad; max+=pad;

  const x=i => margin.left + (series.length===1 ? pw/2 : (i/(series.length-1))*pw);
  const y=v => margin.top + ((max-v)/(max-min))*ph;

  // plot background
  svg.appendChild(svgNode("rect",{
    x:margin.left,y:margin.top,width:pw,height:ph,
    rx:14,fill:"#fbfdff"
  }));

  // horizontal grid + labels
  const ticks=5;
  for(let i=0;i<=ticks;i++){
    const value=max-(i/ticks)*(max-min);
    const yy=y(value);
    svg.appendChild(svgNode("line",{
      x1:margin.left,y1:yy,x2:W-margin.right,y2:yy,
      stroke:"#dce8f0","stroke-width":"1"
    }));
    svg.appendChild(svgNode("text",{
      x:margin.left-12,y:yy+4,"text-anchor":"end",
      fill:"#71879a","font-size":"12","font-weight":"650"
    },dashboardNumber(value)));
  }

  // zero line
  if(min<=0 && max>=0){
    const zy=y(0);
    svg.appendChild(svgNode("line",{
      x1:margin.left,y1:zy,x2:W-margin.right,y2:zy,
      stroke:"#8aa3b6","stroke-width":"1.5","stroke-dasharray":"5 5"
    }));
  }

  // x labels
  series.forEach((d,i)=>{
    svg.appendChild(svgNode("text",{
      x:x(i),y:H-27,"text-anchor":"middle",
      fill:"#587085","font-size":"12","font-weight":"750"
    },DASH_MONTHS[String(d.month)]||String(d.month)));
  });

  // lines and points
  metrics.forEach(metric=>{
    const valid=series.map((d,i)=>({
      i, value:Number(d[metric.key]), month:d.month
    })).filter(p=>Number.isFinite(p.value));

    if(!valid.length) return;

    const points=valid.map(p=>`${x(p.i)},${y(p.value)}`).join(" ");
    svg.appendChild(svgNode("polyline",{
      points,fill:"none",stroke:metric.color,
      "stroke-width":"3.4","stroke-linecap":"round","stroke-linejoin":"round"
    }));

    valid.forEach(p=>{
      const circle=svgNode("circle",{
        cx:x(p.i),cy:y(p.value),r:6,
        fill:"#fff",stroke:metric.color,"stroke-width":"3",
        class:"chart-interactive-point",
        tabindex:"0",
        "data-tooltip-metric":metric.label,
        "data-tooltip-value":dashboardNumber(p.value),
        "data-tooltip-period":monthLabel(p.month,year),
        "data-tooltip-city":`${cityCode} - ${cityName}`
      });
      bindChartPointTooltip(circle);
      svg.appendChild(circle);
    });
  });
}


function showChartTooltip(point, evt=null) {
  const tooltip=document.getElementById("chartTooltip");
  if(!tooltip || !point) return;

  tooltip.innerHTML=`
    <div class="tooltip-metric">${escapeHtml(point.dataset.tooltipMetric || "")}</div>
    <div class="tooltip-value">${escapeHtml(point.dataset.tooltipValue || "-")}</div>
    <div class="tooltip-meta">${escapeHtml(point.dataset.tooltipPeriod || "")}</div>
    <div class="tooltip-city">${escapeHtml(point.dataset.tooltipCity || "")}</div>`;

  tooltip.classList.remove("hidden");

  const rect=point.getBoundingClientRect();
  const tipRect=tooltip.getBoundingClientRect();
  const x=(evt?.clientX ?? (rect.left+rect.width/2));
  const y=(evt?.clientY ?? rect.top);

  let left=x+14;
  let top=y-tipRect.height-12;

  if(left+tipRect.width>window.innerWidth-12) left=x-tipRect.width-14;
  if(top<8) top=y+18;

  tooltip.style.left=left+"px";
  tooltip.style.top=top+"px";
}

function hideChartTooltip() {
  document.getElementById("chartTooltip")?.classList.add("hidden");
}

function bindChartPointTooltip(point) {
  point.addEventListener("mouseenter",e=>showChartTooltip(point,e));
  point.addEventListener("mousemove",e=>showChartTooltip(point,e));
  point.addEventListener("mouseleave",hideChartTooltip);
  point.addEventListener("focus",()=>showChartTooltip(point));
  point.addEventListener("blur",hideChartTooltip);
  point.addEventListener("click",e=>{
    e.stopPropagation();
    showChartTooltip(point,e);
  });
}

const DASH_CITY_COLORS = [
  "#0b86cf","#08a685","#7657d6","#ef7b45","#d2a20f",
  "#d84c8a","#3e8f67","#5b6fd5"
];

function renderComparisonDashboard(citySeries, year) {
  const metrics=["mtm","ytd","yoy"];
  metrics.forEach(metric=>{
    drawCityComparisonChart(
      document.getElementById(`comparison${metric.charAt(0).toUpperCase()+metric.slice(1)}Chart`),
      citySeries,
      year,
      metric
    );
    renderComparisonLegend(
      document.getElementById(`comparison${metric.charAt(0).toUpperCase()+metric.slice(1)}Legend`),
      citySeries
    );
  });
}

function renderComparisonLegend(el, citySeries) {
  if(!el) return;
  el.innerHTML=(citySeries||[]).map((city,i)=>`
    <span>
      <i class="comparison-legend-line" style="background:${DASH_CITY_COLORS[i % DASH_CITY_COLORS.length]}"></i>
      ${escapeHtml(city.code)} - ${escapeHtml(city.name)}
    </span>
  `).join("");
}

function drawCityComparisonChart(svg, citySeries, year, metric) {
  if(!svg) return;
  svg.innerHTML="";

  const W=1100,H=390;
  const margin={left:68,right:32,top:22,bottom:52};
  const pw=W-margin.left-margin.right;
  const ph=H-margin.top-margin.bottom;

  const allPoints=[];
  const monthsSet=new Set();

  (citySeries||[]).forEach((city,ci)=>{
    (city.series||[]).forEach(d=>{
      monthsSet.add(String(d.month));
      const n=Number(d[metric]);
      if(Number.isFinite(n)){
        allPoints.push({
          cityIndex:ci,city,
          month:String(d.month),value:n
        });
      }
    });
  });

  const months=[...monthsSet].sort((a,b)=>Number(a)-Number(b));

  if(!allPoints.length || !months.length){
    svg.appendChild(svgNode("text",{
      x:W/2,y:H/2,"text-anchor":"middle",
      fill:"#70869a","font-size":"17","font-weight":"700"
    },"Data perbandingan belum tersedia"));
    return;
  }

  let min=Math.min(...allPoints.map(p=>p.value));
  let max=Math.max(...allPoints.map(p=>p.value));
  if(min===max){min-=1;max+=1;}
  const pad=Math.max((max-min)*0.12,0.2);
  min-=pad;max+=pad;

  const xForMonth=month=>{
    const idx=months.indexOf(String(month));
    return margin.left+(months.length===1?pw/2:(idx/(months.length-1))*pw);
  };
  const y=v=>margin.top+((max-v)/(max-min))*ph;

  svg.appendChild(svgNode("rect",{
    x:margin.left,y:margin.top,width:pw,height:ph,
    rx:12,fill:"#fbfdff"
  }));

  for(let i=0;i<=5;i++){
    const val=max-(i/5)*(max-min);
    const yy=y(val);
    svg.appendChild(svgNode("line",{
      x1:margin.left,y1:yy,x2:W-margin.right,y2:yy,
      stroke:"#dde9f0","stroke-width":"1"
    }));
    svg.appendChild(svgNode("text",{
      x:margin.left-10,y:yy+4,"text-anchor":"end",
      fill:"#71879a","font-size":"11.5","font-weight":"650"
    },dashboardNumber(val)));
  }

  if(min<=0 && max>=0){
    const zy=y(0);
    svg.appendChild(svgNode("line",{
      x1:margin.left,y1:zy,x2:W-margin.right,y2:zy,
      stroke:"#8fa7b9","stroke-width":"1.5","stroke-dasharray":"5 5"
    }));
  }

  months.forEach(month=>{
    svg.appendChild(svgNode("text",{
      x:xForMonth(month),y:H-23,"text-anchor":"middle",
      fill:"#587085","font-size":"11.5","font-weight":"750"
    },DASH_MONTHS[month]||month));
  });

  (citySeries||[]).forEach((city,ci)=>{
    const color=DASH_CITY_COLORS[ci % DASH_CITY_COLORS.length];
    const pts=(city.series||[])
      .map(d=>({month:String(d.month),value:Number(d[metric])}))
      .filter(p=>Number.isFinite(p.value))
      .sort((a,b)=>Number(a.month)-Number(b.month));

    if(!pts.length) return;

    svg.appendChild(svgNode("polyline",{
      points:pts.map(p=>`${xForMonth(p.month)},${y(p.value)}`).join(" "),
      fill:"none",stroke:color,"stroke-width":"2.6",
      "stroke-linecap":"round","stroke-linejoin":"round",
      opacity:"0.92"
    }));

    pts.forEach(p=>{
      const circle=svgNode("circle",{
        cx:xForMonth(p.month),cy:y(p.value),r:5.4,
        fill:"#fff",stroke:color,"stroke-width":"2.7",
        class:"chart-interactive-point",
        tabindex:"0",
        "data-tooltip-metric":metric.toUpperCase(),
        "data-tooltip-value":dashboardNumber(p.value),
        "data-tooltip-period":monthLabel(p.month,year),
        "data-tooltip-city":`${city.code} - ${city.name}`
      });
      bindChartPointTooltip(circle);
      svg.appendChild(circle);
    });
  });
}

function comparisonMetricLabel(metric) {
  return ({mtm:"MtM",ytd:"YtD",yoy:"YoY"})[metric] || metric;
}

function comparisonCardForMetric(metric) {
  const id=metric.charAt(0).toUpperCase()+metric.slice(1);
  return document.getElementById(`comparison${id}Card`);
}

async function comparisonChartCanvas(metric) {
  const card=comparisonCardForMetric(metric);
  if(!card) throw new Error("Grafik perbandingan belum tersedia.");

  const clone=card.cloneNode(true);
  clone.id=`comparison${metric}ExportClone`;
  clone.classList.add("comparison-chart-export-clone");
  clone.querySelector(".comparison-download-actions")?.remove();

  clone.style.position="fixed";
  clone.style.left="-20000px";
  clone.style.top="0";
  clone.style.width="1350px";
  clone.style.maxWidth="1350px";
  clone.style.background="#fff";
  clone.style.padding="22px";

  document.body.appendChild(clone);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
    return await html2canvas(clone,{
      backgroundColor:"#fff",
      scale:1.3,
      useCORS:true,
      logging:false,
      width:clone.scrollWidth,
      height:clone.scrollHeight,
      windowWidth:1450,
      windowHeight:clone.scrollHeight+70
    });
  }finally{
    clone.remove();
  }
}

function comparisonExportName(metric,ext) {
  const r=state.dashboardData||{};
  const meta=getDownloadMeta();
  return safeName(
    `Perbandingan-${comparisonMetricLabel(metric)}-Antar-Wilayah-${r.year||"tahun"}-${meta.fileStamp}`
  )+"."+ext;
}

async function downloadComparisonChartImage(metric) {
  try{
    const canvas=await comparisonChartCanvas(metric);
    const a=document.createElement("a");
    a.download=comparisonExportName(metric,"png");
    a.href=canvas.toDataURL("image/png");
    a.click();
  }catch(err){showError(err.message||String(err));}
}

async function downloadComparisonChartPdf(metric) {
  try{
    const canvas=await comparisonChartCanvas(metric);
    const pageW=841.89,pageH=595.28,margin=22;
    const usableW=pageW-margin*2,usableH=pageH-margin*2;
    let width=usableW;
    let height=width*(canvas.height/canvas.width);
    if(height>usableH){
      const scale=usableH/height;
      height*=scale;width*=scale;
    }
    pdfMake.createPdf({
      pageSize:"A4",
      pageOrientation:"landscape",
      pageMargins:[margin,margin,margin,margin],
      content:[{image:canvas.toDataURL("image/png"),width,alignment:"center"}],
      info:{title:`Perbandingan ${comparisonMetricLabel(metric)} Antar Wilayah`}
    }).download(comparisonExportName(metric,"pdf"));
  }catch(err){showError(err.message||String(err));}
}

function downloadComparisonChartExcel(metric) {
  const r=state.dashboardData;
  if(!r || !r.comparisonSeries) return showError("Data perbandingan belum tersedia.");

  const months=[...new Set(
    r.comparisonSeries.flatMap(c=>(c.series||[]).map(d=>String(d.month)))
  )].sort((a,b)=>Number(a)-Number(b));

  const header=["Bulan",...r.comparisonSeries.map(c=>`${c.code} - ${c.name}`)];
  const rows=months.map(month=>[
    monthLabel(month),
    ...r.comparisonSeries.map(city=>{
      const point=(city.series||[]).find(d=>String(d.month)===String(month));
      return point ? round2(point[metric]) : "";
    })
  ]);

  const meta=getDownloadMeta();
  const aoa=[
    [`PERBANDINGAN ${comparisonMetricLabel(metric).toUpperCase()} ANTAR WILAYAH`],
    ["Tahun",r.year],
    ["Tanggal Download",meta.dateText],
    ["Jam Download",meta.timeText],
    [],
    header,
    ...rows
  ];

  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"]=[
    {wch:14},
    ...r.comparisonSeries.map(()=>({wch:27}))
  ];

  const range=XLSX.utils.decode_range(ws["!ref"]||"A1:A1");
  for(let rr=6;rr<=range.e.r;rr++){
    for(let cc=1;cc<=range.e.c;cc++){
      const cell=ws[XLSX.utils.encode_cell({r:rr,c:cc})];
      if(cell && cell.t==="n") cell.z="0.00";
    }
  }

  XLSX.utils.book_append_sheet(
    wb,ws,`Perbandingan ${comparisonMetricLabel(metric)}`
  );
  XLSX.writeFile(wb,comparisonExportName(metric,"xlsx"));
}

function dashboardExportName(ext) {
  const r = state.dashboardData || {};
  const meta=getDownloadMeta();
  return safeName(
    `Series Inflasi Final-${r.cityCode || "wilayah"}-${r.year || "tahun"}-${meta.fileStamp}`
  ) + "." + ext;
}

async function dashboardChartCanvas() {
  const card=document.getElementById("dashboardChartCard");
  if(!card) throw new Error("Grafik dashboard belum tersedia.");

  const clone=card.cloneNode(true);
  clone.id="dashboardChartExportClone";
  clone.classList.add("dashboard-chart-export-clone");
  clone.querySelector(".dashboard-chart-actions")?.remove();

  clone.style.position="fixed";
  clone.style.left="-20000px";
  clone.style.top="0";
  clone.style.width="1350px";
  clone.style.maxWidth="1350px";
  clone.style.background="#fff";
  clone.style.padding="24px";

  document.body.appendChild(clone);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

  try{
    return await html2canvas(clone,{
      backgroundColor:"#ffffff",
      scale:1.35,
      useCORS:true,
      logging:false,
      width:clone.scrollWidth,
      height:clone.scrollHeight,
      windowWidth:1450,
      windowHeight:clone.scrollHeight+80
    });
  }finally{
    clone.remove();
  }
}

async function downloadDashboardImage() {
  try{
    const canvas=await dashboardChartCanvas();
    const a=document.createElement("a");
    a.download=dashboardExportName("png");
    a.href=canvas.toDataURL("image/png");
    a.click();
  }catch(err){ showError(err.message||String(err)); }
}

async function downloadDashboardPdf() {
  try{
    const canvas=await dashboardChartCanvas();
    const pageW=841.89,pageH=595.28,margin=24;
    const usableW=pageW-margin*2,usableH=pageH-margin*2;
    let width=usableW;
    let height=width*(canvas.height/canvas.width);
    if(height>usableH){
      const scale=usableH/height;
      height*=scale; width*=scale;
    }
    pdfMake.createPdf({
      pageSize:"A4",
      pageOrientation:"landscape",
      pageMargins:[margin,margin,margin,margin],
      content:[{image:canvas.toDataURL("image/png"),width,alignment:"center"}],
      info:{title:"Series Inflasi Final"}
    }).download(dashboardExportName("pdf"));
  }catch(err){ showError(err.message||String(err)); }
}

function downloadDashboardExcel() {
  const r=state.dashboardData;
  if(!r || !r.series) return showError("Data dashboard belum tersedia.");

  const meta=getDownloadMeta();
  const rows=[
    ["SERIES INFLASI FINAL"],
    ["Wilayah",`${r.cityCode} - ${r.cityName}`],
    ["Tahun",r.year],
    ["Tanggal Download",meta.dateText],
    ["Jam Download",meta.timeText],
    [],
    ["Bulan","MtM","YtD","YoY"],
    ...r.series.map(x=>[
      monthLabel(x.month),
      round2(x.mtm),round2(x.ytd),round2(x.yoy)
    ])
  ];

  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"]=[{wch:18},{wch:14},{wch:14},{wch:14}];

  // Format data series menjadi dua desimal.
  const ref=XLSX.utils.decode_range(ws["!ref"]||"A1:A1");
  for(let rr=7;rr<=ref.e.r;rr++){
    for(let cc=1;cc<=3;cc++){
      const cell=ws[XLSX.utils.encode_cell({r:rr,c:cc})];
      if(cell && cell.t==="n") cell.z="0.00";
    }
  }

  XLSX.utils.book_append_sheet(wb,ws,"Series Final");
  XLSX.writeFile(wb,dashboardExportName("xlsx"));
}

// ===========================================================================
// FILTER
// ===========================================================================
async function loadSourceFilters() {
  clearError();

  if(state.filterCache[state.source]){
    state.filters=state.filterCache[state.source];
    hydrateFilterControlsFromState();
    return;
  }

  const persisted=localCacheGet(`filters_${state.source}`,LOCAL_TTL.filters);
  if(persisted){
    state.filterCache[state.source]=persisted;
    state.filters=persisted;
    hydrateFilterControlsFromState();

    // Revalidate non-blocking.
    cachedApi("filters",{action:"filters",source:state.source},20*60*1000)
      .then(f=>{
        state.filterCache[state.source]=f;
        localCacheSet(`filters_${state.source}`,f);
      })
      .catch(()=>{});
    return;
  }

  try{
    state.filters=await cachedApi(
      "filters",
      {action:"filters",source:state.source},
      20*60*1000
    );
    state.filterCache[state.source]=state.filters;
    localCacheSet(`filters_${state.source}`,state.filters);
    hydrateFilterControlsFromState();
  }catch(err){
    showError(err.message);
    throw err;
  }
}

function hydrateFilterControlsFromState() {
  if (!state.filters) return;
  fillSelect("filterYear", state.filters.years);
  updateMonths();
  fillSelect("filterFlag", state.filters.flags);
}

function updateMonths() {
  if (!state.filters) return;
  const y = valueOf("filterYear") || state.filters.years[0];
  fillSelect("filterMonth", state.filters.monthsByYear[String(y)] || []);
}

// [OPT-6] fillSelect dibuat lebih efisien: build fragment sekali, replace innerHTML sekali.
function fillSelect(id, items) {
  const el = document.getElementById(id);
  const old = el.value;
  const frag = document.createDocumentFragment();
  (items || []).forEach(item => {
    const opt = document.createElement("option");
    if (typeof item === "object") { opt.value = item.value; opt.textContent = item.label; }
    else { opt.value = item; opt.textContent = item; }
    frag.appendChild(opt);
  });
  el.innerHTML = "";
  el.appendChild(frag);
  if (old && [...el.options].some(o => String(o.value) === String(old))) el.value = old;
}

function valueOf(id) { return document.getElementById(id)?.value || ""; }

// ===========================================================================
// FINAL COMPARISON FILTERS
// ===========================================================================
async function ensureFinalComparisonFilters() {
  if (state.finalFilterCache) { hydrateFinalComparisonFilters(); return; }
  state.finalFilterCache = await cachedApi("filters", { action: "filters", source: "final" }, 10 * 60 * 1000);
  hydrateFinalComparisonFilters();
}

function hydrateFinalComparisonFilters() {
  const f = state.finalFilterCache;
  if (!f) return;
  const yearEl = document.getElementById("compareFinalYear");
  const monthEl = document.getElementById("compareFinalMonth");
  if (!yearEl || !monthEl) return;

  const oldYear = yearEl.value;
  const oldMonth = monthEl.value;

  fillSelect("compareFinalYear", f.years);

  const asemYear = Number(valueOf("filterYear"));
  const asemMonth = Number(valueOf("filterMonth"));
  let defaultYear = asemYear;
  let defaultMonth = asemMonth - 1;
  if (defaultMonth < 1) { defaultMonth = 12; defaultYear = asemYear - 1; }

  if (oldYear && [...yearEl.options].some(o => o.value === oldYear)) yearEl.value = oldYear;
  else if ([...yearEl.options].some(o => o.value === String(defaultYear))) yearEl.value = String(defaultYear);

  updateCompareFinalMonths();

  if (oldMonth && [...monthEl.options].some(o => o.value === oldMonth)) monthEl.value = oldMonth;
  else if ([...monthEl.options].some(o => o.value === String(defaultMonth))) monthEl.value = String(defaultMonth);
}

function updateCompareFinalMonths() {
  const f = state.finalFilterCache;
  if (!f) return;
  const year = valueOf("compareFinalYear");
  const old = valueOf("compareFinalMonth");
  fillSelect("compareFinalMonth", f.monthsByYear[String(year)] || []);
  if (old && [...document.getElementById("compareFinalMonth").options].some(o => o.value === old)) {
    document.getElementById("compareFinalMonth").value = old;
  }
}


function stableViewKey(action,args){
  const keys=Object.keys(args||{}).sort();
  return [action,...keys.map(k=>`${k}=${String(args[k]??"")}`)].join("|");
}

async function cachedViewRequest(action,args,ttl=10*60*1000){
  const key=stableViewKey(action,args);

  // Memory cache first
  const hit=state._viewCache.get(key);
  if(hit && Date.now()-hit.time<ttl){
    return hit.data;
  }

  // Deduplicate simultaneous requests
  if(state._viewInflight.has(key)){
    return state._viewInflight.get(key);
  }

  const promise=cachedApi(action,args,ttl)
    .then(data=>{
      state._viewCache.set(key,{time:Date.now(),data});
      state._viewInflight.delete(key);
      return data;
    })
    .catch(err=>{
      state._viewInflight.delete(key);
      throw err;
    });

  state._viewInflight.set(key,promise);
  return promise;
}

function prefetchLikelyCurrentView(){
  // Warm the most likely first table after dashboard is visible.
  const source="final";
  const f=state.filterCache[source];
  if(!f) return;

  const year=String((f.years||[])[0]||"");
  const month=String(((f.monthsByYear||{})[year]||[])[0]||"");
  const flag=(f.flags||[]).includes("3")?"3":String((f.flags||[])[0]||"");

  if(!year||!month||flag==="") return;

  const args={
    action:"table",
    source,
    period:"mtm",
    view:"inflasi",
    year,
    month,
    flag
  };

  cachedViewRequest("table",args,15*60*1000).catch(()=>{});
}

// ===========================================================================
// LOAD VIEW
// ===========================================================================
async function loadCurrentView() {
  updateUI();
  clearError();
  let loadingTimer=setTimeout(()=>showLoading(true),260);

  const args = {
    source: state.source,
    period: state.period,
    year: valueOf("filterYear"),
    month: valueOf("filterMonth"),
    // Khusus Inflasi Asem / Inflasi Final: Flag selalu 0.
    // Semua menu lain tetap menggunakan dropdown Flag.
    flag: state.view === "headline" ? "0" : valueOf("filterFlag")
  };
  const currentViewKey=stableViewKey(state.view,args);
  if(state._lastViewKey===currentViewKey && state.view!=="komoditas"){
    clearTimeout(loadingTimer);
    showLoading(false);
    return;
  }


  try {
    let r;
    if (state.view === "headline" && state.source === "asem") {
      await ensureFinalComparisonFilters();
      r = await cachedViewRequest("headlineCompare", {
        action: "headlineCompare",
        asemYear: valueOf("filterYear"),
        asemMonth: valueOf("filterMonth"),
        finalYear: valueOf("compareFinalYear"),
        finalMonth: valueOf("compareFinalMonth")
      }, 15*60*1000);
      state.comparisonData = r;
      renderComparisonTable(r);
      state._lastViewKey=currentViewKey;
    } else if (state.view === "headline") {
      r = await cachedViewRequest("headline", { action: "headline", ...args }, 15*60*1000);
      state.comparisonData = null;
      state.finalHeadlineData = r;
      renderFinalHeadlineTable(r);
      state._lastViewKey=currentViewKey;
    } else if (state.view === "komoditas") {
      r = await cachedViewRequest("commodity", { action: "commodity", ...args, mode: valueOf("commodityMode") }, 15*60*1000);
      renderCommodity(r);
      state._lastViewKey=currentViewKey+"|mode="+valueOf("commodityMode");
    } else {
      r = await cachedViewRequest("table", { action: "table", view: state.view, ...args }, 15*60*1000);
      renderStandard(r);
    }
    state._lastViewKey=currentViewKey;
  } catch (err) { showError(err.message); }
  finally {
    clearTimeout(loadingTimer);
    showLoading(false);
  }
}

// ===========================================================================
// UI HELPERS
// ===========================================================================

function updateHeadlineFlagUi(){
  const isHeadline = state.view === "headline";

  document.getElementById("filterFlagItem")
    ?.classList.toggle("headline-flag-hidden", isHeadline);

  document.getElementById("statFlagCard")
    ?.classList.toggle("headline-flag-hidden", isHeadline);
}

function updateUI() {
  updateHeadlineFlagUi();
  if(state.view === "dashboard"){
    setDashboardLayout(true);
    return;
  }

  setDashboardLayout(false);
  const title = viewTitle();
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = state.source === "asem" ? "Angka Sementara" : "Angka Final Inflasi";
  document.getElementById("updateCard").classList.toggle("hidden", state.source !== "asem");

  const commodity = state.view === "komoditas";
  document.querySelectorAll(".komoditas-only").forEach(x => x.style.display = commodity ? "" : "none");

  const asemHeadline = state.source === "asem" && state.view === "headline";
  document.getElementById("headlineCompareFilters")?.classList.toggle("hidden", !asemHeadline);
  document.getElementById("standardTableSection")?.classList.toggle("headline-comparison", false);

  document.getElementById("statSource").textContent = state.source === "asem" ? "Angka Sementara" : "Angka Final";
  document.getElementById("statYear").textContent = valueOf("filterYear") || "-";
  document.getElementById("statMonth").textContent = valueOf("filterMonth") || "-";
  document.getElementById("statFlag").textContent = state.view==="headline" ? "0" : (valueOf("filterFlag") || "-");
}

function viewTitle() {
  if (state.view === "headline") return state.source === "asem" ? "Inflasi Asem" : "Inflasi Final";
  const p = { mtm: "MtM", ytd: "YtD", yoy: "YoY" }[state.period] || "";
  if (state.view === "komoditas") return `Komoditas Andil ${p}`;
  return `${state.view === "andil" ? "Andil" : "Inflasi"} ${p}`;
}

// ===========================================================================
// CLEANUP STANDARD TABLE
// ===========================================================================

function refreshRobustStickyHeader() {
  state._stickyHeaderRaf = 0;

  const wrapper = document.querySelector("#standardTableSection #mainTable_wrapper");
  if (!wrapper) return;

  const scrollHead = wrapper.querySelector(".dataTables_scrollHead");
  const scrollBody = wrapper.querySelector(".dataTables_scrollBody");
  if (!scrollHead || !scrollBody) return;

  const headHeight = Math.ceil(scrollHead.getBoundingClientRect().height || scrollHead.offsetHeight || 0);
  const wrapperRect = wrapper.getBoundingClientRect();
  const bodyRect = scrollBody.getBoundingClientRect();

  // Header fixed only while user is inside this table.
  const shouldFix =
    wrapperRect.top <= 0 &&
    bodyRect.bottom > headHeight + 4;

  if (shouldFix) {
    const currentBodyRect = scrollBody.getBoundingClientRect();

    scrollHead.classList.add("is-fixed-table-head");
    scrollHead.style.position = "fixed";
    scrollHead.style.top = "0px";
    scrollHead.style.left = currentBodyRect.left + "px";
    scrollHead.style.width = currentBodyRect.width + "px";
    scrollHead.style.zIndex = "999";
    scrollHead.style.margin = "0";

    // Prevent layout jump when the header leaves normal document flow.
    scrollBody.style.marginTop = headHeight + "px";
  } else {
    scrollHead.classList.remove("is-fixed-table-head");
    scrollHead.style.position = "";
    scrollHead.style.top = "";
    scrollHead.style.left = "";
    scrollHead.style.width = "";
    scrollHead.style.zIndex = "";
    scrollHead.style.margin = "";
    scrollBody.style.marginTop = "";
  }
}

function scheduleRobustStickyHeader() {
  if (state._stickyHeaderRaf) return;
  state._stickyHeaderRaf = requestAnimationFrame(refreshRobustStickyHeader);
}

function setupRobustStickyHeader() {
  const wrapper = document.querySelector("#standardTableSection #mainTable_wrapper");
  if (!wrapper) return;

  wrapper.classList.add("sticky-enabled-table");

  // Bind to window only once. The handler always looks up the CURRENT table,
  // so it remains valid after menu changes / DataTables rebuilds.
  if (!state._stickyHeaderBound) {
    window.addEventListener("scroll", scheduleRobustStickyHeader, { passive: true });
    window.addEventListener("resize", scheduleRobustStickyHeader, { passive: true });
    state._stickyHeaderBound = true;
  }

  const scrollBody = wrapper.querySelector(".dataTables_scrollBody");
  if (scrollBody) {
    // DataTables already synchronises horizontal scroll; this call just
    // repositions the fixed container if its geometry changes.
    scrollBody.addEventListener("scroll", scheduleRobustStickyHeader, { passive: true });
  }

  requestAnimationFrame(refreshRobustStickyHeader);
}

function teardownRobustStickyHeader() {
  const wrapper = document.querySelector("#standardTableSection #mainTable_wrapper");
  if (!wrapper) return;

  const head = wrapper.querySelector(".dataTables_scrollHead");
  const body = wrapper.querySelector(".dataTables_scrollBody");

  if (head) {
    head.classList.remove("is-fixed-table-head");
    head.style.position = "";
    head.style.top = "";
    head.style.left = "";
    head.style.width = "";
    head.style.zIndex = "";
    head.style.margin = "";
  }
  if (body) body.style.marginTop = "";
}

function cleanupStandardTableUi() {
  teardownRobustStickyHeader();
  const comparisonToolbar = document.getElementById("comparisonToolbar");
  if (comparisonToolbar) {
    comparisonToolbar.classList.add("hidden");
    const q = comparisonToolbar.querySelector("#comparisonSearchInput");
    if (q) q.value = "";
  }

  const finalToolbar = document.getElementById("finalHeadlineToolbar");
  if (finalToolbar) {
    finalToolbar.classList.add("hidden");
    const fq = finalToolbar.querySelector("#finalHeadlineSearchInput");
    if (fq) fq.value = "";
  }

  try {
    if (state.mainDt) {
      state.mainDt.destroy();
      state.mainDt = null;
    } else if ($.fn.dataTable && $.fn.dataTable.isDataTable("#mainTable")) {
      $("#mainTable").DataTable().destroy();
    }
  } catch (_) { state.mainDt = null; }

  const table = document.getElementById("mainTable");
  const wrapper = document.getElementById("mainTable_wrapper");
  const tableWrap = document.querySelector("#standardTableSection .table-wrap");
  if (wrapper && table && tableWrap) { tableWrap.appendChild(table); wrapper.remove(); }

  document.querySelectorAll("#standardTableSection .dataTables_wrapper").forEach(w => {
    if (w.id !== "mainTable_wrapper") w.remove();
  });

  if (table) { table.removeAttribute("style"); table.style.width = "100%"; }
}

// ===========================================================================
// HIGHLIGHT HELPERS
// ===========================================================================
// [OPT-7] Hitung min/max pakai loop biasa, bukan spread Math.min/max (lebih
// cepat untuk array besar dan tidak overflow call-stack).
function getColumnExtremes(rows, startIndex, count) {
  const out = [];
  for (let j = 0; j < count; j++) {
    let min = Infinity, max = -Infinity, hasVal = false;
    for (const row of (rows || [])) {
      const v = Number(row[startIndex + j]);
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
      hasVal = true;
    }
    out.push(hasVal ? { min, max, same: min === max } : { min: null, max: null, same: true });
  }
  return out;
}

// [OPT-8] Cache formatter agar tidak membuat objek options tiap sel.
const _numFmt = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmt2(n) { return _numFmt.format(n); }

function formatHighlightedMetric(v, extreme) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return escapeHtml(v);
  let rankClass = "";
  if (extreme && !extreme.same) {
    if (n === extreme.max) rankClass = "metric-high";
    else if (n === extreme.min) rankClass = "metric-low";
  }
  return `<span class="metric-value ${rankClass}">${fmt2(n)}</span>`;
}

// ===========================================================================
// RENDER — FINAL HEADLINE
// ===========================================================================
function renderFinalHeadlineTable(r) {
  document.getElementById("standardTableSection").classList.remove("hidden");
  document.getElementById("commoditySection").classList.add("hidden");
  cleanupStandardTableUi();

  document.getElementById("tableTitle").textContent = "Inflasi Final";
  document.getElementById("tableInfo").textContent =
    `Angka Final • Tahun ${valueOf("filterYear")} • Bulan ${valueOf("filterMonth")}`;

  const table = document.getElementById("mainTable");
  table.className = "final-native-table";

  const finalExtremes = getColumnExtremes(r.rows || [], 2, 3);

  // [OPT-9] Build table innerHTML dengan array join, bukan string concatenation += per baris.
  const bodyRows = (r.rows || []).map(row =>
    `<tr>
      <td class="final-code">${escapeHtml(row[0])}</td>
      <td class="final-name">${escapeHtml(row[1])}</td>
      <td class="final-num">${formatHighlightedMetric(row[2], finalExtremes[0])}</td>
      <td class="final-num">${formatHighlightedMetric(row[3], finalExtremes[1])}</td>
      <td class="final-num">${formatHighlightedMetric(row[4], finalExtremes[2])}</td>
    </tr>`
  );

  table.innerHTML = `
    <colgroup>
      <col class="final-col-code">
      <col class="final-col-name">
      <col class="final-col-num">
      <col class="final-col-num">
      <col class="final-col-num">
    </colgroup>
    <thead>
      <tr class="final-group-row">
        <th rowspan="2" class="final-id">Kode Kota</th>
        <th rowspan="2" class="final-id">Nama Kota</th>
        <th colspan="3" class="final-group">
          <strong>ANGKA FINAL</strong>
          <span>Tahun ${escapeHtml(valueOf("filterYear"))} • Bulan ${escapeHtml(valueOf("filterMonth"))}</span>
        </th>
      </tr>
      <tr class="final-metric-row">
        <th>MtM</th><th>YtD</th><th>YoY</th>
      </tr>
    </thead>
    <tbody>${bodyRows.join("")}</tbody>`;

  const toolbar = document.getElementById("finalHeadlineToolbar");
  toolbar.classList.remove("hidden");

  const searchInput = document.getElementById("finalHeadlineSearchInput");
  searchInput.value = "";
  searchInput.oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    table.querySelectorAll("tbody tr").forEach(tr => {
      tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };

  toolbar.querySelector('[data-final-export="pdf"]').onclick = downloadFinalHeadlinePdf;
  toolbar.querySelector('[data-final-export="image"]').onclick = downloadFinalHeadlineImage;
  toolbar.querySelector('[data-final-export="csv"]').onclick = downloadFinalHeadlineCsv;
  toolbar.querySelector('[data-final-export="excel"]').onclick = downloadFinalHeadlineExcel;
}

function finalHeadlineRowsForExport() {
  const r = state.finalHeadlineData;
  if (!r) return [];
  return (r.rows || []).map(row => [row[0], row[1], round2(row[2]), round2(row[3]), round2(row[4])]);
}

function downloadFinalHeadlineCsv() {
  const meta = getDownloadMeta();
  const rows = [
    ["Jenis Data", "Angka Final"],
    ["Tahun", valueOf("filterYear")],
    ["Bulan", valueOf("filterMonth")],
    ["Tanggal Download", meta.dateText],
    ["Jam Download", meta.timeText],
    [],
    ["Kode Kota", "Nama Kota", "Inflasi MtM", "Inflasi YtD", "Inflasi YoY"],
    ...finalHeadlineRowsForExport()
  ];
  downloadCsv(rows, `Angka Final-Inflasi-${meta.fileStamp}`);
}

function downloadFinalHeadlineExcel() {
  const meta = getDownloadMeta();
  const rows = [
    ["ANGKA FINAL - INFLASI"],
    ["Tahun", valueOf("filterYear")],
    ["Bulan", valueOf("filterMonth")],
    ["Tanggal Download", meta.dateText],
    ["Jam Download", meta.timeText],
    [],
    ["Kode Kota", "Nama Kota", "Inflasi MtM", "Inflasi YtD", "Inflasi YoY"],
    ...finalHeadlineRowsForExport()
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Inflasi Final");
  XLSX.writeFile(wb, safeName(`Angka Final-Inflasi-${meta.fileStamp}`) + ".xlsx");
}

async function finalHeadlineExportCanvas() {
  const section = document.getElementById("standardTableSection");
  const clone = section.cloneNode(true);
  const meta = getDownloadMeta();

  clone.id = "finalHeadlineExportClone";
  Object.assign(clone.style, {
    position: "fixed", left: "-20000px", top: "0",
    width: "1250px", maxWidth: "1250px",
    height: "auto", overflow: "visible",
    background: "#fff", padding: "22px"
  });
  clone.classList.add("visual-export-clone");

  clone.querySelector("#finalHeadlineToolbar")?.remove();
  clone.querySelector("#comparisonToolbar")?.remove();

  // Sinkronkan visibilitas baris sesuai search aktif.
  syncRowVisibility(
    section.querySelectorAll(".final-native-table tbody tr"),
    clone.querySelectorAll(".final-native-table tbody tr")
  );

  const header = document.createElement("div");
  header.className = "standard-export-header";
  header.innerHTML = `
    <div class="export-brand-badge">IF</div>
    <div class="standard-export-copy">
      <div class="export-kicker">DASHBOARD MONITORING INFLASI</div>
      <div class="export-main-title">Inflasi Final</div>
      <div class="export-subtitle">
        Angka Final • Tahun ${escapeHtml(valueOf("filterYear"))} • Bulan ${escapeHtml(valueOf("filterMonth"))}
      </div>
    </div>
    <div class="export-time-box">
      <span>Waktu Download</span>
      <strong>${escapeHtml(meta.dateText)}</strong>
      <strong>${escapeHtml(meta.timeText)}</strong>
    </div>`;
  clone.insertBefore(header, clone.firstChild);

  document.body.appendChild(clone);
  await rafDouble();

  try {
    const canvas = await html2canvas(clone, {
      backgroundColor: "#ffffff", scale: 1.25, useCORS: true, logging: false,
      width: clone.scrollWidth, height: clone.scrollHeight,
      windowWidth: 1350, windowHeight: clone.scrollHeight + 100
    });
    return { canvas, meta };
  } finally { clone.remove(); }
}

async function downloadFinalHeadlineImage() {
  const { canvas, meta } = await finalHeadlineExportCanvas();
  triggerDownload(canvas.toDataURL("image/png"), safeName(`Angka Final-Inflasi-${meta.fileStamp}`) + ".png");
}

async function downloadFinalHeadlinePdf() {
  const { canvas, meta } = await finalHeadlineExportCanvas();
  const { w, h } = fitToPage(canvas);
  pdfMake.createPdf({
    pageSize: "A4", pageOrientation: "landscape", pageMargins: [18, 18, 18, 18],
    content: [{ image: canvas.toDataURL("image/png"), width: w, alignment: "center" }],
    info: { title: "Inflasi Final" }
  }).download(safeName(`Angka Final-Inflasi-${meta.fileStamp}`) + ".pdf");
}

// ===========================================================================
// RENDER — COMPARISON TABLE (Asem vs Final)
// ===========================================================================
function renderComparisonTable(r) {
  document.getElementById("standardTableSection").classList.remove("hidden");
  document.getElementById("commoditySection").classList.add("hidden");
  cleanupStandardTableUi();

  document.getElementById("tableTitle").textContent = "Inflasi Asem vs Angka Final";
  document.getElementById("tableInfo").textContent =
    `Angka Final ${r.finalPeriod.year}-${r.finalPeriod.month} • dibandingkan dengan Angka Sementara ${r.asemPeriod.year}-${r.asemPeriod.month}`;

  const table = document.getElementById("mainTable");
  table.className = "comparison-native-table";

  const comparisonExtremes = getColumnExtremes(r.rows || [], 2, 6);

  const bodyRows = (r.rows || []).map(row =>
    `<tr>
      <td class="cmp-code">${escapeHtml(row[0])}</td>
      <td class="cmp-name">${escapeHtml(row[1])}</td>
      ${row.slice(2).map((v, idx) =>
      `<td class="cmp-num ${idx === 3 ? "cmp-split" : ""}">
          ${formatHighlightedMetric(v, comparisonExtremes[idx])}
        </td>`
    ).join("")}
    </tr>`
  );

  table.innerHTML = `
    <thead>
      <tr class="cmp-group-row">
        <th rowspan="2" class="cmp-id cmp-kode">Kode Kota</th>
        <th rowspan="2" class="cmp-id cmp-nama">Nama Kota</th>
        <th colspan="3" class="cmp-group cmp-final">
          <strong>ANGKA FINAL</strong>
          <span>Tahun ${escapeHtml(r.finalPeriod.year)} • Bulan ${escapeHtml(r.finalPeriod.month)}</span>
        </th>
        <th colspan="3" class="cmp-group cmp-asem">
          <strong>ANGKA SEMENTARA</strong>
          <span>Tahun ${escapeHtml(r.asemPeriod.year)} • Bulan ${escapeHtml(r.asemPeriod.month)}</span>
        </th>
      </tr>
      <tr class="cmp-metric-row">
        <th class="cmp-final-sub">MtM</th>
        <th class="cmp-final-sub">YtD</th>
        <th class="cmp-final-sub">YoY</th>
        <th class="cmp-asem-sub">MtM</th>
        <th class="cmp-asem-sub">YtD</th>
        <th class="cmp-asem-sub">YoY</th>
      </tr>
    </thead>
    <tbody>${bodyRows.join("")}</tbody>`;

  const toolbar = document.getElementById("comparisonToolbar");
  toolbar.classList.remove("hidden");

  const searchInput = document.getElementById("comparisonSearchInput");
  searchInput.value = "";
  searchInput.oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    table.querySelectorAll("tbody tr").forEach(tr => {
      tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };

  toolbar.querySelector('[data-cmp-export="pdf"]').onclick = downloadComparisonVisualPdf;
  toolbar.querySelector('[data-cmp-export="image"]').onclick = downloadComparisonVisualImage;
  toolbar.querySelector('[data-cmp-export="csv"]').onclick = downloadComparisonCsv;
  toolbar.querySelector('[data-cmp-export="excel"]').onclick = downloadComparisonExcel;
}

function comparisonRowsForExport() {
  const r = state.comparisonData;
  if (!r) return [];
  return (r.rows || []).map(row => [
    row[0], row[1],
    round2(row[2]), round2(row[3]), round2(row[4]),
    round2(row[5]), round2(row[6]), round2(row[7])
  ]);
}

function downloadComparisonCsv() {
  const meta = getDownloadMeta();
  const r = state.comparisonData;
  const rows = [
    ["Jenis Data", "Inflasi Asem vs Angka Final"],
    ["Angka Final", `${r.finalPeriod.year}-${r.finalPeriod.month}`],
    ["Angka Sementara", `${r.asemPeriod.year}-${r.asemPeriod.month}`],
    ["Tanggal Download", meta.dateText],
    ["Jam Download", meta.timeText],
    [],
    ["Kode Kota", "Nama Kota", "Final MtM", "Final YtD", "Final YoY", "Sementara MtM", "Sementara YtD", "Sementara YoY"],
    ...comparisonRowsForExport()
  ];
  downloadCsv(rows, `Inflasi Asem vs Angka Final-${meta.fileStamp}`);
}

function downloadComparisonExcel() {
  const meta = getDownloadMeta();
  const r = state.comparisonData;
  const rows = [
    ["INFLASI ASEM VS ANGKA FINAL"],
    ["Angka Final", `${r.finalPeriod.year}-${r.finalPeriod.month}`],
    ["Angka Sementara", `${r.asemPeriod.year}-${r.asemPeriod.month}`],
    ["Tanggal Download", meta.dateText],
    ["Jam Download", meta.timeText],
    [],
    ["Kode Kota", "Nama Kota", "Final MtM", "Final YtD", "Final YoY", "Sementara MtM", "Sementara YtD", "Sementara YoY"],
    ...comparisonRowsForExport()
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Inflasi Asem vs Final");
  XLSX.writeFile(wb, safeName(`Inflasi Asem vs Angka Final-${meta.fileStamp}`) + ".xlsx");
}


function normalizeExportHighlights(root) {
  if (!root) return;

  root.querySelectorAll(".metric-value.metric-high").forEach(el => {
    Object.assign(el.style, {
      display: "inline-flex",
      minWidth: "58px",
      minHeight: "28px",
      alignItems: "center",
      justifyContent: "center",
      padding: "5px 9px",
      borderRadius: "9px",
      background: "#fff0ef",
      color: "#d33a2f",
      border: "1px solid #ffd0cb",
      boxShadow: "none",
      backgroundImage: "none",
      filter: "none",
      opacity: "1"
    });
  });

  root.querySelectorAll(".metric-value.metric-low").forEach(el => {
    Object.assign(el.style, {
      display: "inline-flex",
      minWidth: "58px",
      minHeight: "28px",
      alignItems: "center",
      justifyContent: "center",
      padding: "5px 9px",
      borderRadius: "9px",
      background: "#e9f8f1",
      color: "#07814e",
      border: "1px solid #c8eadb",
      boxShadow: "none",
      backgroundImage: "none",
      filter: "none",
      opacity: "1"
    });
  });

  root.querySelectorAll("td.cell-high").forEach(td => {
    td.style.background = "#fff0ef";
    td.style.backgroundImage = "none";
    td.style.boxShadow = "none";
  });

  root.querySelectorAll("td.cell-low").forEach(td => {
    td.style.background = "#e9f8f1";
    td.style.backgroundImage = "none";
    td.style.boxShadow = "none";
  });
}

async function comparisonExportCanvas() {
  const section = document.getElementById("standardTableSection");
  const clone = section.cloneNode(true);
  const meta = getDownloadMeta();

  clone.id = "comparisonExportClone";
  clone.classList.add("visual-export-clone");
  Object.assign(clone.style, {
    position: "fixed", left: "-20000px", top: "0",
    width: "1450px", maxWidth: "1450px",
    height: "auto", overflow: "visible",
    background: "#fff", padding: "22px"
  });

  clone.querySelector("#comparisonToolbar")?.remove();

  syncRowVisibility(
    section.querySelectorAll(".comparison-native-table tbody tr"),
    clone.querySelectorAll(".comparison-native-table tbody tr")
  );

  const header = document.createElement("div");
  header.className = "standard-export-header";
  header.innerHTML = `
    <div class="export-brand-badge">IF</div>
    <div class="standard-export-copy">
      <div class="export-kicker">DASHBOARD MONITORING INFLASI</div>
      <div class="export-main-title">Inflasi Asem vs Angka Final</div>
      <div class="export-subtitle">
        Angka Final ${escapeHtml(state.comparisonData.finalPeriod.year)}-${escapeHtml(state.comparisonData.finalPeriod.month)}
        • Angka Sementara ${escapeHtml(state.comparisonData.asemPeriod.year)}-${escapeHtml(state.comparisonData.asemPeriod.month)}
        ${meta.sourcePeriod ? ` • Data per ${escapeHtml(meta.sourcePeriod)}` : ""}
      </div>
    </div>
    <div class="export-time-box">
      <span>Waktu Download</span>
      <strong>${escapeHtml(meta.dateText)}</strong>
      <strong>${escapeHtml(meta.timeText)}</strong>
    </div>`;
  clone.insertBefore(header, clone.firstChild);

  document.body.appendChild(clone);
  await rafDouble();

  try {
    const canvas = await html2canvas(clone, {
      backgroundColor: "#ffffff", scale: 1.25, useCORS: true, logging: false,
      width: clone.scrollWidth, height: clone.scrollHeight,
      windowWidth: 1550, windowHeight: clone.scrollHeight + 100
    });
    return { canvas, meta };
  } finally { clone.remove(); }
}

async function downloadComparisonVisualImage() {
  const { canvas, meta } = await comparisonExportCanvas();
  triggerDownload(canvas.toDataURL("image/png"), safeName(`Inflasi Asem vs Angka Final-${meta.fileStamp}`) + ".png");
}

async function downloadComparisonVisualPdf() {
  const { canvas, meta } = await comparisonExportCanvas();
  const { w, h } = fitToPage(canvas);
  pdfMake.createPdf({
    pageSize: "A4", pageOrientation: "landscape", pageMargins: [18, 18, 18, 18],
    content: [{ image: canvas.toDataURL("image/png"), width: w, alignment: "center" }],
    info: { title: "Inflasi Asem vs Angka Final" }
  }).download(safeName(`Inflasi Asem vs Angka Final-${meta.fileStamp}`) + ".pdf");
}

// ===========================================================================
// RENDER — STANDARD (DataTables)
// ===========================================================================
function renderStandard(r) {
  document.getElementById("comparisonToolbar")?.classList.add("hidden");
  document.getElementById("finalHeadlineToolbar")?.classList.add("hidden");
  document.getElementById("standardTableSection").classList.remove("hidden");
  document.getElementById("commoditySection").classList.add("hidden");
  cleanupStandardTableUi();

  const table = document.getElementById("mainTable");
  table.className = "display nowrap";

  table.innerHTML = "<thead><tr></tr></thead><tbody></tbody>";
  const tr = table.querySelector("thead tr");
  r.columns.forEach((c, i) => {
    const th = document.createElement("th");
    th.innerHTML = formatColumnTitle(c, i);
    tr.appendChild(th);
  });

  document.getElementById("tableTitle").textContent = r.title || viewTitle();
  document.getElementById("tableInfo").textContent = r.info || "";

  state.mainDt = $("#mainTable").DataTable({
    data: r.rows,
    columns: r.columns.map((c, i) => ({
      data: i,
      title: formatColumnTitle(c, i),
      render: (data, type, row, meta) => renderCell(data, type, row, meta),
      className: i >= 2 ? "num-cell" : ""
    })),
    scrollX: true,
    autoWidth: false,
    deferRender: true,
    processing: false,
    searchDelay: 300,
    pageLength: state.pageLength,
    lengthMenu: [[25, 50, 100, 250, -1], [25, 50, 100, 250, "Semua"]],
    order: [],
    dom: "Blfrtip",
    buttons: [
      { extend: "excelHtml5", title: exportTitle() },
      { extend: "csvHtml5", title: exportTitle() },
      { text: "PDF", action: () => downloadStandardVisualPdf() },
      { text: "Image", action: () => downloadStandardVisualImage() }
    ],
    language: {
      search: "Cari:",
      lengthMenu: "Tampilkan _MENU_ baris",
      info: "_START_–_END_ dari _TOTAL_",
      infoEmpty: "0–0 dari 0",
      zeroRecords: "Data tidak ditemukan",
      paginate: { next: "Berikut", previous: "Sebelum" }
    }
  });

  state.mainDt.on("length.dt", (_e, _settings, len) => {
    state.pageLength = Number(len);
    localStorage.setItem("inflasi_page_length", String(len));
  });

  // Re-attach after paging, sorting, filtering, or changing row count.
  state.mainDt.on("draw.dt", () => {
    requestAnimationFrame(setupRobustStickyHeader);
  });

  // DataTables needs two paints before scrollHead width is stable.
  requestAnimationFrame(() => {
    requestAnimationFrame(setupRobustStickyHeader);
  });
}

// ===========================================================================
// RENDER — COMMODITY
// ===========================================================================
function renderCommodity(r) {
  document.getElementById("comparisonToolbar")?.classList.add("hidden");
  document.getElementById("finalHeadlineToolbar")?.classList.add("hidden");
  cleanupStandardTableUi();
  state.commodityData = r;
  document.getElementById("standardTableSection").classList.add("hidden");
  document.getElementById("commoditySection").classList.remove("hidden");

  document.getElementById("commodityPageTitle").textContent = viewTitle();
  document.getElementById("commodityPageInfo").textContent =
    `${state.source === "asem" ? "Angka Sementara" : "Angka Final Inflasi"} • Tahun ${valueOf("filterYear")} • Bulan ${valueOf("filterMonth")} • Flag ${valueOf("filterFlag")}`;

  const wrap = document.getElementById("commodityAllCities");

  // [OPT-10] Build semua DOM sekali lewat DocumentFragment, baru append sekali.
  const frag = document.createDocumentFragment();
  (r.cities || []).forEach(city => {
    const sec = document.createElement("section");
    sec.className = "city-section";
    sec.innerHTML = `
      <div class="city-section-head">
        <div>
          <span class="eyebrow">KABUPATEN/KOTA</span>
          <h3>${escapeHtml(city.name || "")}</h3>
        </div>
        <span class="city-code-badge">${escapeHtml(city.code)}</span>
      </div>
      <div class="city-tables">
        <div class="city-table-card low">
          <h4>Andil Terendah</h4>
          <div class="city-table-scroll">${commodityHtmlTable(city.lowest)}</div>
        </div>
        <div class="city-table-card high">
          <h4>Andil Tertinggi</h4>
          <div class="city-table-scroll">${commodityHtmlTable(city.highest)}</div>
        </div>
      </div>`;
    frag.appendChild(sec);
  });
  wrap.innerHTML = "";
  wrap.appendChild(frag);

  applyCommodityGlobalSearch();
}

// [OPT-9] Bangun tabel komoditas dengan array join.
function commodityHtmlTable(rows) {
  const head = `<table class="commodity-plain-table"><thead><tr>
    <th>No</th><th>Kode Komoditas</th><th>Nama Komoditas</th><th>Andil</th>
  </tr></thead><tbody>`;

  if (!rows || !rows.length) return head + `<tr><td colspan="4">Tidak ada data</td></tr></tbody></table>`;

  const bodyRows = rows.map(r => {
    const cls = r[3] > 0 ? "positive" : r[3] < 0 ? "negative" : "";
    return `<tr>
      <td>${r[0]}</td>
      <td>${escapeHtml(r[1])}</td>
      <td>${escapeHtml(r[2])}</td>
      <td class="${cls}">${fmt2(Number(r[3]))}</td>
    </tr>`;
  });

  return head + bodyRows.join("") + "</tbody></table>";
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function applyCommodityGlobalSearch() {
  const input = document.getElementById("commodityGlobalSearch");
  const query = (input?.value || "").trim().toLowerCase();
  document.querySelectorAll("#commodityAllCities .city-section").forEach(citySec => {
    let cityHasVisible = false;
    citySec.querySelectorAll(".commodity-plain-table tbody tr").forEach(tr => {
      const visible = !query || tr.textContent.toLowerCase().includes(query);
      tr.style.display = visible ? "" : "none";
      if (visible) cityHasVisible = true;
    });
    citySec.style.display = (!query || cityHasVisible) ? "" : "none";
  });
}

// ===========================================================================
// COLUMN / CELL FORMATTERS
// ===========================================================================
function formatColumnTitle(label, index) {
  const text = String(label ?? "");
  if (state.source === "asem" && state.view === "headline") {
    const map = { "Final MtM": "MtM", "Final YtD": "YtD", "Final YoY": "YoY", "Sementara MtM": "MtM", "Sementara YtD": "YtD", "Sementara YoY": "YoY" };
    if (map[text]) return `<span class="metric-head">${map[text]}</span>`;
    return escapeHtml(text);
  }
  if (index < 2) return escapeHtml(text);
  const m = text.match(/^(\d+)\s*-\s*(.+)$/);
  if (!m) return escapeHtml(text);
  return `<span class="city-head-code">${escapeHtml(m[1])}</span><span class="city-head-name">${escapeHtml(m[2])}</span>`;
}

function renderCell(data, type, row, meta) {
  if (type !== "display") return data;
  if (typeof data === "number") {
    const formatted = fmt2(data);
    let cls = data > 0 ? "positive" : data < 0 ? "negative" : "";
    if (state.view === "inflasi" && meta && meta.col >= 2 && Array.isArray(row)) {
      const nums = row.slice(2).filter(v => typeof v === "number" && Number.isFinite(v));
      if (nums.length) {
        // [OPT-7] Loop biasa, tidak pakai spread
        let mx = -Infinity, mn = Infinity;
        for (const n of nums) { if (n > mx) mx = n; if (n < mn) mn = n; }
        if (mx !== mn) {
          if (data === mx) cls += " row-max";
          if (data === mn) cls += " row-min";
        }
      }
    }
    return `<span class="${cls.trim()}">${formatted}</span>`;
  }
  return data ?? "";
}

function exportTitle() { return `${state.source}-${viewTitle()}-${valueOf("filterYear")}-${valueOf("filterMonth")}`; }

// ===========================================================================
// STANDARD EXPORT
// ===========================================================================
function buildStandardExportClone() {
  const source = document.getElementById("standardTableSection");
  const clone = source.cloneNode(true);
  const meta = getDownloadMeta();

  clone.id = "standardExportClone";
  clone.classList.add("visual-export-clone");
  Object.assign(clone.style, {
    position: "fixed", left: "-20000px", top: "0",
    width: "1500px", maxWidth: "1500px",
    height: "auto", overflow: "visible",
    background: "#fff", padding: "22px"
  });

  clone.querySelectorAll(
    ".dt-buttons,.dataTables_filter,.dataTables_paginate,.dataTables_info,.dataTables_length"
  ).forEach(x => x.remove());

  clone.querySelectorAll(
    ".table-wrap,.dataTables_scroll,.dataTables_scrollBody,.dataTables_scrollHead"
  ).forEach(x => {
    x.style.overflow = "visible";
    x.style.maxHeight = "none";
    x.style.height = "auto";
    x.style.width = "100%";
  });

  const dataPer = meta.source === "Angka Sementara" && meta.sourcePeriod
    ? ` • Data per ${escapeHtml(meta.sourcePeriod)}` : "";

  let compareText = "";
  if (state.source === "asem" && state.view === "headline") {
    compareText = `
      <div class="standard-export-compare">
        <span>Final: ${escapeHtml(valueOf("compareFinalYear"))}/${escapeHtml(valueOf("compareFinalMonth"))}</span>
        <span>Sementara: ${escapeHtml(valueOf("filterYear"))}/${escapeHtml(valueOf("filterMonth"))}</span>
      </div>`;
  }

  const report = document.createElement("div");
  report.className = "standard-export-header";
  report.innerHTML = `
    <div class="export-brand-badge">IF</div>
    <div class="standard-export-copy">
      <div class="export-kicker">DASHBOARD MONITORING INFLASI</div>
      <div class="export-main-title">${escapeHtml(viewTitle())}</div>
      <div class="export-subtitle">${escapeHtml(meta.source)}${dataPer}</div>
      ${compareText}
    </div>
    <div class="export-time-box">
      <span>Waktu Download</span>
      <strong>${escapeHtml(meta.dateText)}</strong>
      <strong>${escapeHtml(meta.timeText)}</strong>
    </div>`;
  clone.insertBefore(report, clone.firstChild);

  normalizeExportHighlights(clone);
  document.body.appendChild(clone);
  return { clone, meta };
}

async function renderStandardExportCanvas() {
  const previousLen = state.mainDt ? state.mainDt.page.len() : null;
  const previousPage = state.mainDt ? state.mainDt.page() : 0;

  try {
    if (state.mainDt) {
      state.mainDt.page.len(-1).draw(false);
      await sleep(100);
    }

    const { clone, meta } = buildStandardExportClone();
    try {
      await rafDouble();
      const width = Math.ceil(clone.scrollWidth);
      const height = Math.ceil(clone.scrollHeight);
      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff", scale: 1.15, useCORS: true, logging: false,
        width, height, windowWidth: width + 100, windowHeight: height + 100,
        scrollX: 0, scrollY: 0
      });
      return { canvas, meta };
    } finally { clone.remove(); }
  } finally {
    if (state.mainDt && previousLen !== null) {
      state.mainDt.page.len(previousLen).draw(false);
      state.mainDt.page(previousPage).draw(false);
    }
  }
}

async function downloadStandardVisualImage() {
  const { canvas, meta } = await renderStandardExportCanvas();
  triggerDownload(canvas.toDataURL("image/png"), safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`) + ".png");
}

async function downloadStandardVisualPdf() {
  const { canvas, meta } = await renderStandardExportCanvas();
  const content = sliceCanvasToPdfPages(canvas);
  pdfMake.createPdf({
    pageSize: "A4", pageOrientation: "landscape", pageMargins: [18, 18, 18, 18],
    content,
    info: { title: `${meta.source} - ${viewTitle()}`, subject: `Download ${meta.dateText} ${meta.timeText}` }
  }).download(safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`) + ".pdf");
}

// ===========================================================================
// COMMODITY EXPORT
// ===========================================================================
function buildCommodityExportClone() {
  const meta = getDownloadMeta();
  const sourceEl = document.getElementById("commoditySection");
  const clone = sourceEl.cloneNode(true);

  clone.id = "commodityExportClone";
  clone.classList.remove("hidden");
  clone.classList.add("visual-export-clone");
  Object.assign(clone.style, {
    width: "1400px", maxWidth: "1400px",
    margin: "0", padding: "24px", background: "#f4f7fb"
  });

  clone.querySelector(".commodity-downloads")?.remove();
  clone.querySelector(".commodity-search-wrap")?.remove();

  const header = document.createElement("div");
  header.className = "export-report-header";
  header.innerHTML = `
    <div class="export-brand-badge">IF</div>
    <div class="export-head-copy">
      <div class="export-kicker">DASHBOARD MONITORING INFLASI</div>
      <div class="export-main-title">${escapeHtml(viewTitle())}</div>
      <div class="export-subtitle">
        ${escapeHtml(meta.source)}${meta.sourcePeriod ? ` • Data per ${escapeHtml(meta.sourcePeriod)}` : ""}
        • Tahun ${escapeHtml(valueOf("filterYear"))}
        • Bulan ${escapeHtml(valueOf("filterMonth"))}
        • Flag ${escapeHtml(valueOf("filterFlag"))}
      </div>
    </div>
    <div class="export-time-box">
      <span>Waktu Download</span>
      <strong>${escapeHtml(meta.dateText)}</strong>
      <strong>${escapeHtml(meta.timeText)}</strong>
    </div>`;
  clone.insertBefore(header, clone.firstChild);

  // Sinkronkan visibilitas city-section dan baris tabel sesuai search.
  const originalCities = [...document.querySelectorAll("#commodityAllCities .city-section")];
  const clonedCities = [...clone.querySelectorAll("#commodityAllCities .city-section")];
  originalCities.forEach((origCity, idx) => {
    const cc = clonedCities[idx];
    if (!cc) return;
    cc.style.display = origCity.style.display;
    syncRowVisibility(
      origCity.querySelectorAll(".commodity-plain-table tbody tr"),
      cc.querySelectorAll(".commodity-plain-table tbody tr")
    );
  });

  normalizeExportHighlights(clone);
  document.body.appendChild(clone);
  return { clone, meta };
}

async function renderCommodityExportImageCanvas() {
  const { clone, meta } = buildCommodityExportClone();
  try {
    Object.assign(clone.style, {
      position: "fixed", left: "-20000px", top: "0",
      width: "1400px", maxWidth: "1400px",
      height: "auto", overflow: "visible"
    });
    clone.querySelectorAll(".city-section").forEach(sec => {
      if (sec.style.display !== "none") { sec.style.breakInside = "avoid"; sec.style.pageBreakInside = "avoid"; }
    });
    await rafDouble();

    const width = Math.ceil(clone.scrollWidth);
    const height = Math.ceil(clone.scrollHeight);
    const canvas = await html2canvas(clone, {
      backgroundColor: "#f4f7fb", scale: 1.15, useCORS: true, logging: false,
      width, height, windowWidth: width + 100, windowHeight: height + 100,
      scrollX: 0, scrollY: 0
    });
    return { canvas, meta };
  } finally { clone.remove(); }
}

async function downloadCommodityPageImage() {
  const { canvas, meta } = await renderCommodityExportImageCanvas();
  triggerDownload(canvas.toDataURL("image/png"), safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`) + ".png");
}

async function downloadCommodityPagePdf() {
  const { clone, meta } = buildCommodityExportClone();
  try {
    Object.assign(clone.style, {
      position: "fixed", left: "-20000px", top: "0",
      width: "1400px", maxWidth: "1400px",
      height: "auto", overflow: "visible"
    });
    await rafDouble();

    const headerEl = clone.querySelector(".export-report-header");
    const headerCanvas = await html2canvas(headerEl, { backgroundColor: "#f4f7fb", scale: 1.25, useCORS: true, logging: false });
    const headerImg = headerCanvas.toDataURL("image/png");

    const sections = [...clone.querySelectorAll(".city-section")].filter(s => s.style.display !== "none");
    const rendered = [];
    for (const sec of sections) {
      const c = await html2canvas(sec, {
        backgroundColor: "#ffffff", scale: 1.25, useCORS: true, logging: false,
        width: Math.ceil(sec.scrollWidth), height: Math.ceil(sec.scrollHeight)
      });
      rendered.push({ image: c.toDataURL("image/png"), width: c.width, height: c.height });
    }

    const pageW = 841.89, pageH = 595.28, margin = 18;
    const usableW = pageW - margin * 2, usableH = pageH - margin * 2;
    const headerRatio = headerCanvas.height / headerCanvas.width;
    const headerHeightPt = usableW * headerRatio;
    const gap = 10;
    const cardAreaH = usableH - headerHeightPt - gap;

    const content = [];
    let firstPage = true;
    for (const item of rendered) {
      let cardW = usableW, cardH = cardW * (item.height / item.width);
      if (cardH > cardAreaH) { const s = cardAreaH / cardH; cardH *= s; cardW *= s; }
      if (!firstPage) content.push({ text: "", pageBreak: "before" });
      content.push({ image: headerImg, width: usableW, margin: [0, 0, 0, gap] });
      content.push({ image: item.image, width: cardW, alignment: "center", margin: [0, 0, 0, 0] });
      firstPage = false;
    }

    if (!rendered.length) {
      content.push({ image: headerImg, width: usableW, margin: [0, 0, 0, 12] });
      content.push({ text: "Tidak ada data yang sesuai dengan pencarian.", alignment: "center", color: "#718096", margin: [0, 30, 0, 0] });
    }

    pdfMake.createPdf({
      pageSize: "A4", pageOrientation: "landscape",
      pageMargins: [margin, margin, margin, margin],
      content,
      info: { title: `${meta.source} - ${viewTitle()}`, subject: `Download ${meta.dateText} ${meta.timeText}` }
    }).download(safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`) + ".pdf");
  } finally { clone.remove(); }
}

function commodityFlatRows() {
  const rows = [];
  (state.commodityData?.cities || []).forEach(city => {
    (city.lowest || []).forEach(r => rows.push([city.code, city.name, "Terendah", r[0], r[1], r[2], round2(r[3])]));
    (city.highest || []).forEach(r => rows.push([city.code, city.name, "Tertinggi", r[0], r[1], r[2], round2(r[3])]));
  });
  return rows;
}

function downloadCommodityCsv() {
  const meta = getDownloadMeta(), rows = commodityFlatRows();
  const all = [
    ["Jenis Data", meta.source], ["Data Per", meta.sourcePeriod || "-"],
    ["Menu", viewTitle()], ["Tahun", valueOf("filterYear")],
    ["Bulan", valueOf("filterMonth")], ["Flag", valueOf("filterFlag")],
    ["Tanggal Download", meta.dateText], ["Jam Download", meta.timeText],
    [],
    ["Kode Kota", "Nama Kota", "Kelompok", "No", "Kode Komoditas", "Nama Komoditas", "Andil"],
    ...rows
  ];
  downloadCsv(all, `${meta.source}-${viewTitle()}-${meta.fileStamp}`);
}

function downloadCommodityWorkbook() {
  const meta = getDownloadMeta(), rows = commodityFlatRows();
  if (!rows.length) { alert("Data komoditas belum tersedia."); return; }
  const wb = XLSX.utils.book_new();
  const summary = [
    ["JENIS DATA", meta.source], ["DATA PER", meta.sourcePeriod || "-"],
    ["MENU", viewTitle()], ["TAHUN", valueOf("filterYear")],
    ["BULAN", valueOf("filterMonth")], ["FLAG", valueOf("filterFlag")],
    ["TANGGAL DOWNLOAD", meta.dateText], ["JAM DOWNLOAD", meta.timeText],
    [],
    ["Kode Kota", "Nama Kota", "Kelompok", "No", "Kode Komoditas", "Nama Komoditas", "Andil"],
    ...rows
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Semua KabKota");
  (state.commodityData?.cities || []).forEach(city => {
    const arr = [
      [meta.source],
      [`Download: ${meta.dateText}, ${meta.timeText}`],
      [`${city.code} - ${city.name}`],
      [],
      ["ANDIL TERENDAH"],
      ["No", "Kode Komoditas", "Nama Komoditas", "Andil"],
      ...(city.lowest || []).map(r => [r[0], r[1], r[2], round2(r[3])]),
      [],
      ["ANDIL TERTINGGI"],
      ["No", "Kode Komoditas", "Nama Komoditas", "Andil"],
      ...(city.highest || []).map(r => [r[0], r[1], r[2], round2(r[3])])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(arr), String(city.code).substring(0, 31));
  });
  XLSX.writeFile(wb, safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`) + ".xlsx");
}

// ===========================================================================
// UPDATED AT
// ===========================================================================
async function loadUpdatedAt() {
  if (state.source !== "asem") return;
  try {
    if (state.updatedAtCache) {
      document.getElementById("dataUpdatedAt").textContent = state.updatedAtCache.display || "Belum diatur";
      document.getElementById("updatedAtInput").value = state.updatedAtCache.inputValue || "";
      return;
    }
    const r = await Api.request({ action: "getUpdatedAt" });
    state.updatedAtCache = r;
    document.getElementById("dataUpdatedAt").textContent = r.display || "Belum diatur";
    document.getElementById("updatedAtInput").value = r.inputValue || "";
  } catch (_) { }
}

async function saveUpdatedAt() {
  try {
    const value = document.getElementById("updatedAtInput").value;
    const token = sessionStorage.getItem("inflasi_token");
    const r = await Api.request({ action: "setUpdatedAt", value, token });
    document.getElementById("dataUpdatedAt").textContent = r.display;
    state.updatedAtCache = r;
    document.getElementById("updatedAtModal").classList.add("hidden");
  } catch (err) { alert(err.message); }
}

// ===========================================================================
// UTILITIES — SHARED DOWNLOAD HELPERS
// [OPT-11] Fungsi download yang duplikat di banyak tempat dikonsolidasi.
// ===========================================================================

/** Trigger <a> download tanpa harus menyimpan blob (untuk dataURL). */
function triggerDownload(href, filename) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = href;
  a.click();
}

/** Buat CSV dari array-of-arrays dan langsung trigger download. */
function downloadCsv(rows, filenameBase) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, safeName(filenameBase) + ".csv");
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** Potong canvas menjadi halaman-halaman PDF A4 landscape. */
function sliceCanvasToPdfPages(canvas) {
  const pageW = 841.89, pageH = 595.28, margin = 18;
  const usableW = pageW - margin * 2, usableH = pageH - margin * 2;
  const pxPerPt = canvas.width / usableW;
  const slicePx = Math.max(1, Math.floor(usableH * pxPerPt));
  const content = [];
  let y = 0;
  while (y < canvas.height) {
    let h = Math.min(slicePx, canvas.height - y);
    const remaining = canvas.height - (y + h);
    if (remaining > 0 && remaining < slicePx * 0.16) h = canvas.height - y;
    const slice = document.createElement("canvas");
    slice.width = canvas.width; slice.height = h;
    const ctx = slice.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (content.length) content.push({ text: "", pageBreak: "before" });
    content.push({ image: slice.toDataURL("image/png"), width: usableW });
    y += h;
  }
  return content;
}

/** Hitung ukuran gambar agar muat di satu halaman A4 landscape. */
function fitToPage(canvas) {
  const pageW = 841.89, pageH = 595.28, margin = 18;
  const usableW = pageW - margin * 2, usableH = pageH - margin * 2;
  let w = usableW, h = w * (canvas.height / canvas.width);
  if (h > usableH) { const s = usableH / h; h *= s; w *= s; }
  return { w, h };
}

/** Sinkronkan display setiap baris dari NodeList sumber ke NodeList target. */
function syncRowVisibility(sourceRows, targetRows) {
  const src = [...sourceRows], tgt = [...targetRows];
  src.forEach((row, i) => { if (tgt[i]) tgt[i].style.display = row.style.display; });
}

/** Tunggu 2 animation frame (layout selesai). */
function rafDouble() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/** Promise-based setTimeout. */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===========================================================================
// MISC
// ===========================================================================
function showLoading(v) { document.getElementById("loadingBox").classList.toggle("hidden", !v); }
function showError(msg) { const el = document.getElementById("errorBox"); el.textContent = msg; el.classList.remove("hidden"); }
function clearError() { document.getElementById("errorBox").classList.add("hidden"); }

function getDownloadMeta() {
  const now = new Date();
  const source = state.source === "asem" ? "Angka Sementara" : "Angka Final Inflasi";
  const sourcePeriod = state.source === "asem" ? (document.getElementById("dataUpdatedAt")?.textContent || "Belum diatur") : "";
  const dateText = now.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const timeText = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":");
  const fileStamp = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  return { source, sourcePeriod, dateText, timeText, fileStamp };
}

function safeName(v) { return String(v || "export").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim(); }
function round2(v) { const n = Number(v); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : v; }
