const APP_CONFIG = {
  SPREADSHEET_ID: '1vtkkNXmAoejS6R0BNsuE3r6EdOySHc-nnoVNsg0Z-CE',
  DATA_SHEET_NAME: 'Data', // Ganti jika nama tab data berbeda
  APP_TITLE: 'Dashboard Andil Inflasi',
  REGION_CODES: ['1902', '1903', '1906', '1971', '19'],
  DEFAULT_USERNAME: 'harga1900',
  DEFAULT_PASSWORD: 'harga1900',
  SESSION_SECONDS: 21600, // 6 jam
  AUTO_REFRESH_SECONDS: 60
};

/**
 * Web app entry point.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Jalankan sekali dari editor Apps Script untuk membuat konfigurasi awal.
 */
function setupApplication() {
  const props = PropertiesService.getScriptProperties();
  // Login awal ditetapkan ulang setiap kali fungsi setup dijalankan.
  // Setelah aplikasi aktif, login dapat diubah dari menu Pengaturan.
  props.setProperty('APP_USERNAME', APP_CONFIG.DEFAULT_USERNAME);
  props.setProperty('APP_PASSWORD', APP_CONFIG.DEFAULT_PASSWORD);

  if (!props.getProperty('DATA_CONDITION')) {
    props.setProperty('DATA_CONDITION', '27 Juli 2026 pukul 08.00 WIB');
    props.setProperty('DATA_CONDITION_VALUE', '2026-07-27T08:00');
  }

  if (!props.getProperty('DATA_STATUS')) {
    props.setProperty('DATA_STATUS', 'Angka Sementara');
  }

  // Memastikan spreadsheet dapat dibuka dan tab data tersedia.
  const sheet = getDataSheet_();
  return {
    success: true,
    message: 'Konfigurasi awal berhasil.',
    spreadsheet: sheet.getParent().getName(),
    sheet: sheet.getName()
  };
}

/**
 * Login server-side dan membuat token sesi sementara.
 */
function login(username, password) {
  username = String(username || '').trim();
  password = String(password || '');

  const props = PropertiesService.getScriptProperties();
  const validUser = props.getProperty('APP_USERNAME') || APP_CONFIG.DEFAULT_USERNAME;
  const validPassword = props.getProperty('APP_PASSWORD') || APP_CONFIG.DEFAULT_PASSWORD;

  if (username !== validUser || password !== validPassword) {
    return { success: false, message: 'Username atau password salah.' };
  }

  const token = Utilities.getUuid();
  const session = {
    username: username,
    loginAt: new Date().toISOString()
  };
  CacheService.getScriptCache().put(
    'SESSION_' + token,
    JSON.stringify(session),
    APP_CONFIG.SESSION_SECONDS
  );

  return {
    success: true,
    token: token,
    appTitle: APP_CONFIG.APP_TITLE,
    condition: getDataCondition_()
  };
}

function validateSession(token) {
  const session = getSession_(token);
  return session
    ? { success: true, session: session, condition: getDataCondition_() }
    : { success: false, message: 'Sesi telah berakhir. Silakan login kembali.' };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('SESSION_' + token);
  return { success: true };
}

/**
 * Mengambil seluruh data awal yang dibutuhkan dashboard.
 */
function getDashboardData(token) {
  requireSession_(token);
  const records = getRecords_();
  const flag3 = records.filter(r => normalizeFlag_(r.flag) === '3');
  const flag0 = records.filter(r => normalizeFlag_(r.flag) === '0');

  const regions = buildRegionMap_(records);
  const commoditySet = {};
  flag3.forEach(r => {
    if (r.commodityCode || r.commodityName) {
      commoditySet[String(r.commodityCode) + '|' + String(r.commodityName)] = true;
    }
  });

  return {
    condition: getDataCondition_(),
    lastUpdated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMMM yyyy HH:mm'),
    statistics: {
      totalRows: records.length,
      flag3Rows: flag3.length,
      flag0Rows: flag0.length,
      commodities: Object.keys(commoditySet).length,
      regions: APP_CONFIG.REGION_CODES.length
    },
    regions: APP_CONFIG.REGION_CODES.map(code => ({
      code: code,
      name: regions[code] || code
    }))
  };
}

function getPivotData(token, metric) {
  requireSession_(token);
  const metricConfig = getMetricConfig_(metric);
  const records = getRecords_().filter(r => normalizeFlag_(r.flag) === '3');
  const regions = buildRegionMap_(records);
  const map = {};

  records.forEach(r => {
    const regionCode = normalizeCode_(r.regionCode);
    if (APP_CONFIG.REGION_CODES.indexOf(regionCode) === -1) return;

    const commodityCode = cleanText_(r.commodityCode);
    const commodityName = cleanText_(r.commodityName);
    if (!commodityCode && !commodityName) return;

    const key = commodityCode + '|' + commodityName;
    if (!map[key]) {
      map[key] = {
        commodityCode: commodityCode,
        commodityName: commodityName,
        values: {}
      };
    }
    map[key].values[regionCode] = toNumberOrNull_(r[metricConfig.field]);
  });

  const rows = Object.keys(map)
    .map(key => map[key])
    .sort((a, b) => {
      const byCode = naturalCompare_(a.commodityCode, b.commodityCode);
      return byCode !== 0 ? byCode : naturalCompare_(a.commodityName, b.commodityName);
    });

  return {
    metric: metricConfig.label,
    condition: getDataCondition_(),
    title: 'Andil ' + metricConfig.label + ' Kabupaten/Kota',
    regions: APP_CONFIG.REGION_CODES.map(code => ({
      code: code,
      name: regions[code] || code
    })),
    rows: rows
  };
}


/**
 * Tabel Inflasi per komoditas dan wilayah.
 * Sumber kolom:
 * C kode wilayah, E kode komoditas, F nama komoditas,
 * I Inflasi MtM, J Inflasi YtD, K Inflasi YoY, dan kolom G/Flag sebagai filter.
 */
function getInflationPivotData(token, metric, selectedFlag) {
  requireSession_(token);

  const metricConfig = getInflationMetricConfig_(metric);
  const allRecords = getRecords_();
  const availableFlags = getAvailableFlags_(allRecords);

  selectedFlag = String(
    selectedFlag === undefined || selectedFlag === null
      ? ''
      : selectedFlag
  ).trim();

  // Default menampilkan seluruh Flag.
  if (!selectedFlag) {
    selectedFlag = '__ALL__';
  }

  const showAllFlags = selectedFlag === '__ALL__';

  const records = showAllFlags
    ? allRecords
    : allRecords.filter(
        r => normalizeFlag_(r.flag) === normalizeFlag_(selectedFlag)
      );

  const regions = buildRegionMap_(allRecords);
  const map = {};

  records.forEach(r => {
    const regionCode = normalizeCode_(r.regionCode);
    if (APP_CONFIG.REGION_CODES.indexOf(regionCode) === -1) return;

    const commodityCode = cleanText_(r.commodityCode);
    const commodityName = cleanText_(r.commodityName);
    if (!commodityCode && !commodityName) return;

    const key = commodityCode + '|' + commodityName;

    if (!map[key]) {
      map[key] = {
        commodityCode: commodityCode,
        commodityName: commodityName,
        values: {}
      };
    }

    const value = toNumberOrNull_(r[metricConfig.field]);

    // Nilai nonkosong terakhir dipakai bila terdapat duplikasi.
    if (value !== null) {
      map[key].values[regionCode] = value;
    } else if (!(regionCode in map[key].values)) {
      map[key].values[regionCode] = null;
    }
  });

  const rows = Object.keys(map)
    .map(key => map[key])
    .sort((a, b) => {
      const byCode = naturalCompare_(a.commodityCode, b.commodityCode);
      return byCode !== 0
        ? byCode
        : naturalCompare_(a.commodityName, b.commodityName);
    });

  return {
    metric: metricConfig.label,
    metricKey: String(metric || '').toLowerCase(),
    condition: getDataCondition_(),
    title: 'Inflasi ' + metricConfig.label + ' Kabupaten/Kota',
    selectedFlag: selectedFlag,
    selectedFlagLabel: selectedFlag === '__ALL__'
      ? 'Semua Flag'
      : 'Flag ' + selectedFlag,
    availableFlags: availableFlags,
    regions: APP_CONFIG.REGION_CODES.map(code => ({
      code: code,
      name: regions[code] || code
    })),
    rows: rows
  };
}

function getTopBottomData(token, metric) {
  requireSession_(token);
  const metricConfig = getMetricConfig_(metric);
  const records = getRecords_().filter(r => normalizeFlag_(r.flag) === '3');
  const regions = buildRegionMap_(records);

  const result = APP_CONFIG.REGION_CODES.map(code => {
    const items = records
      .filter(r => normalizeCode_(r.regionCode) === code)
      .map(r => ({
        commodityCode: cleanText_(r.commodityCode),
        commodityName: cleanText_(r.commodityName),
        value: toNumberOrNull_(r[metricConfig.field])
      }))
      .filter(r => r.commodityName && r.value !== null);

    // Menggabungkan komoditas duplikat pada wilayah yang sama.
    const unique = {};
    items.forEach(item => {
      const key = item.commodityCode + '|' + item.commodityName;
      unique[key] = item;
    });
    const uniqueItems = Object.keys(unique).map(key => unique[key]);

    const highest = uniqueItems.slice().sort((a, b) => b.value - a.value).slice(0, 10);
    const lowest = uniqueItems.slice().sort((a, b) => a.value - b.value).slice(0, 10);

    return {
      code: code,
      name: regions[code] || code,
      highest: highest,
      lowest: lowest
    };
  });

  return {
    metric: metricConfig.label,
    condition: getDataCondition_(),
    regions: result
  };
}

function getRecapData(token) {
  requireSession_(token);
  const records = getRecords_().filter(r => normalizeFlag_(r.flag) === '0');
  const regionMap = buildRegionMap_(getRecords_());

  const byRegion = {};
  records.forEach(r => {
    const code = normalizeCode_(r.regionCode);
    if (APP_CONFIG.REGION_CODES.indexOf(code) === -1) return;

    if (!byRegion[code]) {
      byRegion[code] = {
        code: code,
        name: cleanText_(r.regionName) || regionMap[code] || code,
        mtm: null,
        ytd: null,
        yoy: null
      };
    }

    // Nilai nonkosong terakhir dipakai jika ada lebih dari satu baris flag 0.
    const mtm = toNumberOrNull_(r.inflationMtm);
    const ytd = toNumberOrNull_(r.inflationYtd);
    const yoy = toNumberOrNull_(r.inflationYoy);
    if (mtm !== null) byRegion[code].mtm = mtm;
    if (ytd !== null) byRegion[code].ytd = ytd;
    if (yoy !== null) byRegion[code].yoy = yoy;
  });

  const rows = APP_CONFIG.REGION_CODES.map(code => byRegion[code] || {
    code: code,
    name: regionMap[code] || code,
    mtm: null,
    ytd: null,
    yoy: null
  });

  return {
    condition: getDataCondition_(),
    rows: rows,
    extrema: {
      mtm: getExtrema_(rows, 'mtm'),
      ytd: getExtrema_(rows, 'ytd'),
      yoy: getExtrema_(rows, 'yoy')
    }
  };
}

/**
 * Mengembalikan URL tab raw data yang dipakai aplikasi.
 * URL dibuat di server agar ID spreadsheet tetap terpusat di Code.gs.
 */
function getRawDataUrl(token) {
  requireSession_(token);

  const spreadsheet = getSpreadsheet_();
  const sheet = getDataSheet_();

  return {
    success: true,
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    url: spreadsheet.getUrl() + '#gid=' + sheet.getSheetId()
  };
}

function getSettings(token) {
  requireSession_(token);
  return {
    condition: getDataCondition_(),
    conditionValue: getDataConditionValue_(),
    dataStatus: getDataStatus_(),
    dataConditionText: getDataConditionText_(),
    dataSheetName: getDataSheet_().getName(),
    spreadsheetName: getSpreadsheet_().getName(),
    autoRefreshSeconds: APP_CONFIG.AUTO_REFRESH_SECONDS
  };
}

function saveDataCondition(token, dateTimeValue, dataStatus) {
  requireSession_(token);

  dateTimeValue = String(dateTimeValue || '').trim();
  dataStatus = normalizeDataStatus_(dataStatus);

  if (!dateTimeValue) {
    throw new Error('Tanggal dan jam kondisi data harus dipilih.');
  }

  const parsedDate = parseDateTimeLocal_(dateTimeValue);
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    throw new Error('Format tanggal dan jam tidak valid.');
  }

  const formattedCondition = formatDataCondition_(parsedDate);
  const props = PropertiesService.getScriptProperties();

  props.setProperty('DATA_CONDITION', formattedCondition);
  props.setProperty('DATA_CONDITION_VALUE', dateTimeValue);
  props.setProperty('DATA_STATUS', dataStatus);

  return {
    success: true,
    condition: getDataCondition_(),
    conditionValue: dateTimeValue,
    dataStatus: dataStatus,
    dataConditionText: formattedCondition
  };
}

function changeLogin(token, username, password) {
  requireSession_(token);
  username = String(username || '').trim();
  password = String(password || '');
  if (username.length < 4) throw new Error('Username minimal 4 karakter.');
  if (password.length < 4) throw new Error('Password minimal 4 karakter.');

  const props = PropertiesService.getScriptProperties();
  props.setProperty('APP_USERNAME', username);
  props.setProperty('APP_PASSWORD', password);
  return { success: true, message: 'Login berhasil diperbarui.' };
}

/** -------------------- Helper internal -------------------- */

function getSpreadsheet_() {
  return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
}

function getDataSheet_() {
  const ss = getSpreadsheet_();
  const requested = ss.getSheetByName(APP_CONFIG.DATA_SHEET_NAME);
  if (requested) return requested;

  const sheets = ss.getSheets();
  if (!sheets.length) throw new Error('Spreadsheet tidak memiliki sheet.');
  return sheets[0];
}

/**
 * Membaca kolom berdasarkan posisi yang dijelaskan:
 * C kode wilayah, D nama wilayah, E kode komoditas, F nama komoditas,
 * I inflasi MtM, J inflasi YtD, K inflasi YoY,
 * L andil MtM, M andil YtD, N andil YoY.
 * Kolom Flag dicari dari nama header agar tidak bergantung pada posisi.
 */
function getRecords_() {
  const sheet = getDataSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => normalizeHeader_(h));
  const flagIndex = findHeaderIndex_(headers, ['flag', 'kode flag', 'flagging']);
  if (flagIndex === -1) {
    throw new Error('Kolom "Flag" tidak ditemukan pada baris header sheet ' + sheet.getName() + '.');
  }

  return values.slice(1).map((row, i) => ({
    sheetRow: i + 2,
    flag: row[flagIndex],
    regionCode: row[2],   // C
    regionName: row[3],   // D
    commodityCode: row[4],// E
    commodityName: row[5],// F
    inflationMtm: row[8], // I
    inflationYtd: row[9], // J
    inflationYoy: row[10],// K
    andilMtm: row[11],    // L
    andilYtd: row[12],    // M
    andilYoy: row[13]     // N
  })).filter(r => {
    return Object.keys(r).some(k => k !== 'sheetRow' && String(r[k] || '').trim() !== '');
  });
}

function getMetricConfig_(metric) {
  const configs = {
    mtm: { label: 'MtM', field: 'andilMtm' },
    ytd: { label: 'YtD', field: 'andilYtd' },
    yoy: { label: 'YoY', field: 'andilYoy' }
  };
  const key = String(metric || '').toLowerCase();
  if (!configs[key]) throw new Error('Metrik tidak dikenali.');
  return configs[key];
}


function getInflationMetricConfig_(metric) {
  const configs = {
    mtm: { label: 'MtM', field: 'inflationMtm' },
    ytd: { label: 'YtD', field: 'inflationYtd' },
    yoy: { label: 'YoY', field: 'inflationYoy' }
  };

  const key = String(metric || '').toLowerCase();
  if (!configs[key]) throw new Error('Metrik inflasi tidak dikenali.');
  return configs[key];
}

function getAvailableFlags_(records) {
  const map = {};

  (records || []).forEach(r => {
    const value = normalizeFlag_(r.flag);
    if (value !== '') map[value] = true;
  });

  return Object.keys(map).sort(naturalCompare_);
}

function buildRegionMap_(records) {
  const map = {};
  records.forEach(r => {
    const code = normalizeCode_(r.regionCode);
    const name = cleanText_(r.regionName);
    if (code && name) map[code] = name;
  });
  return map;
}

function getDataCondition_() {
  return getDataStatus_() + ' — ' + getDataConditionText_();
}

function getDataConditionText_() {
  return PropertiesService
    .getScriptProperties()
    .getProperty('DATA_CONDITION') || '27 Juli 2026 pukul 08.00 WIB';
}

function getDataStatus_() {
  return normalizeDataStatus_(
    PropertiesService
      .getScriptProperties()
      .getProperty('DATA_STATUS') || 'Angka Sementara'
  );
}

function normalizeDataStatus_(value) {
  const status = String(value || '').trim().toLowerCase();

  if (status === 'angka tetap') {
    return 'Angka Tetap';
  }

  return 'Angka Sementara';
}


function getDataConditionValue_() {
  const props = PropertiesService.getScriptProperties();
  const savedValue = props.getProperty('DATA_CONDITION_VALUE');

  if (savedValue) return savedValue;

  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd'T'HH:mm"
  );
}

function parseDateTimeLocal_(value) {
  const match = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );

  if (!match) return null;

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0
  );
}

function formatDataCondition_(date) {
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April',
    'Mei', 'Juni', 'Juli', 'Agustus',
    'September', 'Oktober', 'November', 'Desember'
  ];

  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return day + ' ' + month + ' ' + year +
    ' pukul ' + hour + '.' + minute + ' WIB';
}

function getSession_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('SESSION_' + token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function requireSession_(token) {
  const session = getSession_(token);
  if (!session) throw new Error('SESSION_EXPIRED');
  return session;
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function findHeaderIndex_(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = normalizeHeader_(candidates[i]);
    const idx = headers.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeFlag_(value) {
  return String(value === null || value === undefined ? '' : value).trim().replace(/\.0+$/, '');
}

function normalizeCode_(value) {
  return String(value === null || value === undefined ? '' : value).trim().replace(/\.0+$/, '');
}

function cleanText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function toNumberOrNull_(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  let text = String(value).trim().replace(/\s/g, '').replace(/%/g, '');

  // Mendukung format Indonesia (1.234,56) dan format umum (1234.56).
  if (text.indexOf(',') !== -1 && text.indexOf('.') !== -1) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (text.indexOf(',') !== -1) {
    text = text.replace(',', '.');
  }

  const num = Number(text);
  return isFinite(num) ? num : null;
}

function getExtrema_(rows, field) {
  const values = rows.map(r => r[field]).filter(v => v !== null && isFinite(v));
  if (!values.length) return { max: null, min: null };
  return { max: Math.max.apply(null, values), min: Math.min.apply(null, values) };
}

function naturalCompare_(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base'
  });
}

/**
 * Mengambil seluruh dataset untuk ekspor satu workbook.
 * Setiap properti akan dijadikan sheet terpisah di browser.
 */
function getAllExportData(token) {
  requireSession_(token);

  return {
    condition: getDataCondition_(),
    pivotMtm: getPivotData(token, 'mtm'),
    pivotYtd: getPivotData(token, 'ytd'),
    pivotYoy: getPivotData(token, 'yoy'),
    inflationMtm: getInflationPivotData(token, 'mtm', '__ALL__'),
    inflationYtd: getInflationPivotData(token, 'ytd', '__ALL__'),
    inflationYoy: getInflationPivotData(token, 'yoy', '__ALL__'),
    rankMtm: getTopBottomData(token, 'mtm'),
    rankYtd: getTopBottomData(token, 'ytd'),
    rankYoy: getTopBottomData(token, 'yoy'),
    recap: getRecapData(token)
  };
}
