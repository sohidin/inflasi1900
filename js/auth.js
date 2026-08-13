document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("inflasi_token")) {
    location.href = "dashboard.html";
    return;
  }

  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    message.textContent = "Memeriksa...";

    try {
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value;
      const result = await Api.login(username, password);

      sessionStorage.setItem("inflasi_token", result.token);
      location.href = "dashboard.html";
    } catch (err) {
      message.textContent = err.message;
    }
  });
});