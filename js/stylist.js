// =========================================
// AI 코디 추천
// 입력 → 검사 → fetch('/api/stylist') → 결과 카드 / 오류 안내
// =========================================

const REQUEST_MAX = 200;   // 추가 요청 최대 글자 수 (서버와 같은 값)
const SLOW_MS = 8000;      // 8초 넘으면 "늦어지고 있어요" 안내
const TIMEOUT_MS = 30000;  // 30초 넘으면 요청 취소

const form = document.querySelector("#stylist-form");
const btn = document.querySelector("#submit-btn");
const message = document.querySelector("#message");
const loading = document.querySelector("#loading");
const result = document.querySelector("#result");
const requestInput = document.querySelector("#request");
const counter = document.querySelector("#counter");

let lastData = null; // "다른 코디 보기"에서 같은 조건으로 다시 요청할 때 사용

// ---------- 안내 메시지 ----------
function showMessage(text, type) {
  // type: "error"(빨강) 또는 "wait"(노랑)
  message.textContent = text;
  message.className = "message " + type;
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
  message.textContent = "";
}

// ---------- 글자 수 세기 ----------
requestInput.addEventListener("input", () => {
  const length = requestInput.value.length;
  counter.textContent = `${length} / ${REQUEST_MAX}`;
  counter.classList.toggle("over", length > REQUEST_MAX);
});

// ---------- HTML 특수문자 바꾸기 (XSS 방지) ----------
// AI 답에 <script> 같은 글자가 섞여 와도 코드로 실행되지 않고 글자로만 보이게 함
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// ---------- 입력값 모으기 ----------
function getFormData() {
  return {
    temperature: document.querySelector("#temperature").value.trim(),
    weather: document.querySelector("#weather").value,
    schedule: document.querySelector("#schedule").value,
    style: document.querySelector("#style").value,
    color: document.querySelector("#color").value.trim(),
    request: requestInput.value.trim(),
  };
}

// ---------- 입력값 검사 ----------
function validate(data) {
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));

  const missing = [];
  if (data.temperature === "") {
    missing.push("오늘 기온");
    document.querySelector("#temperature").classList.add("invalid");
  }
  if (data.weather === "") {
    missing.push("날씨");
    document.querySelector("#weather").classList.add("invalid");
  }
  if (missing.length > 0) {
    return `필수값을 입력해 주세요: ${missing.join(", ")}`;
  }

  const temp = Number(data.temperature);
  if (Number.isNaN(temp) || temp < -30 || temp > 45) {
    document.querySelector("#temperature").classList.add("invalid");
    return "기온은 -30 ~ 45 사이 숫자로 입력해 주세요.";
  }

  if (data.request.length > REQUEST_MAX) {
    return `추가 요청은 ${REQUEST_MAX}자 이내로 써 주세요. (지금 ${data.request.length}자)`;
  }

  return null; // 문제 없음
}

// ---------- 서버에 요청 ----------
async function requestOutfits(data) {
  lastData = data;
  hideMessage();
  btn.disabled = true;            // 연타 방지 → 불필요한 AI 요금 방지
  btn.textContent = "추천 받는 중…";
  loading.hidden = false;
  result.innerHTML = "";

  // 8초 지나면 지연 안내, 30초 지나면 요청 취소
  const controller = new AbortController();
  const slowTimer = setTimeout(() => {
    showMessage("⏳ 응답이 조금 늦어지고 있어요. 잠시만 기다려 주세요…", "wait");
  }, SLOW_MS);
  const timeoutTimer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("/api/stylist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    // 서버가 JSON이 아닌 걸 줄 수도 있음 (예: 404 페이지)
    let body = null;
    try {
      body = await response.json();
    } catch (e) {
      body = null;
    }

    if (!response.ok || !body || !Array.isArray(body.outfits)) {
      // 4xx / 5xx 오류, 또는 응답 형식이 이상할 때
      const text = (body && body.error) || `서버 오류가 발생했어요 (${response.status}). 잠시 후 다시 시도해 주세요.`;
      showMessage(text, "error");
      showError(text);
      return;
    }

    hideMessage();
    showResult(body);
    saveHistory(data, body);
  } catch (error) {
    const text = error.name === "AbortError"
      ? "응답이 30초 넘게 오지 않아 요청을 멈췄어요. 잠시 후 다시 시도해 주세요."
      : "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
    showMessage(text, "error");
    showError(text);
  } finally {
    clearTimeout(slowTimer);
    clearTimeout(timeoutTimer);
    btn.disabled = false;
    btn.textContent = "AI 코디 추천받기";
    loading.hidden = true;
  }
}

// ---------- 결과 카드 3개 그리기 ----------
function showResult(r) {
  const cards = r.outfits.map((o, i) => `
    <article class="card outfit">
      <p class="look">LOOK ${i + 1}</p>
      <h3>${esc(o.title)}</h3>
      <dl>
        <dt>상의</dt><dd>${esc(o.top)}</dd>
        <dt>하의</dt><dd>${esc(o.bottom)}</dd>
        <dt>아우터</dt><dd>${esc(o.outer)}</dd>
        <dt>신발</dt><dd>${esc(o.shoes)}</dd>
      </dl>
      <p class="reason">${esc(o.reason)}</p>
    </article>
  `).join("");

  result.innerHTML = `
    <p class="summary">${esc(r.summary)}</p>
    <div class="outfits">${cards}</div>
    <p class="tip">💡 오늘의 팁: ${esc(r.tip)}</p>
    <div class="result-actions">
      <button type="button" class="btn btn-line" id="retry-btn">🔄 다른 코디 보기</button>
    </div>
  `;
  document.querySelector("#retry-btn").addEventListener("click", () => requestOutfits(lastData));
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- 오류 화면 ----------
function showError(text) {
  result.innerHTML = `
    <div class="empty">
      <p class="empty-icon">😵</p>
      <p>${esc(text)}</p>
      <button type="button" class="btn btn-line" id="retry-btn">다시 시도</button>
    </div>
  `;
  document.querySelector("#retry-btn").addEventListener("click", () => requestOutfits(lastData));
}

// ---------- 최근 추천 기록 (보너스: 간단한 저장) ----------
// 브라우저 localStorage에 최근 5개까지만 저장. 서버로는 보내지 않음.
const HISTORY_KEY = "ootd-history";
const historySection = document.querySelector("#history-section");
const historyList = document.querySelector("#history");

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveHistory(data, r) {
  const item = {
    time: new Date().toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    condition: `${data.temperature}℃ · ${data.weather}${data.schedule ? " · " + data.schedule : ""}`,
    looks: r.outfits.map((o) => o.title).join(" / "),
  };
  const list = [item, ...loadHistory()].slice(0, 5);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (e) { /* 저장 실패해도 무시 */ }
  renderHistory();
}

function renderHistory() {
  const list = loadHistory();
  historySection.hidden = list.length === 0;
  historyList.innerHTML = list.map((h) => `
    <li><span><strong>${esc(h.condition)}</strong> → ${esc(h.looks)}</span><time>${esc(h.time)}</time></li>
  `).join("");
}

document.querySelector("#clear-history").addEventListener("click", () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* 무시 */ }
  renderHistory();
});

renderHistory();

// ---------- 오늘 날씨 자동 입력 ----------
// Open-Meteo 무료 날씨 API (키 필요 없음). 페이지를 열 때마다 오늘 날씨로 기온·날씨 칸을 채운다.
// → 매일 들어오면 그날 날씨에 맞는 코디를 받을 수 있음
const CITIES = {
  seoul:    { name: "서울", lat: 37.5665, lon: 126.978 },
  incheon:  { name: "인천", lat: 37.4563, lon: 126.7052 },
  suwon:    { name: "수원", lat: 37.2636, lon: 127.0286 },
  daejeon:  { name: "대전", lat: 36.3504, lon: 127.3845 },
  daegu:    { name: "대구", lat: 35.8714, lon: 128.6014 },
  gwangju:  { name: "광주", lat: 35.1595, lon: 126.8526 },
  busan:    { name: "부산", lat: 35.1796, lon: 129.0756 },
  ulsan:    { name: "울산", lat: 35.5384, lon: 129.3114 },
  changwon: { name: "창원", lat: 35.228,  lon: 128.6811 },
  jinju:    { name: "진주", lat: 35.18,   lon: 128.1076 },
  jeju:     { name: "제주", lat: 33.4996, lon: 126.5312 },
};
const CITY_KEY = "ootd-city";
const citySelect = document.querySelector("#city");
const weatherBtn = document.querySelector("#weather-btn");
const weatherStatus = document.querySelector("#weather-status");

function setWeatherStatus(text, type) {
  weatherStatus.textContent = text;
  weatherStatus.className = "weather-status " + (type || "");
}

// 날씨 코드(WMO) → 우리 화면의 날씨 선택지
function toWeatherOption(code, windMs) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "비";
  if (windMs >= 9) return "바람 강함";
  if (code <= 1) return "맑음";
  return "흐림"; // 2, 3(구름 많음·흐림), 45, 48(안개)
}

// 내 위치 가져오기 (허용 안 하면 실패)
function getMyPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("위치 기능 없음"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ name: "내 위치", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error("위치 권한 거부")),
      { timeout: 8000 }
    );
  });
}

async function loadWeather() {
  const key = citySelect.value;
  try { localStorage.setItem(CITY_KEY, key); } catch (e) { /* 무시 */ }

  weatherBtn.disabled = true;
  setWeatherStatus("오늘 날씨를 불러오는 중…");

  try {
    const place = key === "here" ? await getMyPosition() : CITIES[key];

    const url = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${place.lat}&longitude=${place.lon}`
      + "&current=temperature_2m,weather_code,wind_speed_10m"
      + "&wind_speed_unit=ms&timezone=Asia%2FSeoul";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error("날씨 서버 오류 " + response.status);

    const data = await response.json();
    const temp = Math.round(data.current.temperature_2m);
    const wind = data.current.wind_speed_10m;
    const weather = toWeatherOption(data.current.weather_code, wind);

    document.querySelector("#temperature").value = temp;
    document.querySelector("#weather").value = weather;
    document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));

    const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    setWeatherStatus(`✅ ${today} ${place.name}: ${temp}℃ · ${weather} (바람 ${wind.toFixed(1)}m/s) 로 채웠어요. 직접 고쳐도 돼요.`, "ok");
  } catch (error) {
    // 실패 처리: 날씨를 못 불러와도 직접 입력하면 됨
    const why = error.message === "위치 권한 거부"
      ? "위치 권한이 허용되지 않았어요. 지역을 직접 골라 주세요."
      : "날씨를 불러오지 못했어요. 기온과 날씨를 직접 입력해 주세요.";
    setWeatherStatus("⚠️ " + why, "fail");
  } finally {
    weatherBtn.disabled = false;
  }
}

// 지난번에 고른 지역 기억 (내 위치는 매번 권한 창이 뜨지 않게 기억하지 않음)
try {
  const savedCity = localStorage.getItem(CITY_KEY);
  if (savedCity && CITIES[savedCity]) citySelect.value = savedCity;
} catch (e) { /* 무시 */ }

citySelect.addEventListener("change", loadWeather);
weatherBtn.addEventListener("click", loadWeather);
loadWeather(); // 페이지 열자마자 오늘 날씨 자동 입력

// ---------- 제출 버튼 ----------
form.addEventListener("submit", (event) => {
  event.preventDefault(); // 페이지 새로고침 막기

  const data = getFormData();
  const error = validate(data);

  if (error) {
    showMessage(error, "error"); // 실패 처리 ①: 빈 입력
    message.scrollIntoView({ behavior: "smooth", block: "center" });
    return; // 서버 호출 안 함 (요금 0원)
  }

  requestOutfits(data);
});
