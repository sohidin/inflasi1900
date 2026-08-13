const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT SETELAH DEPLOY
  API_URL: "https://script.google.com/macros/s/AKfycbwiE8hcejiN52plCj8hHNjOb3j0tmxD_5-17YWf7rZkmiGVgvVY5RRNUIeJtpSfPQcX/exec"
};

const state = {
  source: "asem",
  period: "mtm",
  view: "inflasi",
  filters: null,
  mainDt: null,
  commodityData: null,
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
      state.source = btn.dataset.source;
      state.period = btn.dataset.period || "";
      state.view = btn.dataset.view;
      await loadSourceFilters();
      await loadUpdatedAt();
      await loadCurrentView();
    });
  });
}
function bindAppEvents(){
  document.getElementById("applyFilterBtn").addEventListener("click", loadCurrentView);
  document.getElementById("filterYear").addEventListener("change", updateMonths);
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
  showLoading(true);
  try{
    state.filters = await Api.request({action:"filters", source:state.source});
    fillSelect("filterYear", state.filters.years);
    updateMonths();
    fillSelect("filterFlag", state.filters.flags);

  }catch(err){ showError(err.message); }
  finally{ showLoading(false); }
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
    if(state.view === "headline"){
      r = await Api.request({action:"headline", ...args});
      renderStandard(r);
    }else if(state.view === "komoditas"){
      r = await Api.request({
        action:"commodity", ...args,
        mode:valueOf("commodityMode")
      });
      renderCommodity(r);
    }else{
      r = await Api.request({action:"table", view:state.view, ...args});
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
  table.innerHTML = "<thead><tr></tr></thead><tbody></tbody>";
  const tr = table.querySelector("thead tr");
  r.columns.forEach(c => { const th=document.createElement("th"); th.textContent=c; tr.appendChild(th); });

  document.getElementById("tableTitle").textContent = r.title || viewTitle();
  document.getElementById("tableInfo").textContent = r.info || "";

  state.mainDt = $("#mainTable").DataTable({
    data:r.rows,
    columns:r.columns.map((c,i)=>({data:i,title:c,render:renderCell})),
    scrollX:true,pageLength:25,order:[],
    dom:"Bfrtip",
    buttons:[
      {extend:"excelHtml5",title:exportTitle()},
      {extend:"csvHtml5",title:exportTitle()},
      {extend:"pdfHtml5",title:exportTitle(),orientation:"landscape",pageSize:"A4"},
      {text:"Image",action:()=>exportImage("standardTableSection")}
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

function renderCell(data,type){
  if(type!=="display") return data;
  if(typeof data==="number"){
    const cls=data>0?"positive":data<0?"negative":"";
    return `<span class="${cls}">${data.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>`;
  }
  return data ?? "";
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
  if(state.source!=="asem") return;
  try{
    const r=await Api.request({action:"getUpdatedAt"});
    document.getElementById("dataUpdatedAt").textContent=r.display||"Belum diatur";
    document.getElementById("updatedAtInput").value=r.inputValue||"";
  }catch(_){}
}
async function saveUpdatedAt(){
  try{
    const value=document.getElementById("updatedAtInput").value;
    const token=sessionStorage.getItem("inflasi_token");
    const r=await Api.request({action:"setUpdatedAt",value,token});
    document.getElementById("dataUpdatedAt").textContent=r.display;
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

function getDownloadMeta(){
  const now=new Date();
  const source=state.source==="asem"?"Angka Sementara":"Angka Final Inflasi";
  const dateText=now.toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"});
  const timeText=now.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).replace(/\./g,":");
  const fileStamp=now.getFullYear()+String(now.getMonth()+1).padStart(2,"0")+String(now.getDate()).padStart(2,"0")+"_"+
    String(now.getHours()).padStart(2,"0")+String(now.getMinutes()).padStart(2,"0")+String(now.getSeconds()).padStart(2,"0");
  return {source,dateText,timeText,fileStamp};
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
  header.innerHTML=`<div class="export-brand-badge">IF</div><div class="export-head-copy"><div class="export-kicker">DASHBOARD MONITORING INFLASI</div><div class="export-main-title">${escapeHtml(viewTitle())}</div><div class="export-subtitle">${escapeHtml(meta.source)} • Tahun ${escapeHtml(valueOf("filterYear"))} • Bulan ${escapeHtml(valueOf("filterMonth"))} • Flag ${escapeHtml(valueOf("filterFlag"))}</div></div><div class="export-time-box"><span>Waktu Download</span><strong>${escapeHtml(meta.dateText)}</strong><strong>${escapeHtml(meta.timeText)}</strong></div>`;
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

async function renderCommodityExportCanvas(){
  const {clone,meta}=buildCommodityExportClone();
  try{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const canvas=await html2canvas(clone,{backgroundColor:"#f4f7fb",scale:1.35,useCORS:true,logging:false,width:clone.scrollWidth,height:clone.scrollHeight,windowWidth:1500,scrollX:0,scrollY:0});
    return {canvas,meta};
  }finally{clone.remove();}
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
  const all=[["Jenis Data",meta.source],["Menu",viewTitle()],["Tahun",valueOf("filterYear")],["Bulan",valueOf("filterMonth")],["Flag",valueOf("filterFlag")],["Tanggal Download",meta.dateText],["Jam Download",meta.timeText],[],["Kode Kota","Nama Kota","Kelompok","No","Kode Komoditas","Nama Komoditas","Andil"],...rows];
  const csv=all.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}),a=document.createElement("a"),url=URL.createObjectURL(blob);
  a.href=url;a.download=safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}

function downloadCommodityWorkbook(){
  const meta=getDownloadMeta(),rows=commodityFlatRows();
  if(!rows.length){alert("Data komoditas belum tersedia.");return;}
  const wb=XLSX.utils.book_new();
  const summary=[["JENIS DATA",meta.source],["MENU",viewTitle()],["TAHUN",valueOf("filterYear")],["BULAN",valueOf("filterMonth")],["FLAG",valueOf("filterFlag")],["TANGGAL DOWNLOAD",meta.dateText],["JAM DOWNLOAD",meta.timeText],[],["Kode Kota","Nama Kota","Kelompok","No","Kode Komoditas","Nama Komoditas","Andil"],...rows];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"Semua KabKota");
  (state.commodityData?.cities||[]).forEach(city=>{
    const arr=[[meta.source],[`Download: ${meta.dateText}, ${meta.timeText}`],[`${city.code} - ${city.name}`],[],["ANDIL TERENDAH"],["No","Kode Komoditas","Nama Komoditas","Andil"],...(city.lowest||[]).map(r=>[r[0],r[1],r[2],round2(r[3])]),[],["ANDIL TERTINGGI"],["No","Kode Komoditas","Nama Komoditas","Andil"],...(city.highest||[]).map(r=>[r[0],r[1],r[2],round2(r[3])])];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(arr),String(city.code).substring(0,31));
  });
  XLSX.writeFile(wb,safeName(`${meta.source}-${viewTitle()}-${meta.fileStamp}`)+".xlsx");
}

function safeName(v){return String(v||"export").replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim();}
function round2(v){const n=Number(v);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:v;}

