const state = {
  source: "asem",
  period: "mtm",
  view: "inflasi",
  filters: null,
  mainDt: null,
  lowDt: null,
  highDt: null
};

const sourceLabel = s => s === "asem" ? "Angka Sementara" : "Angka Final Inflasi";
const periodLabel = p => ({mtm:"MtM", ytd:"YtD", yoy:"YoY"}[p] || "");
const viewLabel = (v,p,s) => {
  if (v === "headline") return s === "asem" ? "Inflasi Asem" : "Inflasi Final";
  if (v === "komoditas") return `Komoditas Andil ${periodLabel(p)}`;
  return `${v === "andil" ? "Andil" : "Inflasi"} ${periodLabel(p)}`;
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!sessionStorage.getItem("inflasi_token")) {
    location.href = "index.html";
    return;
  }

  bindEvents();
  await loadSourceFilters();
  await loadUpdatedAt();
  await loadCurrentView();
});

function bindEvents() {
  document.querySelectorAll("#sidebarNav button[data-view]").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#sidebarNav button").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");

      state.source = btn.dataset.source;
      state.period = btn.dataset.period || "";
      state.view = btn.dataset.view;

      await loadSourceFilters();
      await loadUpdatedAt();
      await loadCurrentView();
    });
  });

  document.getElementById("applyFilterBtn").addEventListener("click", loadCurrentView);
  document.getElementById("resetFilterBtn").addEventListener("click", async () => {
    await loadSourceFilters(true);
    await loadCurrentView();
  });

  document.getElementById("filterYear").addEventListener("change", updateDependentMonths);

  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("inflasi_token");
    location.href = "index.html";
  });

  document.getElementById("editUpdatedAtBtn").addEventListener("click", openUpdatedAtModal);
  document.getElementById("cancelUpdatedAtBtn").addEventListener("click", closeUpdatedAtModal);
  document.getElementById("saveUpdatedAtBtn").addEventListener("click", saveUpdatedAt);
}

async function loadSourceFilters(reset = false) {
  showLoading(true);
  clearError();
  try {
    state.filters = await Api.filters(state.source);

    fillSelect("filterYear", state.filters.years, reset ? "" : currentValue("filterYear"), false);
    updateDependentMonths();

    fillSelect("filterFlag", state.filters.flags, reset ? "" : currentValue("filterFlag"), false);
    fillSelect(
      "filterCity",
      state.filters.cities.map(c => ({ value: c.code, label: `${c.code} - ${c.name}` })),
      reset ? "" : currentValue("filterCity"),
      false
    );
  } catch(err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function updateDependentMonths() {
  if (!state.filters) return;
  const year = currentValue("filterYear") || state.filters.years[0];
  const months = state.filters.monthsByYear[String(year)] || state.filters.months || [];
  fillSelect("filterMonth", months, currentValue("filterMonth"), false);
}

function fillSelect(id, items, selected, includeAll = false) {
  const el = document.getElementById(id);
  if (!el) return;

  const arr = items || [];
  el.innerHTML = "";

  if (includeAll) el.add(new Option("Semua", ""));

  arr.forEach(item => {
    if (typeof item === "object") {
      el.add(new Option(item.label, item.value));
    } else {
      el.add(new Option(item, item));
    }
  });

  if (selected && [...el.options].some(o => String(o.value) === String(selected))) {
    el.value = selected;
  } else if (el.options.length) {
    el.selectedIndex = 0;
  }
}

function currentValue(id) {
  return document.getElementById(id)?.value || "";
}

async function loadCurrentView() {
  updateHeaderAndControls();
  showLoading(true);
  clearError();

  try {
    const args = {
      source: state.source,
      period: state.period,
      year: currentValue("filterYear"),
      month: currentValue("filterMonth"),
      flag: currentValue("filterFlag")
    };

    if (state.view === "headline") {
      const result = await Api.headline(args);
      renderStandardTable(result);
    } else if (state.view === "komoditas") {
      const result = await Api.commodity({
        ...args,
        city: currentValue("filterCity"),
        mode: currentValue("commodityMode")
      });
      renderCommodityTables(result);
    } else {
      const result = await Api.table({ ...args, view: state.view });
      renderStandardTable(result);
    }
  } catch(err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function updateHeaderAndControls() {
  document.getElementById("pageTitle").textContent = viewLabel(state.view, state.period, state.source);
  document.getElementById("pageSubtitle").textContent = sourceLabel(state.source);

  const commodity = state.view === "komoditas";
  document.querySelectorAll(".komoditas-only").forEach(el => el.style.display = commodity ? "" : "none");
  document.getElementById("cityFilterWrap").style.display = commodity ? "" : "none";

  document.getElementById("updateCard").style.display = state.source === "asem" ? "grid" : "none";
}

function destroyTable(instanceKey) {
  if (state[instanceKey]) {
    state[instanceKey].destroy();
    state[instanceKey] = null;
  }
}

function formatCell(data, type) {
  if (type !== "display") return data;
  if (typeof data === "number") {
    const cls = data > 0 ? "positive" : data < 0 ? "negative" : "";
    return `<span class="${cls}">${data.toLocaleString("id-ID",{minimumFractionDigits:0,maximumFractionDigits:4})}</span>`;
  }
  return data ?? "";
}

function renderStandardTable(result) {
  document.getElementById("standardTableSection").style.display = "";
  document.getElementById("commoditySection").style.display = "none";

  destroyTable("mainDt");

  const table = document.getElementById("mainTable");
  table.innerHTML = "<thead><tr></tr></thead><tbody></tbody>";

  const headRow = table.querySelector("thead tr");
  result.columns.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c;
    headRow.appendChild(th);
  });

  document.getElementById("tableTitle").textContent = result.title || viewLabel(state.view,state.period,state.source);
  document.getElementById("tableInfo").textContent = result.info || "";

  state.mainDt = $("#mainTable").DataTable({
    data: result.rows,
    columns: result.columns.map((c,i) => ({ title:c, data:i, render: formatCell })),
    scrollX: true,
    pageLength: 25,
    order: [],
    dom: "Bfrtip",
    buttons: [
      { extend:"excelHtml5", title: exportTitle() },
      { extend:"csvHtml5", title: exportTitle() },
      { extend:"pdfHtml5", title: exportTitle(), orientation:"landscape", pageSize:"A4" },
      { text:"Image", action: () => exportElementAsImage("standardTableSection", exportTitle()) }
    ],
    language: {
      search: "Cari:",
      lengthMenu: "Tampilkan _MENU_",
      info: "Menampilkan _START_–_END_ dari _TOTAL_ baris",
      infoEmpty: "Tidak ada data",
      zeroRecords: "Data tidak ditemukan",
      paginate: { first:"Awal", last:"Akhir", next:"Berikut", previous:"Sebelum" }
    }
  });
}

function renderCommodityTables(result) {
  document.getElementById("standardTableSection").style.display = "none";
  document.getElementById("commoditySection").style.display = "";

  renderOneCommodityTable("lowestTable", result.lowest, "lowDt");
  renderOneCommodityTable("highestTable", result.highest, "highDt");
}

function renderOneCommodityTable(id, rows, instanceKey) {
  destroyTable(instanceKey);

  const table = document.getElementById(id);
  table.innerHTML = "<thead><tr><th>No</th><th>Kode Komoditas</th><th>Nama Komoditas</th><th>Andil Inflasi</th></tr></thead><tbody></tbody>";

  state[instanceKey] = $("#" + id).DataTable({
    data: rows,
    columns: [
      { data:0 },
      { data:1 },
      { data:2 },
      { data:3, render:formatCell }
    ],
    paging: false,
    searching: true,
    order: [],
    dom: "Bfrtip",
    buttons: [
      { extend:"excelHtml5", title: exportTitle() },
      { extend:"csvHtml5", title: exportTitle() },
      { extend:"pdfHtml5", title: exportTitle(), orientation:"portrait", pageSize:"A4" },
      { text:"Image", action: () => exportElementAsImage(id, exportTitle()) }
    ],
    language: { search:"Cari:", info:"", zeroRecords:"Data tidak ditemukan" }
  });
}

function exportTitle() {
  return `${sourceLabel(state.source)} - ${viewLabel(state.view,state.period,state.source)} - ${currentValue("filterYear")}-${currentValue("filterMonth")}`;
}

function showLoading(v) {
  document.getElementById("loadingBox").style.display = v ? "" : "none";
}

function showError(msg) {
  const box = document.getElementById("errorBox");
  box.textContent = msg;
  box.style.display = "";
}

function clearError() {
  document.getElementById("errorBox").style.display = "none";
}

async function loadUpdatedAt() {
  if (state.source !== "asem") return;
  try {
    const r = await Api.getUpdatedAt();
    document.getElementById("dataUpdatedAt").textContent = r.display || "-";
    document.getElementById("updatedAtInput").value = r.inputValue || "";
  } catch(err) {
    document.getElementById("dataUpdatedAt").textContent = "-";
  }
}

function openUpdatedAtModal() {
  document.getElementById("updatedAtModal").style.display = "flex";
}

function closeUpdatedAtModal() {
  document.getElementById("updatedAtModal").style.display = "none";
}

async function saveUpdatedAt() {
  try {
    const value = document.getElementById("updatedAtInput").value;
    if (!value) throw new Error("Tanggal dan jam belum diisi.");
    const token = sessionStorage.getItem("inflasi_token");
    const r = await Api.setUpdatedAt(value, token);
    document.getElementById("dataUpdatedAt").textContent = r.display;
    closeUpdatedAtModal();
  } catch(err) {
    alert(err.message);
  }
}