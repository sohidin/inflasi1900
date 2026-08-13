async function exportElementAsImage(elementId, fileName) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true
  });

  const link = document.createElement("a");
  link.download = `${sanitizeFileName(fileName)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function sanitizeFileName(name) {
  return String(name || "export")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}