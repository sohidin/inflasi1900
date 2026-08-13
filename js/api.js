const Api = {
  async request(params = {}) {
    const base = window.APP_CONFIG.API_URL;
    if (!base || base.includes("PASTE_APPS_SCRIPT")) {
      throw new Error("API_URL belum diisi pada js/config.js");
    }

    const url = new URL(base);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });

    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const json = await response.json();

    if (!json.ok) throw new Error(json.message || "Terjadi kesalahan pada server.");
    return json;
  },

  login(username, password) {
    return this.request({ action: "login", username, password });
  },

  filters(source) {
    return this.request({ action: "filters", source });
  },

  table({ source, period, view, year, month, flag }) {
    return this.request({
      action: "table", source, period, view, year, month, flag
    });
  },

  headline({ source, year, month }) {
    return this.request({
      action: "headline", source, year, month
    });
  },

  commodity({ source, period, year, month, flag, city, mode }) {
    return this.request({
      action: "commodity", source, period, year, month, flag, city, mode
    });
  },

  getUpdatedAt() {
    return this.request({ action: "getUpdatedAt" });
  },

  setUpdatedAt(value, token) {
    return this.request({ action: "setUpdatedAt", value, token });
  }
};