const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT SETELAH DEPLOY
  API_URL: "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE"
};

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
};

const Api = {
  async request(params = {}) {
    if (!CONFIG.API_URL || CONFIG.API_URL.includes("PASTE_APPS_SCRIPT")) {
      throw new Error("URL Apps Script belum diisi di script.js");
    }
    const url = new URL(CONFIG.API_URL);
    Object.entries(params).forEach(([k,v]) => {
      if (v !== "" && v !== undefined && v !== null) url.searchParams.set(k,v);
    });

    const res = await fetch(url.toString(), {cache:"no-store"});
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "Terjadi kesalahan.");
    return json;
  }
};

function cacheKey(prefix,obj){
  const ordered=Object.keys(obj||{}).sort().reduce((a,k)=>(a[k]=obj[k],a),{});
  return prefix+":"+JSON.stringify(ordered);
}
async function cachedApi(prefix,params,ttlMs=120000){
  const key=cacheKey(prefix,params), now=Date.now(), hit=state.responseCache.get(key);
  if(hit && now-hit.time<ttlMs) return hit.data;
  const data=await Api.request(params);
  state.responseCache.set(key,{time:now,data});
  return data;
}

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

function showLogin(){
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("appPage").classList.add("hidden");
}
async function showApp(){
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("appPage").classList.remove("hidden");
  await loadSourceFilters();
  await loadUpdatedAt();
  await loadCurrentView();
}
function bindLogin(){
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("loginMessage");
    msg.textContent = "Memeriksa...";
    try{
      const r = await Api.request({
        action:"login",
        username:document.getElementById("username").value.trim(),
        password:document.getElementById("password").value
      });
      sessionStorage.setItem("inflasi_token", r.token);
      msg.textContent = "";
      await showApp();
    }catch(err){ msg.textContent = err.message; }
  });
}
function bindAccordion(){
  document.querySelectorAll(".menu-main").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.menu;
      const sub = document.getElementById("submenu-"+id);
      const willOpen = !sub.classList.contains("open");

      document.querySelectorAll(".submenu").forEach(x => x.classList.remove("open"));
      document.querySelectorAll(".menu-main").forEach(x => x.classList.remove("open"));

      if(willOpen){
        sub.classList.add("open");
        btn.classList.add("open");
      }
    });
  });

  document.querySelectorAll(".submenu-parent").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.group);
      const parent = btn.closest(".submenu");
      parent.querySelectorAll(".submenu-level2").forEach(x => {
        if(x !== target) x.classList.remove("open");
      });
      parent.querySelectorAll(".submenu-parent").forEach(x => {
        if(x !== btn) x.classList.remove("open");
      });
      target.classList.toggle("open");
      btn.classList.toggle("open");
    });
  });

  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("[data-view]").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      const previousSource=state.source;
      state.source=btn.dataset.source;
      state.period=btn.dataset.period||"";
      state.view=btn.dataset.view;
      if(previousSource!==state.source || !state.filterCache[state.source]) await loadSourceFilters();
      else { state.filters=state.filterCache[state.source]; hydrateFilterControlsFromState(); }
      if(state.source==="asem") await loadUpdatedAt();
      await loadCurrentView();
    });
  });
}
function bindAppEvents(){
  document.getElementById("applyFilterBtn").addEventListener("click", async ()=>{
    if(state.source==="asem" && state.view==="headline"){
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
    if(el){ el.value=""; applyCommodityGlobalSearch(); el.focus(); }
  });
}

async function loadSourceFilters(){
  clearError();
  if(state.filterCache[state.source]){state.filters=state.filterCache[state.source];hydrateFilterControlsFromState();return;}
  showLoading(true);
  try{
    state.filters=await cachedApi("filters",{action:"filters",source:state.source},600000);
    state.filterCache[state.source]=state.filters;
    hydrateFilterControlsFromState();
  }catch(err){showError(err.message);}finally{showLoading(false);}
}
function hydrateFilterControlsFromState(){
  if(!state.filters)return;
  fillSelect("filterYear",state.filters.years);updateMonths();fillSelect("filterFlag",state.filters.flags);
}

function updateMonths(){
  if(!state.filters) return;
  const y = valueOf("filterYear") || state.filters.years[0];
  const months = state.filters.monthsByYear[String(y)] || [];
  fillSelect("filterMonth", months);
}
function fillSelect(id, items){
  const el = document.getElementById(id);
  const old = el.value;
  el.innerHTML = "";
  (items || []).forEach(item => {
    if(typeof item === "object") el.add(new Option(item.label,item.value));
    else el.add(new Option(item,item));
  });
  if(old && [...el.options].some(o => String(o.value) === String(old))) el.value = old;
}
function valueOf(id){ return document.getElementById(id)?.value || ""; }


async function ensureFinalComparisonFilters(){
  if(state.finalFilterCache){
    hydrateFinalComparisonFilters();
    return;
  }

  state.finalFilterCache=await cachedApi(
    "filters",
    {action:"filters",source:"final"},
    10*60*1000
  );
  hydrateFinalComparisonFilters();
}

function hydrateFinalComparisonFilters(){
  const f=state.finalFilterCache;
  if(!f) return;

  const yearEl=document.getElementById("compareFinalYear");
  const monthEl=document.getElementById("compareFinalMonth");
  if(!yearEl||!monthEl) return;

  const oldYear=yearEl.value;
  const oldMonth=monthEl.value;

  fillSelect("compareFinalYear",f.years);

  const asemYear=Number(valueOf("filterYear"));
  const asemMonth=Number(valueOf("filterMonth"));
  let defaultYear=asemYear;
  let defaultMonth=asemMonth-1;
  if(defaultMonth<1){ defaultMonth=12; defaultYear=asemYear-1; }

  if(oldYear && [...yearEl.options].some(o=>o.value===oldYear)){
    yearEl.value=oldYear;
  }else if([...yearEl.options].some(o=>o.value===String(defaultYear))){
    yearEl.value=String(defaultYear);
  }

  updateCompareFinalMonths();

  if(oldMonth && [...monthEl.options].some(o=>o.value===oldMonth)){
    monthEl.value=oldMonth;
  }else if([...monthEl.options].some(o=>o.value===String(defaultMonth))){
    monthEl.value=String(defaultMonth);
  }
}

function updateCompareFinalMonths(){
  const f=state.finalFilterCache;
  if(!f) return;

  const year=valueOf("compareFinalYear");
  const months=f.monthsByYear[String(year)]||[];
  const old=valueOf("compareFinalMonth");

  fillSelect("compareFinalMonth",months);

  if(old && [...document.getElementById("compareFinalMonth").options].some(o=>o.value===old)){
    document.getElementById("compareFinalMonth").value=old;
  }
}

async function loadCurrentView(){
  updateUI();
  showLoading(true);
  clearError();

  const args = {
    source:state.source,
    period:state.period,
    year:valueOf("filterYear"),
    month:valueOf("filterMonth"),
    flag:valueOf("filterFlag")
  };

  try{
    let r;
    if(state.view === "headline" && state.source === "asem"){
      await ensureFinalComparisonFilters();
      r = await cachedApi("headlineCompare",{
        action:"headlineCompare",
        asemYear:valueOf("filterYear"),
        asemMonth:valueOf("filterMonth"),
        finalYear:valueOf("compareFinalYear"),
        finalMonth:valueOf("compareFinalMonth")
      },300000);
      state.comparisonData=r;
      renderStandard(r);
    }else if(state.view === "headline"){
      r = await cachedApi("headline",{action:"headline", ...args},300000);
      state.comparisonData=null;
      renderStandard(r);
    }else if(state.view === "komoditas"){
      r = await cachedApi("commodity",{action:"commodity", ...args,mode:valueOf("commodityMode")},300000);
      renderCommodity(r);
    }else{
      r = await cachedApi("table",{action:"table",view:state.view,...args},300000);
      renderStandard(r);
    }
  }catch(err){ showError(err.message); }
  finally{ showLoading(false); }
}

function updateUI(){
  const title = viewTitle();
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = state.source === "asem" ? "Angka Sementara" : "Angka Final Inflasi";
  document.getElementById("updateCard").classList.toggle("hidden", state.source !== "asem");

  const commodity = state.view === "komoditas";
  document.querySelectorAll(".komoditas-only").forEach(x => x.style.display = commodity ? "" : "none");

  const asemHeadline=state.source==="asem" && state.view==="headline";
  document.getElementById("headlineCompareFilters")?.classList.toggle("hidden",!asemHeadline);
  document.getElementById("standardTableSection")?.classList.toggle("headline-comparison",asemHeadline);

  document.getElementById("statSource").textContent = state.source === "asem" ? "Angka Sementara" : "Angka Final";
  document.getElementById("statYear").textContent = valueOf("filterYear") || "-";
  document.getElementById("statMonth").textContent = valueOf("filterMonth") || "-";
  document.getElementById("statFlag").textContent = valueOf("filterFlag") || "-";
}
function viewTitle(){
  if(state.view === "headline") return state.source === "asem" ? "Inflasi Asem" : "Inflasi Final";
  const p = {mtm:"MtM",ytd:"YtD",yoy:"YoY"}[state.period] || "";
  if(state.view === "komoditas") return `Komoditas Andil ${p}`;
  return `${state.view === "andil" ? "Andil" : "Inflasi"} ${p}`;
}

function renderStandard(r){
  document.getElementById("standardTableSection").classList.remove("hidden");
  document.getElementById("commoditySection").classList.add("hidden");
  if(state.mainDt){ state.mainDt.destroy(); state.mainDt=null; }

  const table = document.getElementById("mainTable");

  const isComparison =
    state.source==="asem" &&
    state.view==="headline" &&
    r.finalPeriod &&
    r.asemPeriod;

  if(isComparison){
    table.innerHTML = `
      <thead>
        <tr class="merged-group-row">
          <th rowspan="2" class="merged-id-head">Kode Kota</th>
          <th rowspan="2" class="merged-id-head">Nama Kota</th>
          <th colspan="3" class="merged-final-head">
            <span>ANGKA FINAL PEMBANDING</span>
            <small>Tahun ${escapeHtml(r.finalPeriod.year)} • Bulan ${escapeHtml(r.finalPeriod.month)}</small>
          </th>
          <th colspan="3" class="merged-asem-head">
            <span>ANGKA SEMENTARA</span>
            <small>Tahun ${escapeHtml(r.asemPeriod.year)} • Bulan ${escapeHtml(r.asemPeriod.month)}</small>
          </th>
        </tr>
        <tr class="merged-metric-row">
          <th>MtM</th><th>YtD</th><th>YoY</th>
          <th>MtM</th><th>YtD</th><th>YoY</th>
        </tr>
      </thead>
      <tbody></tbody>`;
  }else{
    table.innerHTML = "<thead><tr></tr></thead><tbody></tbody>";
    const tr = table.querySelector("thead tr");
    r.columns.forEach((c,i)=>{
      const th=document.createElement("th");
      th.innerHTML=formatColumnTitle(c,i);
      tr.appendChild(th);
    });
  }

  document.getElementById("tableTitle").textContent = r.title || viewTitle();
  document.getElementById("tableInfo").textContent = r.info || "";

  state.mainDt = $("#mainTable").DataTable({
    data:r.rows,
    columns:r.columns.map((c,i)=>({
      data:i,
      ...(isComparison ? {} : {title:formatColumnTitle(c,i)}),
      render:(data,type,row,meta)=>renderCell(data,type,row,meta),
      className:i>=2?"num-cell":""
    })),
    scrollX:true,pageLength:25,order:[],
    orderCellsTop:false,
    dom:"Bfrtip",
    buttons:[
      {extend:"excelHtml5",title:exportTitle()},
      {extend:"csvHtml5",title:exportTitle()},
      {text:"PDF",action:()=>downloadStandardVisualPdf()},
      {text:"Image",action:()=>downloadStandardVisualImage()}
    ],
    language:{search:"Cari:",info:"_START_–_END_ dari _TOTAL_",zeroRecords:"Data tidak ditemukan",paginate:{next:"Berikut",previous:"Sebelum"}}
  });
}
function renderCommodity(r){
  state.commodityData = r;
  document.getElementById("standardTableSection").classList.add("hidden");
  document.getElementById("commoditySection").classList.remove("hidden");

  document.getElementById("commodityPageTitle").textContent = viewTitle();
  document.getElementById("commodityPageInfo").textContent =
    `${state.source === "asem" ? "Angka Sementara" : "Angka Final Inflasi"} • Tahun ${valueOf("filterYear")} • Bulan ${valueOf("filterMonth")} • Flag ${valueOf("filterFlag")}`;

  const wrap = document.getElementById("commodityAllCities");
  wrap.innerHTML = "";

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
      </div>
    `;
    wrap.appendChild(sec);
  });
  applyCommodityGlobalSearch();
}
function commodityHtmlTable(rows){
  let html = `<table class="commodity-plain-table"><thead><tr>
    <th>No</th><th>Kode Komoditas</th><th>Nama Komoditas</th><th>Andil</th>
  </tr></thead><tbody>`;
  if(!rows || !rows.length){
    html += `<tr><td colspan="4">Tidak ada data</td></tr>`;
  }else{
    rows.forEach(r=>{
      const cls = r[3] > 0 ? "positive" : r[3] < 0 ? "negative" : "";
      html += `<tr>
        <td>${r[0]}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>${escapeHtml(r[2])}</td>
        <td class="${cls}">${Number(r[3]).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      </tr>`;
    });
  }
  html += `</tbody></table>`;
  return html;
}
function escapeHtml(v){
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function applyCommodityGlobalSearch(){
  const input=document.getElementById("commodityGlobalSearch");
  const query=String(input?.value||"").trim().toLowerCase();
  document.querySelectorAll("#commodityAllCities .city-section").forEach(citySec=>{
    let cityHasVisible=false;
    citySec.querySelectorAll(".commodity-plain-table tbody tr").forEach(tr=>{
      const visible=!query || tr.textContent.toLowerCase().includes(query);
      tr.style.display=visible?"":"none";
      if(visible) cityHasVisible=true;
    });
    citySec.style.display=(!query||cityHasVisible)?"":"none";
  });
}

function formatColumnTitle(label,index){
  const text=String(label??"");

  if(state.source==="asem" && state.view==="headline"){
    const map={
      "Final MtM":"MtM","Final YtD":"YtD","Final YoY":"YoY",
      "Sementara MtM":"MtM","Sementara YtD":"YtD","Sementara YoY":"YoY"
    };
    if(map[text]) return `<span class="metric-head">${map[text]}</span>`;
    return escapeHtml(text);
  }

  if(index<2) return escapeHtml(text);

  const m=text.match(/^(\d+)\s*-\s*(.+)$/);
  if(!m) return escapeHtml(text);

  return `<span class="city-head-code">${escapeHtml(m[1])}</span><span class="city-head-name">${escapeHtml(m[2])}</span>`;
}
function renderCell(data,type,row,meta){
  if(type!=="display")return data;
  if(typeof data==="number"){
    const formatted=data.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
    let cls=data>0?"positive":data<0?"negative":"";
    if(state.view==="inflasi"&&meta&&meta.col>=2&&Array.isArray(row)){
      const nums=row.slice(2).filter(v=>typeof v==="number"&&Number.isFinite(v));
      if(nums.length){const mx=Math.max(...nums),mn=Math.min(...nums);if(mx!==mn){if(data===mx)cls+=" row-max";if(data===mn)cls+=" row-min";}}
    }
    return `<span class="${cls.trim()}">${formatted}</span>`;
  }
  return data??"";
}

function exportTitle(){return `${state.source}-${viewTitle()}-${valueOf("filterYear")}-${valueOf("filterMonth")}`;}
async function exportImage(id){
  const el=document.getElementById(id);
  const canvas=await html2canvas(el,{backgroundColor:"#fff",scale:2,useCORS:true});
  const a=document.createElement("a");
  a.download=exportTitle().replace(/[\\/:*?"<>|]+/g,"-")+".png";
  a.href=canvas.toDataURL("image/png");a.click();
}

function showLoading(v){document.getElementById("loadingBox").classList.toggle("hidden",!v);}
function showError(msg){const el=document.getElementById("errorBox");el.textContent=msg;el.classList.remove("hidden");}
function clearError(){document.getElementById("errorBox").classList.add("hidden");}

async function loadUpdatedAt(){
  if(state.source!=="asem")return;
  try{
    if(state.updatedAtCache){document.getElementById("dataUpdatedAt").textContent=state.updatedAtCache.display||"Belum diatur";document.getElementById("updatedAtInput").value=state.updatedAtCache.inputValue||"";return;}
    const r=await Api.request({action:"getUpdatedAt"});state.updatedAtCache=r;document.getElementById("dataUpdatedAt").textContent=r.display||"Belum diatur";document.getElementById("updatedAtInput").value=r.inputValue||"";
  }catch(_){}
}

async function saveUpdatedAt(){
  try{
    const value=document.getElementById("updatedAtInput").value;
    const token=sessionStorage.getItem("inflasi_token");
    const r=await Api.request({action:"setUpdatedAt",value,token});
    document.getElementById("dataUpdatedAt").textContent=r.display;
    state.updatedAtCache=r;
    document.getElementById("updatedAtModal").classList.add("hidden");
  }catch(err){alert(err.message);}
}
async function downloadCommodityPageImage(){
  const {canvas,meta}=await renderCommodityExportCanvas();
  const a=document.createElement("a");
  a.download=safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".png";
  a.href=canvas.toDataURL("image/png");
  a.click();
}

async function downloadCommodityPagePdf(){
  const {canvas,meta}=await renderCommodityExportCanvas();
  const pageWidthPt=841.89,pageHeightPt=595.28,marginPt=18;
  const usableW=pageWidthPt-marginPt*2,usableH=pageHeightPt-marginPt*2;
  const pxPerPt=canvas.width/usableW;
  const sliceHeightPx=Math.max(1,Math.floor(usableH*pxPerPt));
  const content=[];
  let y=0,page=0;
  while(y<canvas.height){
    const h=Math.min(sliceHeightPx,canvas.height-y);
    const slice=document.createElement("canvas");
    slice.width=canvas.width;slice.height=h;
    const ctx=slice.getContext("2d");
    ctx.fillStyle="#f4f7fb";ctx.fillRect(0,0,slice.width,slice.height);
    ctx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
    if(page>0) content.push({text:"",pageBreak:"before"});
    content.push({image:slice.toDataURL("image/png"),width:usableW});
    y+=h;page++;
  }
  pdfMake.createPdf({pageSize:"A4",pageOrientation:"landscape",pageMargins:[marginPt,marginPt,marginPt,marginPt],content,
    info:{title:`${meta.source} - ${viewTitle()}`,subject:`Download ${meta.dateText} ${meta.timeText}`}
  }).download(safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".pdf");
}


function buildStandardExportClone(){
  const source=document.getElementById("standardTableSection");
  const clone=source.cloneNode(true);
  const meta=getDownloadMeta();

  clone.id="standardExportClone";
  clone.style.position="fixed";
  clone.style.left="-20000px";
  clone.style.top="0";
  clone.style.width="1500px";
  clone.style.maxWidth="1500px";
  clone.style.height="auto";
  clone.style.overflow="visible";
  clone.style.background="#fff";
  clone.style.padding="22px";

  clone.querySelectorAll(
    ".dt-buttons,.dataTables_filter,.dataTables_paginate,.dataTables_info,.dataTables_length"
  ).forEach(x=>x.remove());

  clone.querySelectorAll(
    ".table-wrap,.dataTables_scroll,.dataTables_scrollBody,.dataTables_scrollHead"
  ).forEach(x=>{
    x.style.overflow="visible";
    x.style.maxHeight="none";
    x.style.height="auto";
    x.style.width="100%";
  });

  const report=document.createElement("div");
  report.className="standard-export-header";

  const dataPer=meta.source==="Angka Sementara" && meta.sourcePeriod
    ? ` • Data per ${escapeHtml(meta.sourcePeriod)}`
    : "";

  let compareText="";
  if(state.source==="asem" && state.view==="headline"){
    compareText=`
      <div class="standard-export-compare">
        <span>Final: ${escapeHtml(valueOf("compareFinalYear"))}/${escapeHtml(valueOf("compareFinalMonth"))}</span>
        <span>Sementara: ${escapeHtml(valueOf("filterYear"))}/${escapeHtml(valueOf("filterMonth"))}</span>
      </div>`;
  }

  report.innerHTML=`
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
  clone.insertBefore(report,clone.firstChild);

  document.body.appendChild(clone);
  return {clone,meta};
}

async function renderStandardExportCanvas(){
  const previousLen=state.mainDt ? state.mainDt.page.len() : null;
  const previousPage=state.mainDt ? state.mainDt.page() : 0;

  try{
    if(state.mainDt){
      state.mainDt.page.len(-1).draw(false);
      await new Promise(r=>setTimeout(r,100));
    }

    const {clone,meta}=buildStandardExportClone();
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      const width=Math.ceil(clone.scrollWidth);
      const height=Math.ceil(clone.scrollHeight);

      const canvas=await html2canvas(clone,{
        backgroundColor:"#ffffff",
        scale:1.15,
        useCORS:true,
        logging:false,
        width,
        height,
        windowWidth:width+100,
        windowHeight:height+100,
        scrollX:0,
        scrollY:0
      });

      return {canvas,meta};
    }finally{
      clone.remove();
    }
  }finally{
    if(state.mainDt && previousLen!==null){
      state.mainDt.page.len(previousLen).draw(false);
      state.mainDt.page(previousPage).draw(false);
    }
  }
}

async function downloadStandardVisualImage(){
  const {canvas,meta}=await renderStandardExportCanvas();
  const a=document.createElement("a");
  a.download=safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".png";
  a.href=canvas.toDataURL("image/png");
  a.click();
}

async function downloadStandardVisualPdf(){
  const {canvas,meta}=await renderStandardExportCanvas();

  const pageW=841.89;
  const pageH=595.28;
  const margin=18;
  const usableW=pageW-margin*2;
  const usableH=pageH-margin*2;
  const pxPerPt=canvas.width/usableW;
  const slicePx=Math.max(1,Math.floor(usableH*pxPerPt));

  const content=[];
  let y=0;

  while(y<canvas.height){
    const h=Math.min(slicePx,canvas.height-y);
    const slice=document.createElement("canvas");
    slice.width=canvas.width;
    slice.height=h;

    const ctx=slice.getContext("2d");
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,slice.width,slice.height);
    ctx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);

    if(content.length) content.push({text:"",pageBreak:"before"});
    content.push({
      image:slice.toDataURL("image/png"),
      width:usableW
    });

    y+=h;
  }

  pdfMake.createPdf({
    pageSize:"A4",
    pageOrientation:"landscape",
    pageMargins:[margin,margin,margin,margin],
    content,
    info:{
      title:`${meta.source} - ${viewTitle()}`,
      subject:`Download ${meta.dateText} ${meta.timeText}`
    }
  }).download(
    safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".pdf"
  );
}

function getDownloadMeta(){
  const now=new Date();
  const source=state.source==="asem"?"Angka Sementara":"Angka Final Inflasi";
  const sourcePeriod=state.source==="asem"?(document.getElementById("dataUpdatedAt")?.textContent||"Belum diatur"):"";
  const dateText=now.toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"});
  const timeText=now.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).replace(/\./g,":");
  const fileStamp=now.getFullYear()+String(now.getMonth()+1).padStart(2,"0")+String(now.getDate()).padStart(2,"0")+"_"+String(now.getHours()).padStart(2,"0")+String(now.getMinutes()).padStart(2,"0")+String(now.getSeconds()).padStart(2,"0");
  return {source,sourcePeriod,dateText,timeText,fileStamp};
}

function buildCommodityExportClone(){
  const meta=getDownloadMeta();
  const sourceEl=document.getElementById("commoditySection");
  const clone=sourceEl.cloneNode(true);
  clone.id="commodityExportClone";clone.classList.remove("hidden");
  clone.style.width="1400px";clone.style.maxWidth="1400px";clone.style.margin="0";clone.style.padding="24px";clone.style.background="#f4f7fb";
  clone.querySelector(".commodity-downloads")?.remove();
  clone.querySelector(".commodity-search-wrap")?.remove();
  const header=document.createElement("div");
  header.className="export-report-header";
  header.innerHTML=`<div class="export-brand-badge">IF</div><div class="export-head-copy"><div class="export-kicker">DASHBOARD MONITORING INFLASI</div><div class="export-main-title">${escapeHtml(viewTitle())}</div><div class="export-subtitle">${escapeHtml(meta.source)}${meta.sourcePeriod ? ` • Data per ${escapeHtml(meta.sourcePeriod)}` : ""} • Tahun ${escapeHtml(valueOf("filterYear"))} • Bulan ${escapeHtml(valueOf("filterMonth"))} • Flag ${escapeHtml(valueOf("filterFlag"))}</div></div><div class="export-time-box"><span>Waktu Download</span><strong>${escapeHtml(meta.dateText)}</strong><strong>${escapeHtml(meta.timeText)}</strong></div>`;
  clone.insertBefore(header,clone.firstChild);
  const originalCities=[...document.querySelectorAll("#commodityAllCities .city-section")];
  const clonedCities=[...clone.querySelectorAll("#commodityAllCities .city-section")];
  originalCities.forEach((origCity,idx)=>{
    const cc=clonedCities[idx]; if(!cc)return;
    cc.style.display=origCity.style.display;
    const orows=[...origCity.querySelectorAll(".commodity-plain-table tbody tr")];
    const crows=[...cc.querySelectorAll(".commodity-plain-table tbody tr")];
    orows.forEach((r,i)=>{if(crows[i])crows[i].style.display=r.style.display;});
  });
  document.body.appendChild(clone);
  return {clone,meta};
}


async function renderCommodityExportImageCanvas(){
  const {clone, meta} = buildCommodityExportClone();
  try{
    // Buat semua section terlihat dan ukur tinggi aktual setelah layout selesai.
    clone.style.position = "fixed";
    clone.style.left = "-20000px";
    clone.style.top = "0";
    clone.style.width = "1400px";
    clone.style.maxWidth = "1400px";
    clone.style.height = "auto";
    clone.style.overflow = "visible";

    clone.querySelectorAll(".city-section").forEach(sec=>{
      if(sec.style.display !== "none"){
        sec.style.breakInside = "avoid";
        sec.style.pageBreakInside = "avoid";
      }
    });

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const width = Math.ceil(clone.scrollWidth);
    const height = Math.ceil(clone.scrollHeight);

    const canvas = await html2canvas(clone,{
      backgroundColor:"#f4f7fb",
      scale:1.15,
      useCORS:true,
      logging:false,
      width:width,
      height:height,
      windowWidth:width + 100,
      windowHeight:height + 100,
      scrollX:0,
      scrollY:0
    });

    return {canvas, meta};
  } finally {
    clone.remove();
  }
}

async function downloadCommodityPageImage(){
  const {canvas, meta} = await renderCommodityExportImageCanvas();

  // PNG dipakai agar tabel/tulisan tetap tajam. Seluruh konten ada dalam satu gambar panjang.
  const a = document.createElement("a");
  a.download = safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}

async function downloadCommodityPagePdf(){
  const {clone, meta} = buildCommodityExportClone();

  try{
    clone.style.position = "fixed";
    clone.style.left = "-20000px";
    clone.style.top = "0";
    clone.style.width = "1400px";
    clone.style.maxWidth = "1400px";
    clone.style.height = "auto";
    clone.style.overflow = "visible";

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Render header sekali.
    const header = clone.querySelector(".export-report-header");
    const headerCanvas = await html2canvas(header,{
      backgroundColor:"#f4f7fb",
      scale:1.25,
      useCORS:true,
      logging:false
    });

    const headerImg = headerCanvas.toDataURL("image/png");

    // Render SETIAP card kab/kota secara terpisah.
    // Dengan begitu sebuah card tidak akan pernah terpotong di batas halaman PDF.
    const sections = [...clone.querySelectorAll(".city-section")]
      .filter(sec => sec.style.display !== "none");

    const rendered = [];
    for(const sec of sections){
      const c = await html2canvas(sec,{
        backgroundColor:"#ffffff",
        scale:1.25,
        useCORS:true,
        logging:false,
        width:Math.ceil(sec.scrollWidth),
        height:Math.ceil(sec.scrollHeight)
      });
      rendered.push({
        image:c.toDataURL("image/png"),
        width:c.width,
        height:c.height
      });
    }

    const pageW = 841.89;   // A4 landscape pt
    const pageH = 595.28;
    const margin = 18;
    const usableW = pageW - margin*2;
    const usableH = pageH - margin*2;

    // Header akan diulang setiap halaman.
    const headerRatio = headerCanvas.height / headerCanvas.width;
    const headerHeightPt = usableW * headerRatio;
    const gap = 10;
    const cardAreaH = usableH - headerHeightPt - gap;

    const content = [];
    let firstPage = true;

    for(const item of rendered){
      // Ukuran card diperkecil proporsional bila lebih tinggi dari area halaman.
      // Tidak di-crop: seluruh card tetap terlihat.
      let cardW = usableW;
      let cardH = cardW * (item.height / item.width);

      if(cardH > cardAreaH){
        const scale = cardAreaH / cardH;
        cardH *= scale;
        cardW *= scale;
      }

      if(!firstPage){
        content.push({text:"",pageBreak:"before"});
      }

      content.push({
        image:headerImg,
        width:usableW,
        margin:[0,0,0,gap]
      });

      content.push({
        image:item.image,
        width:cardW,
        alignment:"center",
        margin:[0,0,0,0]
      });

      firstPage = false;
    }

    // Fallback kalau hasil search membuat semua kota tersembunyi.
    if(!rendered.length){
      content.push({
        image:headerImg,
        width:usableW,
        margin:[0,0,0,12]
      });
      content.push({
        text:"Tidak ada data yang sesuai dengan pencarian.",
        alignment:"center",
        color:"#718096",
        margin:[0,30,0,0]
      });
    }

    pdfMake.createPdf({
      pageSize:"A4",
      pageOrientation:"landscape",
      pageMargins:[margin,margin,margin,margin],
      content,
      info:{
        title:`${meta.source} - ${viewTitle()}`,
        subject:`Download ${meta.dateText} ${meta.timeText}`
      }
    }).download(
      safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".pdf"
    );
  } finally {
    clone.remove();
  }
}

function commodityFlatRows(){
  const rows=[];
  (state.commodityData?.cities||[]).forEach(city=>{
    (city.lowest||[]).forEach(r=>rows.push([city.code,city.name,"Terendah",r[0],r[1],r[2],round2(r[3])]));
    (city.highest||[]).forEach(r=>rows.push([city.code,city.name,"Tertinggi",r[0],r[1],r[2],round2(r[3])]));
  });
  return rows;
}

function downloadCommodityCsv(){
  const meta=getDownloadMeta(),rows=commodityFlatRows();
  const all=[["Jenis Data",meta.source],["Data Per",meta.sourcePeriod||"-"],["Menu",viewTitle()],["Tahun",valueOf("filterYear")],["Bulan",valueOf("filterMonth")],["Flag",valueOf("filterFlag")],["Tanggal Download",meta.dateText],["Jam Download",meta.timeText],[],["Kode Kota","Nama Kota","Kelompok","No","Kode Komoditas","Nama Komoditas","Andil"],...rows];
  const csv=all.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}),a=document.createElement("a"),url=URL.createObjectURL(blob);
  a.href=url;a.download=safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}

function downloadCommodityWorkbook(){
  const meta=getDownloadMeta(),rows=commodityFlatRows();
  if(!rows.length){alert("Data komoditas belum tersedia.");return;}
  const wb=XLSX.utils.book_new();
  const summary=[["JENIS DATA",meta.source],["DATA PER",meta.sourcePeriod||"-"],["MENU",viewTitle()],["TAHUN",valueOf("filterYear")],["BULAN",valueOf("filterMonth")],["FLAG",valueOf("filterFlag")],["TANGGAL DOWNLOAD",meta.dateText],["JAM DOWNLOAD",meta.timeText],[],["Kode Kota","Nama Kota","Kelompok","No","Kode Komoditas","Nama Komoditas","Andil"],...rows];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"Semua KabKota");
  (state.commodityData?.cities||[]).forEach(city=>{
    const arr=[[meta.source],[`Download: ${meta.dateText}, ${meta.timeText}`],[`${city.code} - ${city.name}`],[],["ANDIL TERENDAH"],["No","Kode Komoditas","Nama Komoditas","Andil"],...(city.lowest||[]).map(r=>[r[0],r[1],r[2],round2(r[3])]),[],["ANDIL TERTINGGI"],["No","Kode Komoditas","Nama Komoditas","Andil"],...(city.highest||[]).map(r=>[r[0],r[1],r[2],round2(r[3])])];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(arr),String(city.code).substring(0,31));
  });
  XLSX.writeFile(wb,safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".xlsx");
}

function safeName(v){return String(v||"export").replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim();}
function round2(v){const n=Number(v);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:v;}

