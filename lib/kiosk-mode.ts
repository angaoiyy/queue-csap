// Kiosk PCs auto-print tickets; other browsers (phones, staff laptops) must not,
// since window.print() there opens a dialog. A kiosk is marked once by opening
// any office page with ?kiosk=1 (?kiosk=0 clears it); the flag lives in that
// browser profile's localStorage.
const KIOSK_STORAGE_KEY = "screenb-kiosk";

export function syncKioskModeFromUrl() {
  const param = new URLSearchParams(window.location.search).get("kiosk");
  try {
    if (param === "1") localStorage.setItem(KIOSK_STORAGE_KEY, "1");
    else if (param === "0") localStorage.removeItem(KIOSK_STORAGE_KEY);
  } catch {
    // Storage blocked: kiosk mode stays off.
  }
}

export function isKioskMode() {
  try {
    return localStorage.getItem(KIOSK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
