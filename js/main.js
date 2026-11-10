// =========================================
// 모든 페이지 공통 기능
// 1) 휴대폰 ≡ 메뉴 열고 닫기
// 2) 지금 보고 있는 페이지 메뉴 강조
// 3) 다크 모드 버튼 (보너스 과제)
// =========================================

// localStorage는 시크릿 모드 등에서 오류가 날 수 있어 try/catch로 감싼다
function loadSetting(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 저장 못 해도 동작에는 문제 없음 */ }
}

// 1) 휴대폰 메뉴 열고 닫기
const menuBtn = document.querySelector(".menu-btn");
const nav = document.querySelector(".nav");

menuBtn.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuBtn.textContent = isOpen ? "×" : "≡";
  menuBtn.setAttribute("aria-expanded", isOpen);
});

// 2) 지금 보고 있는 페이지 메뉴 강조
const current = location.pathname.split("/").pop() || "index.html";

document.querySelectorAll(".nav a").forEach((link) => {
  const href = link.getAttribute("href");
  // Vercel은 주소에서 .html을 뗄 수도 있어서 두 경우 모두 비교
  if (href === current || href.replace(".html", "") === current) {
    link.classList.add("active");
  }
});

// 3) 다크 모드
const themeBtn = document.querySelector(".theme-btn");
const root = document.documentElement;

const savedTheme = loadSetting("ootd-theme");
if (savedTheme) root.dataset.theme = savedTheme;

function isDark() {
  if (root.dataset.theme) return root.dataset.theme === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function paintThemeButton() {
  themeBtn.textContent = isDark() ? "☀️" : "🌙";
}

paintThemeButton();

themeBtn.addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  saveSetting("ootd-theme", root.dataset.theme);
  paintThemeButton();
});
