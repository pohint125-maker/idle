const BASE = {
  moto: 10,
  crew: 40,
  officina: 100,
  garage: 250,
};

const SCALE = {
  moto: 1.15,
  crew: 1.2,
  officina: 1.28,
  garage: 1.4,
};

const state = loadState();

const ui = {
  credits: document.getElementById("credits"),
  cps: document.getElementById("cps"),
  clickGain: document.getElementById("click-gain"),
  motoCost: document.getElementById("moto-cost"),
  crewCost: document.getElementById("crew-cost"),
  officinaCost: document.getElementById("officina-cost"),
  garageCost: document.getElementById("garage-cost"),
  motoCount: document.getElementById("moto-count"),
  crewCount: document.getElementById("crew-count"),
  officinaCount: document.getElementById("officina-count"),
  garageCount: document.getElementById("garage-count"),
};

function loadState() {
  const saved = localStorage.getItem("idle-moto-state");
  if (saved) {
    return JSON.parse(saved);
  }

  return {
    credits: 0,
    moto: 0,
    crew: 0,
    officina: 0,
    garage: 0,
  };
}

function saveState() {
  localStorage.setItem("idle-moto-state", JSON.stringify(state));
}

function price(kind) {
  return Math.floor(BASE[kind] * SCALE[kind] ** state[kind]);
}

function getClickGain() {
  return 1 + state.crew * 0.8 + state.garage * 0.5;
}

function getCps() {
  const motoOutput = state.moto * 1.3;
  const officinaBoost = 1 + state.officina * 0.15;
  const garageBoost = 1 + state.garage * 0.1;
  return motoOutput * officinaBoost * garageBoost;
}

function canAfford(kind) {
  return state.credits >= price(kind);
}

function buy(kind) {
  const cost = price(kind);
  if (state.credits < cost) {
    return;
  }
  state.credits -= cost;
  state[kind] += 1;
  render();
  saveState();
}

function format(n) {
  return Intl.NumberFormat("it-IT", {
    maximumFractionDigits: n >= 1000 ? 0 : 1,
  }).format(n);
}

function render() {
  ui.credits.textContent = format(state.credits);
  ui.cps.textContent = format(getCps());
  ui.clickGain.textContent = format(getClickGain());

  ui.motoCost.textContent = format(price("moto"));
  ui.crewCost.textContent = format(price("crew"));
  ui.officinaCost.textContent = format(price("officina"));
  ui.garageCost.textContent = format(price("garage"));

  ui.motoCount.textContent = state.moto;
  ui.crewCount.textContent = state.crew;
  ui.officinaCount.textContent = state.officina;
  ui.garageCount.textContent = state.garage;

  document.getElementById("buy-moto").disabled = !canAfford("moto");
  document.getElementById("hire-crew").disabled = !canAfford("crew");
  document.getElementById("build-officina").disabled = !canAfford("officina");
  document.getElementById("expand-garage").disabled = !canAfford("garage");
}

document.getElementById("ride-btn").addEventListener("click", () => {
  state.credits += getClickGain();
  render();
  saveState();
});

document.getElementById("buy-moto").addEventListener("click", () => buy("moto"));
document.getElementById("hire-crew").addEventListener("click", () => buy("crew"));
document.getElementById("build-officina").addEventListener("click", () => buy("officina"));
document.getElementById("expand-garage").addEventListener("click", () => buy("garage"));

document.getElementById("reset").addEventListener("click", () => {
  localStorage.removeItem("idle-moto-state");
  Object.assign(state, { credits: 0, moto: 0, crew: 0, officina: 0, garage: 0 });
  render();
});

setInterval(() => {
  state.credits += getCps();
  render();
  saveState();
}, 1000);

render();
