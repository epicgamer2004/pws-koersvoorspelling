// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Bestand: web/static/js/app.js
// Alle weergave in de browser: formulier, koppeling met de server, de geanimeerde
// Canvas-grafiek, de kaarten met begin- en eindwaarden, de dagtabel en de pagina-animaties.
// Modelcijfers worden NIET opnieuw uitgerekend; ze komen uit het JSON-antwoord van de
// server (stdout en CSV van het model). Alleen twee dingen worden hier zelf berekend en
// staan op de pagina als zodanig gelabeld:
//   a. de grijze illustratieve simulaties (1.000 stuks, eigen seeded generator);
//   b. het optionele 90%-bereik S0 * exp(nu*t ± 1,645 * sigma * sqrt(t)), t = dag/252.
// Daarnaast worden getoonde waarden alleen opgemaakt (nl-NL) en wordt het verschil
// eind − S0 (absoluut en in %) uit de getoonde waarden afgeleid, zoals gevraagd.
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: hulpfuncties en opmaak van getallen (nl-NL)
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const root = document.documentElement;
const bewegingMq = window.matchMedia("(prefers-reduced-motion: reduce)");
const weinigBeweging = () => bewegingMq.matches;

const fmtKoers = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtParam = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const fmtPct = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtGeheel = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const fmtEen = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDatum = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

const minteken = (tekst) => tekst.replace(/^-/, "−");
const koers = (waarde) => minteken(fmtKoers.format(waarde));
const geheel = (waarde) => fmtGeheel.format(Math.round(waarde));
const metTeken = (waarde, formaat) => (waarde > 0 ? "+" : waarde < 0 ? "−" : "") + formaat.format(Math.abs(waarde));
const procent = (waarde) => minteken(fmtPct.format(waarde)) + "%";

function datumTekst(iso) {
  const [jaar, maand, dag] = iso.split("-").map(Number);
  return fmtDatum.format(new Date(jaar, maand - 1, dag));
}

function zetTekst(id, tekst) {
  const element = document.getElementById(id);
  if (element) element.textContent = tekst;
}

const klem = (waarde, min, max) => Math.min(max, Math.max(min, waarde));
const easeUit = (t) => 1 - Math.pow(1 - t, 3);
const easeInUit = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeTerug = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function cssVar(naam) {
  return getComputedStyle(root).getPropertyValue(naam).trim();
}

function scrollNaar(element) {
  element.scrollIntoView({ behavior: weinigBeweging() ? "auto" : "smooth", block: "start" });
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: tellende getallen
let telGeneratie = 0;

function telOp(items, duur = 1300) {
  const generatie = ++telGeneratie;
  const eind = () => items.forEach((item) => { item.el.textContent = item.fmt(item.naar); });
  if (weinigBeweging()) {
    eind();
    return;
  }
  const start = performance.now();
  const stap = (nu) => {
    if (generatie !== telGeneratie) return;
    const voortgang = klem((nu - start) / duur, 0, 1);
    const e = easeUit(voortgang);
    items.forEach((item) => { item.el.textContent = item.fmt(item.van + (item.naar - item.van) * e); });
    if (voortgang < 1) requestAnimationFrame(stap);
    else eind();
  };
  requestAnimationFrame(stap);
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: licht en donker thema (volgt het systeem, plus een knop)
const themaKnop = $("#thema-knop");
const systeemDonker = window.matchMedia("(prefers-color-scheme: dark)");
let overgangTimer = 0;

function actiefThema() {
  return root.dataset.theme || (systeemDonker.matches ? "dark" : "light");
}

function werkThemaBij() {
  const thema = actiefThema();
  root.dataset.themaActief = thema;
  themaKnop.setAttribute("aria-label", thema === "dark" ? "Lichte weergave aanzetten" : "Donkere weergave aanzetten");
  document.dispatchEvent(new CustomEvent("themawissel"));
}

themaKnop.addEventListener("click", () => {
  const nieuw = actiefThema() === "dark" ? "light" : "dark";
  if (!weinigBeweging()) {
    root.classList.add("thema-overgang");
    clearTimeout(overgangTimer);
    overgangTimer = setTimeout(() => root.classList.remove("thema-overgang"), 520);
  }
  root.dataset.theme = nieuw;
  try {
    localStorage.setItem("pws-thema", nieuw);
  } catch (e) {
    // Niet opslaan is geen probleem: de keuze geldt dan alleen voor dit bezoek.
  }
  werkThemaBij();
});
systeemDonker.addEventListener("change", werkThemaBij);
werkThemaBij();
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: header, actieve navigatie, scroll-reveals en de lijn bij de stappen
const header = $("#site-header");
const stappenLijst = $("#stappen");
let scrollGepland = false;

function opScroll() {
  scrollGepland = false;
  header.classList.toggle("is-gescrold", window.scrollY > 8);
  if (stappenLijst) {
    let voortgang = 1;
    if (!weinigBeweging()) {
      const rect = stappenLijst.getBoundingClientRect();
      voortgang = klem((window.innerHeight * 0.7 - rect.top) / rect.height, 0, 1);
    }
    stappenLijst.style.setProperty("--lijn-voortgang", voortgang.toFixed(3));
  }
}
window.addEventListener("scroll", () => {
  if (!scrollGepland) {
    scrollGepland = true;
    requestAnimationFrame(opScroll);
  }
}, { passive: true });
opScroll();

function startReveals() {
  const elementen = $$(".reveal");
  elementen.forEach((element) => {
    const vertraging = Number(element.dataset.vertraging || 0);
    if (vertraging) element.style.setProperty("--vertraging", (vertraging * 0.08).toFixed(2) + "s");
  });
  if (!("IntersectionObserver" in window) || weinigBeweging()) {
    elementen.forEach((element) => element.classList.add("is-zichtbaar"));
    return;
  }
  const waarnemer = new IntersectionObserver((items) => {
    items.forEach((item) => {
      if (item.isIntersecting) {
        item.target.classList.add("is-zichtbaar");
        waarnemer.unobserve(item.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  elementen.forEach((element) => waarnemer.observe(element));
}

function startActieveNavigatie() {
  if (!("IntersectionObserver" in window)) return;
  const links = new Map($$(".hoofdnav a").map((link) => [link.getAttribute("href").slice(1), link]));
  const waarnemer = new IntersectionObserver((items) => {
    items.forEach((item) => {
      if (!item.isIntersecting) return;
      links.forEach((link, id) => link.classList.toggle("is-actief", id === item.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((_, id) => {
    const sectie = document.getElementById(id);
    if (sectie) waarnemer.observe(sectie);
  });
}

startReveals();
startActieveNavigatie();
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: hero - geanimeerde achtergrond van zachte koerslijnen (puur decoratie)
function startHeroAchtergrond() {
  const canvas = $("#hero-achtergrond");
  const ctx = canvas.getContext("2d");
  const STAP = 10;
  let breedte = 0;
  let hoogte = 0;
  let lijnen = [];
  let zichtbaar = true;
  let rafId = 0;
  let vorige = 0;
  let kleurAccent = "";
  let kleurGrijs = "";

  function volgende(y, basis) {
    return y + (basis - y) * 0.035 + (Math.random() - 0.5) * hoogte * 0.022;
  }

  function maakLijnen() {
    const aantal = breedte < 640 ? 4 : 6;
    lijnen = Array.from({ length: aantal }, (_, i) => {
      const basis = hoogte * (0.18 + (0.6 * (i + 0.5)) / aantal);
      const punten = [];
      let y = basis;
      for (let k = 0; k < Math.ceil(breedte / STAP) + 3; k++) {
        y = volgende(y, basis);
        punten.push(y);
      }
      return { basis, punten, verschuiving: 0, snelheid: 9 + Math.random() * 9, accent: i % 3 === 1 };
    });
  }

  function leesKleuren() {
    kleurAccent = "rgba(" + cssVar("--hero-lijn-rgb") + ", 0.22)";
    kleurGrijs = "rgba(" + cssVar("--sim-rgb") + ", 0.2)";
  }

  function teken() {
    ctx.clearRect(0, 0, breedte, hoogte);
    lijnen.forEach((lijn) => {
      ctx.beginPath();
      lijn.punten.forEach((y, k) => {
        const x = k * STAP - lijn.verschuiving;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lijn.accent ? kleurAccent : kleurGrijs;
      ctx.lineWidth = lijn.accent ? 1.8 : 1.3;
      ctx.lineJoin = "round";
      ctx.stroke();
    });
  }

  function lus(tijd) {
    rafId = 0;
    const dt = vorige ? Math.min(50, tijd - vorige) : 16;
    vorige = tijd;
    lijnen.forEach((lijn) => {
      lijn.verschuiving += (lijn.snelheid * dt) / 1000;
      while (lijn.verschuiving >= STAP) {
        lijn.verschuiving -= STAP;
        lijn.punten.shift();
        lijn.punten.push(volgende(lijn.punten[lijn.punten.length - 1], lijn.basis));
      }
    });
    teken();
    plan();
  }

  function plan() {
    if (!rafId && zichtbaar && !document.hidden && !weinigBeweging()) rafId = requestAnimationFrame(lus);
    else vorige = 0;
  }

  function maatOpnieuw() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    breedte = rect.width;
    hoogte = rect.height;
    canvas.width = Math.round(breedte * dpr);
    canvas.height = Math.round(hoogte * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    maakLijnen();
    teken();
  }

  leesKleuren();
  maatOpnieuw();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(maatOpnieuw, 150);
  });
  document.addEventListener("themawissel", () => { leesKleuren(); teken(); });
  document.addEventListener("visibilitychange", plan);
  bewegingMq.addEventListener("change", plan);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((items) => {
      zichtbaar = items[0].isIntersecting;
      plan();
    }).observe(canvas);
  }
  plan();
}

startHeroAchtergrond();
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: invoerformulier (aandeel, maanden met stepper en slider, validatie)
const formulier = $("#voorspel-form");
const tickerInvoer = $("#ticker");
const maandenInvoer = $("#maanden");
const maandenSlider = $("#maanden-slider");
const voorspelKnop = $("#voorspel-knop");
const formFout = $("#form-fout");
const TICKER_PATROON = /^[A-Za-z0-9.\-]{1,12}$/;

function zetMaanden(waarde, vanuitInvoer = false) {
  const maanden = klem(Math.round(Number(waarde)) || 12, 1, 24);
  if (!vanuitInvoer) maandenInvoer.value = String(maanden);
  maandenSlider.value = String(maanden);
  maandenSlider.style.setProperty("--vulling", ((maanden - 1) / 23) * 100 + "%");
  zetTekst("maanden-dagen", geheel(maanden * 21));
}

maandenSlider.addEventListener("input", () => zetMaanden(maandenSlider.value));
maandenInvoer.addEventListener("input", () => {
  if (/^\d{1,2}$/.test(maandenInvoer.value) && +maandenInvoer.value >= 1 && +maandenInvoer.value <= 24) {
    zetMaanden(maandenInvoer.value, true);
    maandenInvoer.removeAttribute("aria-invalid");
  }
});
maandenInvoer.addEventListener("blur", () => {
  if (maandenInvoer.value.trim() !== "") zetMaanden(maandenInvoer.value);
});
$$(".stepper-knop").forEach((knop) => {
  knop.addEventListener("click", () => zetMaanden((Number(maandenInvoer.value) || 12) + Number(knop.dataset.stap)));
});

function markeerChip() {
  const waarde = tickerInvoer.value.trim().toUpperCase();
  $$(".chip").forEach((chip) => chip.classList.toggle("is-actief", chip.dataset.ticker === waarde));
}
tickerInvoer.addEventListener("input", () => {
  tickerInvoer.removeAttribute("aria-invalid");
  markeerChip();
});
$$(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    tickerInvoer.value = chip.dataset.ticker;
    tickerInvoer.removeAttribute("aria-invalid");
    markeerChip();
    tickerInvoer.focus();
  });
});

function toonFormFout(melding, veld) {
  formFout.textContent = melding;
  formFout.hidden = false;
  if (veld) {
    veld.setAttribute("aria-invalid", "true");
    veld.focus();
  }
}

function valideer() {
  const ticker = tickerInvoer.value.trim();
  if (!ticker) {
    toonFormFout("Vul de naam van een aandeel in, bijvoorbeeld ASML.", tickerInvoer);
    return null;
  }
  if (!TICKER_PATROON.test(ticker)) {
    toonFormFout("De naam van het aandeel mag alleen letters, cijfers, een punt of een streepje bevatten (maximaal 12 tekens).", tickerInvoer);
    return null;
  }
  const maanden = maandenInvoer.value.trim();
  if (!/^\d{1,2}$/.test(maanden) || +maanden < 1 || +maanden > 24) {
    toonFormFout("Het aantal maanden moet een heel getal van 1 tot en met 24 zijn.", maandenInvoer);
    return null;
  }
  return { ticker: ticker.toUpperCase(), maanden: Number(maanden) };
}

formulier.addEventListener("submit", (event) => {
  event.preventDefault();
  formFout.hidden = true;
  const invoer = valideer();
  if (invoer) voorspel(invoer);
});

$$(".link-knop[data-ticker]").forEach((knop) => {
  knop.addEventListener("click", () => {
    tickerInvoer.value = knop.dataset.ticker;
    zetMaanden(12);
    markeerChip();
    formulier.requestSubmit();
  });
});

zetMaanden(maandenInvoer.value);
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: laadstatus (oneindige animatie, geen nepvoortgang; alleen de echte verstreken tijd)
const ladenBlok = $("#laden");
const leegBlok = $("#leeg");
const uitkomstBlok = $("#uitkomst");
const resultaatFout = $("#resultaat-fout");
const resultaatSectie = $("#resultaat");
let ladenTimer = 0;

function startLaden() {
  const begin = Date.now();
  zetTekst("laden-seconden", "0");
  ladenBlok.hidden = false;
  leegBlok.hidden = true;
  uitkomstBlok.hidden = true;
  resultaatFout.hidden = true;
  resultaatSectie.setAttribute("aria-busy", "true");
  voorspelKnop.disabled = true;
  voorspelKnop.classList.add("is-bezig");
  zetTekst("status", "Het model draait: koersen ophalen en 10.000 simulaties uitvoeren.");
  clearInterval(ladenTimer);
  ladenTimer = setInterval(() => zetTekst("laden-seconden", geheel((Date.now() - begin) / 1000)), 1000);
}

function stopLaden() {
  clearInterval(ladenTimer);
  ladenBlok.hidden = true;
  resultaatSectie.removeAttribute("aria-busy");
  voorspelKnop.disabled = false;
  voorspelKnop.classList.remove("is-bezig");
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: serverkoppeling (POST /api/voorspel) en controle van het antwoord
class ServerFout extends Error {}
let bezig = false;
let laatsteData = null;

function isGetal(waarde) {
  return typeof waarde === "number" && Number.isFinite(waarde);
}

function geldigAntwoord(d) {
  if (!d || typeof d !== "object") return false;
  const getallen = ["nu", "sigma", "mu", "S0", "eind_formule", "eind_mc", "dagen", "maanden", "aantal_dagen_data", "aantal_logrendementen"];
  if (!getallen.every((veld) => isGetal(d[veld]))) return false;
  if (typeof d.ticker !== "string" || typeof d.eerste_datum !== "string" || typeof d.laatste_datum !== "string") return false;
  const lijsten = [d.dag, d.formule, d.mc_mediaan];
  return lijsten.every((lijst) => Array.isArray(lijst) && lijst.length === d.dagen && lijst.every(isGetal));
}

async function voorspel(invoer) {
  if (bezig) return;
  bezig = true;
  startLaden();
  scrollNaar(resultaatSectie);
  try {
    history.replaceState(null, "", "?aandeel=" + encodeURIComponent(invoer.ticker) + "&maanden=" + invoer.maanden + "#resultaat");
  } catch (e) {
    // Adresbalk bijwerken is alleen een gemak.
  }

  let data = null;
  try {
    let antwoord;
    try {
      antwoord = await fetch("/api/voorspel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoer),
      });
    } catch (e) {
      throw new ServerFout("De server is niet bereikbaar. Controleer je internetverbinding en probeer het opnieuw.");
    }
    try {
      data = await antwoord.json();
    } catch (e) {
      data = null;
    }
    if (!antwoord.ok) {
      throw new ServerFout((data && typeof data.fout === "string" && data.fout) || "Er ging iets mis bij de server. Probeer het opnieuw.");
    }
    if (!geldigAntwoord(data)) {
      throw new ServerFout("Het antwoord van de server was onvolledig. Probeer het opnieuw.");
    }
  } catch (fout) {
    stopLaden();
    bezig = false;
    toonResultaatFout(fout instanceof ServerFout ? fout.message : "Er ging iets mis. Probeer het opnieuw.");
    if (!(fout instanceof ServerFout)) console.error(fout);
    return;
  }

  stopLaden();
  bezig = false;
  toonResultaat(data);
}

function toonResultaatFout(melding) {
  resultaatFout.textContent = melding;
  resultaatFout.hidden = false;
  uitkomstBlok.hidden = true;
  leegBlok.hidden = laatsteData === null ? false : true;
  zetTekst("status", "");
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: resultaat tonen (kop, kaarten, tabellen, parameters en PNG vullen)
function maakBadge(tekst, accent) {
  const badge = document.createElement("span");
  badge.className = accent ? "badge badge-accent" : "badge";
  badge.textContent = tekst;
  return badge;
}

function toonResultaat(d) {
  laatsteData = d;
  resultaatFout.hidden = true;
  leegBlok.hidden = true;
  uitkomstBlok.hidden = false;

  zetTekst("uitkomst-titel", d.ticker);
  zetTekst(
    "uitkomst-meta",
    "Ingevoerd: " + d.invoer + " · koersdata tot en met " + datumTekst(d.laatste_datum) + " · " + geheel(d.maanden) + " maanden vooruit"
  );
  const badges = $("#uitkomst-badges");
  badges.replaceChildren();
  if (isGetal(d.simulaties)) badges.append(maakBadge(geheel(d.simulaties) + " simulaties", true));
  if (isGetal(d.seed)) badges.append(maakBadge("seed " + d.seed, false));
  badges.append(maakBadge(d.uit_cache ? "uit de cache (vandaag al berekend)" : "zojuist berekend", false));

  waarden.zet(d);
  vulDagtabel(d);
  vulPng(d);
  vulParameters(d);
  grafiek.zetData(d);

  zetTekst("resultaat-intro", "Hieronder zie je de grafiek, de begin- en eindwaarden, de dagtabel en de originele grafiek van het model. Wil je een ander aandeel? Pas het formulier bovenaan aan.");
  zetTekst("status", "De voorspelling voor " + d.ticker + " is klaar. De resultaten staan hieronder.");
  $("#uitkomst-titel").focus({ preventScroll: true });
  scrollNaar(uitkomstBlok);
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: begin- en eindwaarden (kaarten met tellende getallen en compacte tabel)
const waarden = {
  items: [],
  zet(d) {
    const verschilFormule = d.eind_formule - d.S0;
    const verschilMc = d.eind_mc - d.S0;
    const pctFormule = (verschilFormule / d.S0) * 100;
    const pctMc = (verschilMc / d.S0) * 100;
    const verschilTekst = (v) => metTeken(v, fmtKoers);
    const pctTekst = (v) => metTeken(v, fmtPct) + "%";

    this.items = [
      { el: $("#w-s0"), van: 0, naar: d.S0, fmt: koers },
      { el: $("#w-eind-formule"), van: d.S0, naar: d.eind_formule, fmt: koers },
      { el: $("#w-eind-mc"), van: d.S0, naar: d.eind_mc, fmt: koers },
      { el: $("#w-verschil-formule"), van: 0, naar: verschilFormule, fmt: verschilTekst },
      { el: $("#w-pct-formule"), van: 0, naar: pctFormule, fmt: pctTekst },
      { el: $("#w-verschil-mc"), van: 0, naar: verschilMc, fmt: verschilTekst },
      { el: $("#w-pct-mc"), van: 0, naar: pctMc, fmt: pctTekst },
      { el: $("#w-dagen"), van: 0, naar: d.dagen, fmt: geheel },
    ];
    this.items.forEach((item) => { item.el.textContent = item.fmt(item.naar); });

    zetTekst("w-s0-datum", datumTekst(d.laatste_datum));
    $$(".js-dagen").forEach((el) => { el.textContent = geheel(d.dagen); });
    $$(".js-maanden").forEach((el) => { el.textContent = geheel(d.maanden); });
    [["#w-verschil-formule-rij", verschilFormule], ["#w-verschil-mc-rij", verschilMc]].forEach(([id, v]) => {
      const rij = $(id);
      rij.classList.toggle("is-omhoog", v > 0);
      rij.classList.toggle("is-omlaag", v < 0);
    });

    zetTekst("t-start-formule", koers(d.S0));
    zetTekst("t-start-mc", koers(d.S0));
    zetTekst("t-eind-formule", koers(d.eind_formule));
    zetTekst("t-eind-mc", koers(d.eind_mc));
    zetTekst("t-verschil-formule", verschilTekst(verschilFormule));
    zetTekst("t-verschil-mc", verschilTekst(verschilMc));
    zetTekst("t-pct-formule", pctTekst(pctFormule));
    zetTekst("t-pct-mc", pctTekst(pctMc));
  },
  verberg() {
    if (weinigBeweging()) return;
    $(".waarden").classList.add("wacht-op-pop");
    $$(".waarde-kaart").forEach((kaart) => kaart.classList.remove("pop"));
  },
  speel() {
    const kaarten = $$(".waarde-kaart");
    $(".waarden").classList.remove("wacht-op-pop");
    if (weinigBeweging()) {
      this.items.forEach((item) => { item.el.textContent = item.fmt(item.naar); });
      return;
    }
    kaarten.forEach((kaart, i) => {
      kaart.classList.remove("pop");
      void kaart.offsetWidth;
      kaart.style.animationDelay = i * 90 + "ms";
      kaart.classList.add("pop");
      kaart.addEventListener("animationend", () => kaart.classList.remove("pop"), { once: true });
    });
    telOp(this.items, 1400);
  },
};
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: dagtabel met sticky kop, zoeken op dagnummer en download van de originele CSV
const dagtabelBody = $("#dagtabel-body");
const dagZoek = $("#dag-zoek");
const dagtabelScroll = $("#dagtabel-scroll");
let dagRijen = [];

function cel(tekst) {
  const td = document.createElement("td");
  td.textContent = tekst;
  return td;
}

function vulDagtabel(d) {
  const fragment = document.createDocumentFragment();
  dagRijen = d.dag.map((dag, i) => {
    const rij = document.createElement("tr");
    rij.dataset.dag = String(dag);
    rij.append(cel(String(dag)), cel(koers(d.formule[i])), cel(koers(d.mc_mediaan[i])));
    fragment.append(rij);
    return rij;
  });
  dagtabelBody.replaceChildren(fragment);
  dagZoek.value = "";
  dagtabelScroll.scrollTop = 0;
  zetTekst("dag-telling", geheel(d.dagen) + " handelsdagen");
  $("#download-fout").hidden = true;
}

dagZoek.addEventListener("input", () => {
  const zoekterm = dagZoek.value.replace(/\D/g, "");
  if (dagZoek.value !== zoekterm) dagZoek.value = zoekterm;
  let aantal = 0;
  let exact = null;
  dagRijen.forEach((rij) => {
    const toon = !zoekterm || rij.dataset.dag.startsWith(zoekterm);
    rij.hidden = !toon;
    const isExact = zoekterm !== "" && rij.dataset.dag === zoekterm;
    rij.classList.toggle("is-gevonden", isExact);
    if (toon) aantal++;
    if (isExact) exact = rij;
  });
  const totaal = dagRijen.length;
  if (!zoekterm) zetTekst("dag-telling", geheel(totaal) + " handelsdagen");
  else if (aantal === 0) zetTekst("dag-telling", "Geen dag " + zoekterm + " in deze voorspelling (dag 1 tot en met " + geheel(totaal) + ").");
  else zetTekst("dag-telling", aantal + (aantal === 1 ? " dag" : " dagen") + " gevonden van de " + geheel(totaal));
  dagtabelScroll.scrollTop = 0;
  if (exact && exact.offsetTop > dagtabelScroll.clientHeight - 60) dagtabelScroll.scrollTop = exact.offsetTop - 50;
});

$("#download-csv").addEventListener("click", async () => {
  const foutVeld = $("#download-fout");
  foutVeld.hidden = true;
  if (!laatsteData) return;
  try {
    let antwoord;
    try {
      antwoord = await fetch(laatsteData.csv_url);
    } catch (e) {
      throw new Error("De server is niet bereikbaar. Probeer het opnieuw.");
    }
    if (!antwoord.ok) {
      let melding = "Downloaden lukte niet. Vraag de voorspelling opnieuw op.";
      try {
        melding = (await antwoord.json()).fout || melding;
      } catch (e) {
        // standaardmelding houden
      }
      throw new Error(melding);
    }
    const blob = await antwoord.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = laatsteData.csv_bestandsnaam || "voorspelling.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (fout) {
    foutVeld.textContent = fout.message;
    foutVeld.hidden = false;
  }
});
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: originele grafiek (PNG) van het model met bijschrift
function vulPng(d) {
  const afbeelding = $("#model-png");
  const getekend = isGetal(d.getekend) ? geheel(d.getekend) : null;
  const totaal = isGetal(d.simulaties) ? geheel(d.simulaties) : "10.000";
  afbeelding.classList.remove("is-geladen");
  afbeelding.onload = () => afbeelding.classList.add("is-geladen");
  afbeelding.onerror = () => afbeelding.classList.add("is-geladen");
  afbeelding.src = d.png_url;
  $("#png-link").href = d.png_url;

  if (getekend) {
    afbeelding.alt = "Originele grafiek van het model voor " + d.ticker + ": " + getekend + " van de " + totaal +
      " simulaties in lichtgrijs, met in zwart de mediaan van die " + getekend + " getekende simulaties.";
    zetTekst(
      "png-bijschrift",
      "Dit is de afbeelding die het model zelf opslaat. De lichtgrijze lijnen zijn de eerste " + getekend + " van de " + totaal +
        " simulaties (getekend = " + d.getekend + " in het modelbestand). De zwarte lijn in deze PNG is de mediaan van die " + getekend +
        " getekende simulaties. De zwarte lijn in de animatie hierboven is de Monte Carlo-mediaan van alle " + totaal +
        " simulaties, zoals die in de CSV staat. Daardoor kunnen de twee zwarte lijnen een klein beetje van elkaar verschillen."
    );
  } else {
    afbeelding.alt = "Originele grafiek van het model voor " + d.ticker + ".";
    zetTekst(
      "png-bijschrift",
      "Dit is de afbeelding die het model zelf opslaat. De zwarte lijn in deze PNG is de mediaan van de getekende simulaties; " +
        "de zwarte lijn in de animatie hierboven is de Monte Carlo-mediaan van alle " + totaal + " simulaties uit de CSV."
    );
  }
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: parameters in gewone taal en gebruikte data
const parametersSectie = $("#parameters");
let parameterWaarnemer = null;

function vulParameters(d) {
  const param = (v) => minteken(fmtParam.format(v));
  const items = [
    { el: $("#p-nu"), van: 0, naar: d.nu, fmt: param },
    { el: $("#p-sigma"), van: 0, naar: d.sigma, fmt: param },
    { el: $("#p-mu"), van: 0, naar: d.mu, fmt: param },
    { el: $("#p-nu-pct"), van: 0, naar: d.nu * 100, fmt: procent },
    { el: $("#p-sigma-pct"), van: 0, naar: d.sigma * 100, fmt: procent },
    { el: $("#p-mu-pct"), van: 0, naar: d.mu * 100, fmt: procent },
  ];
  items.forEach((item) => { item.el.textContent = item.fmt(item.naar); });
  zetTekst("parameters-intro", "Waarden voor " + d.ticker + ", precies zoals het model ze heeft geprint, met uitleg in gewone taal.");

  zetTekst("d-ticker", d.ticker);
  zetTekst("d-periode", datumTekst(d.eerste_datum) + " t/m " + datumTekst(d.laatste_datum));
  zetTekst("d-dagen", geheel(d.aantal_dagen_data));
  zetTekst("d-logrendementen", geheel(d.aantal_logrendementen));
  zetTekst("d-leeg", isGetal(d.lege_waarden) ? geheel(d.lege_waarden) : "—");

  if (parameterWaarnemer) parameterWaarnemer.disconnect();
  if (weinigBeweging() || !("IntersectionObserver" in window)) return;
  parameterWaarnemer = new IntersectionObserver((regels) => {
    if (regels[0].isIntersecting) {
      parameterWaarnemer.disconnect();
      telOpLos(items);
    }
  }, { threshold: 0.25 });
  parameterWaarnemer.observe(parametersSectie);
}

function telOpLos(items) {
  const start = performance.now();
  const stap = (nu) => {
    const e = easeUit(klem((nu - start) / 1200, 0, 1));
    items.forEach((item) => { item.el.textContent = item.fmt(item.van + (item.naar - item.van) * e); });
    if (e < 1) requestAnimationFrame(stap);
    else items.forEach((item) => { item.el.textContent = item.fmt(item.naar); });
  };
  requestAnimationFrame(stap);
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: grafiek - eigen seeded toevalsgenerator (mulberry32) en normale verdeling (Box-Muller)
// Alleen voor de ILLUSTRATIEVE grijze lijnen; dit zijn niet de simulaties van het model.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normaalGenerator(uniform) {
  let reserve = null;
  return function () {
    if (reserve !== null) {
      const z = reserve;
      reserve = null;
      return z;
    }
    let u = 0;
    while (u === 0) u = uniform();
    const v = uniform();
    const straal = Math.sqrt(-2 * Math.log(u));
    reserve = straal * Math.sin(2 * Math.PI * v);
    return straal * Math.cos(2 * Math.PI * v);
  };
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: grafiek - illustratieve simulaties en 90%-bereik (de twee toegestane eigen berekeningen)
const AANTAL_ILLUSTRATIEF = 1000;
const ILLUSTRATIE_SEED = 42;
const HANDELSDAGEN_PER_JAAR = 252;

function maakIllustratieveSimulaties(S0, nu, sigma, dagen) {
  const n = dagen + 1;
  const paden = new Float32Array(AANTAL_ILLUSTRATIEF * n);
  const z = normaalGenerator(mulberry32(ILLUSTRATIE_SEED));
  const dt = 1 / HANDELSDAGEN_PER_JAAR;
  const drift = nu * dt;
  const schok = sigma * Math.sqrt(dt);
  const logS0 = Math.log(S0);
  for (let p = 0; p < AANTAL_ILLUSTRATIEF; p++) {
    const basis = p * n;
    let logKoers = logS0;
    paden[basis] = S0;
    for (let dag = 1; dag < n; dag++) {
      logKoers += drift + schok * z();
      paden[basis + dag] = Math.exp(logKoers);
    }
  }
  return paden;
}

function maakBereik90(S0, nu, sigma, dagen) {
  const onder = new Float64Array(dagen + 1);
  const boven = new Float64Array(dagen + 1);
  for (let dag = 0; dag <= dagen; dag++) {
    const t = dag / HANDELSDAGEN_PER_JAAR;
    const midden = nu * t;
    const breedte = 1.645 * sigma * Math.sqrt(t);
    onder[dag] = S0 * Math.exp(midden - breedte);
    boven[dag] = S0 * Math.exp(midden + breedte);
  }
  return { onder, boven };
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: grafiek - schaal, assen en rasterlijnen
function mooieTicks(min, max, aantal) {
  const bereik = max - min || Math.abs(max) || 1;
  const ruw = bereik / Math.max(1, aantal);
  const macht = Math.pow(10, Math.floor(Math.log10(ruw)));
  const f = ruw / macht;
  const stap = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * macht;
  const begin = Math.floor(min / stap) * stap;
  const eind = Math.ceil(max / stap) * stap;
  const ticks = [];
  for (let v = begin; v <= eind + stap * 1e-6; v += stap) ticks.push(Number(v.toFixed(10)));
  return { ticks, stap };
}

function asFormaat(stap) {
  const decimalen = stap >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(stap)));
  const formaat = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
  return (v) => minteken(formaat.format(v));
}
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: grafiek-animatie (Canvas): data, lagen, tijdlijn in drie fasen, hover en toetsenbord
const grafiek = (() => {
  const wrap = $("#grafiek-wrap");
  const canvas = $("#grafiek");
  const ctx = canvas.getContext("2d");
  const tooltip = $("#tooltip");
  const rasterLaag = document.createElement("canvas");
  const simsLaag = document.createElement("canvas");
  const rasterCtx = rasterLaag.getContext("2d");
  const simsCtx = simsLaag.getContext("2d");

  // Tijdlijn in milliseconden: assen faden in, grijze lijnen groeien (~2,5 s),
  // daarna tekent de zwarte lijn zichzelf, en tot slot markers, labels en kaarten.
  const T = {
    raster: [0, 500],
    sims: [250, 2750],
    band: [2550, 3200],
    formule: [2750, 4350],
    mc: [2850, 4750],
    markers: [4650, 5350],
  };

  let d = null;
  let B = 0;
  let H = 0;
  let dpr = 1;
  let plot = { l: 0, r: 0, t: 0, b: 0 };
  let y0 = 0;
  let y1 = 1;
  let yTicks = [];
  let xTicks = [];
  let yLabel = (v) => String(v);
  let lettertype = "";
  let kleuren = {};
  let simsTot = 0;
  let st = { raster: 0, sims: 0, band: 0, formule: 0, mc: 0, markers: 0 };
  let anim = { bezig: false, start: 0, kaarten: false };
  let klaar = false;
  let rafId = 0;
  let vorigeTijd = 0;
  let hoverDag = null;
  const zicht = { band: 0, formule: 1 };
  const doel = { band: 0, formule: 1 };
  let wachter = null;

  const xPx = (dag) => plot.l + (dag / d.N) * (plot.r - plot.l);
  const yPx = (v) => plot.b - ((v - y0) / (y1 - y0)) * (plot.b - plot.t);

  function leesKleuren() {
    kleuren = {
      mc: cssVar("--lijn-mc"),
      formule: cssVar("--lijn-formule"),
      sim: "rgba(" + cssVar("--sim-rgb") + ", " + cssVar("--sim-alpha") + ")",
      simRgb: cssVar("--sim-rgb"),
      bandRgb: cssVar("--band-rgb"),
      raster: cssVar("--raster"),
      as: cssVar("--as-tekst"),
      rand: cssVar("--rand-sterk"),
      vlak: cssVar("--bg-elev"),
      tekst: cssVar("--tekst"),
    };
    lettertype = getComputedStyle(document.body).fontFamily;
  }

  function bereidDataVoor(data) {
    const N = data.dagen;
    const formule = new Float64Array(N + 1);
    const mc = new Float64Array(N + 1);
    formule[0] = data.S0;
    mc[0] = data.S0;
    for (let i = 0; i < N; i++) {
      formule[i + 1] = data.formule[i];
      mc[i + 1] = data.mc_mediaan[i];
    }
    const sims = maakIllustratieveSimulaties(data.S0, data.nu, data.sigma, N);
    const { onder, boven } = maakBereik90(data.S0, data.nu, data.sigma, N);

    let laag = Infinity;
    let hoog = -Infinity;
    const neem = (v) => { if (v < laag) laag = v; if (v > hoog) hoog = v; };
    for (let i = 0; i <= N; i++) { neem(formule[i]); neem(mc[i]); neem(onder[i]); neem(boven[i]); }
    const steekproef = new Float32Array(AANTAL_ILLUSTRATIEF);
    const stapDag = Math.max(1, Math.floor(N / 24));
    for (let dag = stapDag; dag <= N; dag += stapDag) {
      for (let p = 0; p < AANTAL_ILLUSTRATIEF; p++) steekproef[p] = sims[p * (N + 1) + dag];
      steekproef.sort();
      neem(steekproef[Math.floor(AANTAL_ILLUSTRATIEF * 0.025)]);
      neem(steekproef[Math.floor(AANTAL_ILLUSTRATIEF * 0.975)]);
    }
    const marge = (hoog - laag) * 0.04 || data.S0 * 0.02;
    return { N, S0: data.S0, ticker: data.ticker, formule, mc, sims, onder, boven, laag: Math.max(0, laag - marge), hoog: hoog + marge };
  }

  function meetIndeling() {
    const rect = wrap.getBoundingClientRect();
    B = Math.max(200, rect.width);
    H = Math.max(200, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (const doek of [canvas, rasterLaag, simsLaag]) {
      doek.width = Math.round(B * dpr);
      doek.height = Math.round(H * dpr);
    }
    const smal = B < 560;
    ctx.font = (smal ? 11 : 12) + "px " + lettertype;

    const y = mooieTicks(d.laag, d.hoog, Math.max(3, Math.round(H / 70)));
    yTicks = y.ticks;
    y0 = yTicks[0];
    y1 = yTicks[yTicks.length - 1];
    yLabel = asFormaat(y.stap);
    const labelBreedte = Math.max(...yTicks.map((v) => ctx.measureText(yLabel(v)).width));

    ctx.font = "600 " + (smal ? 11 : 12) + "px " + lettertype;
    const eindBreedte = Math.max(ctx.measureText(koers(d.mc[d.N])).width, ctx.measureText(koers(d.formule[d.N])).width);

    plot = {
      l: Math.ceil(labelBreedte) + (smal ? 12 : 38),
      r: B - Math.ceil(eindBreedte) - (smal ? 22 : 30),
      t: 16,
      b: H - (smal ? 30 : 46),
    };
    const x = mooieTicks(0, d.N, Math.max(2, Math.round((plot.r - plot.l) / 90)));
    const xStap = Math.max(1, Math.round(x.stap));
    xTicks = [];
    for (let dag = 0; dag <= d.N; dag += xStap) xTicks.push(dag);
  }

  function bouwRaster() {
    const c = rasterCtx;
    const smal = B < 560;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, B, H);
    c.font = (smal ? 11 : 12) + "px " + lettertype;
    c.lineWidth = 1;

    c.strokeStyle = kleuren.raster;
    c.fillStyle = kleuren.as;
    c.textAlign = "right";
    c.textBaseline = "middle";
    yTicks.forEach((v) => {
      const y = Math.round(yPx(v)) + 0.5;
      c.beginPath();
      c.moveTo(plot.l, y);
      c.lineTo(plot.r, y);
      c.stroke();
      c.fillText(yLabel(v), plot.l - 8, y);
    });

    c.textAlign = "center";
    c.textBaseline = "top";
    xTicks.forEach((dag) => {
      const x = Math.round(xPx(dag)) + 0.5;
      c.globalAlpha = 0.6;
      c.beginPath();
      c.moveTo(x, plot.t);
      c.lineTo(x, plot.b);
      c.stroke();
      c.globalAlpha = 1;
      c.fillText(geheel(dag), x, plot.b + 8);
    });

    c.strokeStyle = kleuren.rand;
    c.beginPath();
    c.moveTo(plot.l, Math.round(plot.b) + 0.5);
    c.lineTo(plot.r, Math.round(plot.b) + 0.5);
    c.stroke();

    // Stippellijn op hoogte S0: zo zie je meteen of een lijn boven of onder de start eindigt.
    c.save();
    c.setLineDash([2, 4]);
    c.strokeStyle = kleuren.as;
    c.globalAlpha = 0.55;
    const yS0 = Math.round(yPx(d.S0)) + 0.5;
    c.beginPath();
    c.moveTo(plot.l, yS0);
    c.lineTo(plot.r, yS0);
    c.stroke();
    c.restore();

    c.fillStyle = kleuren.as;
    if (!smal) {
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      c.fillText("Handelsdag vanaf de laatste koers (dag 0 = S0)", (plot.l + plot.r) / 2, H - 6);
      c.save();
      c.translate(13, (plot.t + plot.b) / 2);
      c.rotate(-Math.PI / 2);
      c.textBaseline = "middle";
      c.fillText("Koers", 0, 0);
      c.restore();
    } else {
      c.textAlign = "right";
      c.textBaseline = "alphabetic";
      c.fillText("dag", plot.r, H - 2);
    }
  }

  function simsPad(c, p, van, tot, staart) {
    const n = d.N + 1;
    const basis = p * n;
    c.moveTo(xPx(van), yPx(d.sims[basis + van]));
    for (let dag = van + 1; dag <= tot; dag++) c.lineTo(xPx(dag), yPx(d.sims[basis + dag]));
    if (staart > 0 && tot < d.N) {
      const a = d.sims[basis + tot];
      const b = d.sims[basis + tot + 1];
      c.lineTo(xPx(tot + staart), yPx(a + (b - a) * staart));
    }
  }

  function tekenSimsTot(tot) {
    if (tot <= simsTot) return;
    const c = simsCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    c.beginPath();
    c.rect(plot.l, plot.t, plot.r - plot.l, plot.b - plot.t);
    c.clip();
    c.strokeStyle = kleuren.sim;
    c.lineWidth = 1;
    c.lineJoin = "round";
    for (let p = 0; p < AANTAL_ILLUSTRATIEF; p++) {
      c.beginPath();
      simsPad(c, p, simsTot, tot, 0);
      c.stroke();
    }
    c.restore();
    simsTot = tot;
  }

  function herbouwSims() {
    const tot = simsTot;
    simsCtx.setTransform(1, 0, 0, 1, 0, 0);
    simsCtx.clearRect(0, 0, simsLaag.width, simsLaag.height);
    simsTot = 0;
    tekenSimsTot(tot);
  }

  function tekenLijn(reeks, voortgang, kleur, dikte, streep, alpha) {
    if (voortgang <= 0 || alpha <= 0) return null;
    const positie = voortgang * d.N;
    const heel = Math.floor(positie);
    const rest = positie - heel;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = kleur;
    ctx.lineWidth = dikte;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (streep) ctx.setLineDash(streep);
    ctx.beginPath();
    ctx.moveTo(xPx(0), yPx(reeks[0]));
    for (let dag = 1; dag <= heel; dag++) ctx.lineTo(xPx(dag), yPx(reeks[dag]));
    let kop = { x: xPx(heel), y: yPx(reeks[heel]) };
    if (rest > 0 && heel < d.N) {
      const v = reeks[heel] + (reeks[heel + 1] - reeks[heel]) * rest;
      kop = { x: xPx(heel + rest), y: yPx(v) };
      ctx.lineTo(kop.x, kop.y);
    }
    ctx.stroke();
    ctx.restore();
    return kop;
  }

  function tekenBand(alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.l, plot.t, plot.r - plot.l, plot.b - plot.t);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(xPx(0), yPx(d.boven[0]));
    for (let dag = 1; dag <= d.N; dag++) ctx.lineTo(xPx(dag), yPx(d.boven[dag]));
    for (let dag = d.N; dag >= 0; dag--) ctx.lineTo(xPx(dag), yPx(d.onder[dag]));
    ctx.closePath();
    ctx.fillStyle = "rgba(" + kleuren.bandRgb + ", 0.12)";
    ctx.fill();
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + kleuren.bandRgb + ", 0.55)";
    for (const rand of [d.boven, d.onder]) {
      ctx.beginPath();
      ctx.moveTo(xPx(0), yPx(rand[0]));
      for (let dag = 1; dag <= d.N; dag++) ctx.lineTo(xPx(dag), yPx(rand[dag]));
      ctx.stroke();
    }
    ctx.restore();
  }

  function cirkel(x, y, straal, vulling, rand, randDikte) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, straal), 0, Math.PI * 2);
    if (vulling) { ctx.fillStyle = vulling; ctx.fill(); }
    if (rand) { ctx.strokeStyle = rand; ctx.lineWidth = randDikte || 2; ctx.stroke(); }
  }

  function tekenMarkers(m) {
    if (m <= 0) return;
    const schaal = easeTerug(klem(m, 0, 1));
    const alpha = klem(m * 1.6, 0, 1);
    const smal = B < 560;
    ctx.save();
    ctx.globalAlpha = alpha;

    const xs = xPx(0);
    const ys = yPx(d.S0);
    cirkel(xs, ys, 5.5 * schaal, kleuren.vlak, kleuren.mc, 2);
    ctx.font = "600 " + (smal ? 11 : 12) + "px " + lettertype;
    ctx.fillStyle = kleuren.tekst;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("S0 " + koers(d.S0), xs + 8, ys - 8);

    const xe = xPx(d.N);
    const yMc = yPx(d.mc[d.N]);
    const yF = yPx(d.formule[d.N]);
    const formuleZicht = zicht.formule;
    if (formuleZicht > 0) {
      ctx.globalAlpha = alpha * formuleZicht;
      cirkel(xe, yF, 4.5 * schaal, kleuren.vlak, kleuren.formule, 2);
    }
    ctx.globalAlpha = alpha;
    cirkel(xe, yMc, 9 * schaal, "rgba(" + kleuren.bandRgb + ", 0.18)", null);
    cirkel(xe, yMc, 5 * schaal, kleuren.mc, null);

    // Eindlabels rechts van de grafiek; schuif ze uit elkaar als ze elkaar raken.
    let labelMc = yMc;
    let labelF = yF;
    if (formuleZicht > 0 && Math.abs(labelMc - labelF) < 17) {
      const midden = (labelMc + labelF) / 2;
      const boven = d.mc[d.N] >= d.formule[d.N];
      labelMc = midden + (boven ? -9 : 9);
      labelF = midden + (boven ? 9 : -9);
    }
    const schuif = (1 - klem(m, 0, 1)) * 8;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = kleuren.mc;
    ctx.fillText(koers(d.mc[d.N]), xe + 12 - schuif, labelMc);
    if (formuleZicht > 0) {
      ctx.globalAlpha = alpha * formuleZicht;
      ctx.fillStyle = kleuren.formule;
      ctx.fillText(koers(d.formule[d.N]), xe + 12 - schuif, labelF);
    }
    ctx.restore();
  }

  function tekenCrosshair() {
    const x = xPx(hoverDag);
    ctx.save();
    ctx.strokeStyle = kleuren.as;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, plot.t);
    ctx.lineTo(Math.round(x) + 0.5, plot.b);
    ctx.stroke();
    ctx.restore();
    if (zicht.band > 0.5) {
      cirkel(x, yPx(d.boven[hoverDag]), 3, "rgba(" + kleuren.bandRgb + ", 0.8)", null);
      cirkel(x, yPx(d.onder[hoverDag]), 3, "rgba(" + kleuren.bandRgb + ", 0.8)", null);
    }
    if (zicht.formule > 0.5) cirkel(x, yPx(d.formule[hoverDag]), 4.5, kleuren.vlak, kleuren.formule, 2);
    cirkel(x, yPx(d.mc[hoverDag]), 5.5, kleuren.mc, kleuren.vlak, 2);
  }

  function render() {
    if (!d) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = st.raster;
    ctx.drawImage(rasterLaag, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(simsLaag, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Staart van de grijze lijnen tussen twee hele dagen, zodat ook korte periodes vloeiend groeien.
    if (st.sims > 0 && st.sims < 1) {
      const positie = st.sims * d.N;
      const heel = Math.floor(positie);
      const rest = positie - heel;
      if (rest > 0 && heel === simsTot) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.l, plot.t, plot.r - plot.l, plot.b - plot.t);
        ctx.clip();
        ctx.strokeStyle = kleuren.sim;
        ctx.lineWidth = 1;
        for (let p = 0; p < AANTAL_ILLUSTRATIEF; p++) {
          ctx.beginPath();
          simsPad(ctx, p, heel, heel, rest);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    tekenBand(zicht.band * st.band);
    tekenLijn(d.formule, st.formule, kleuren.formule, 1.6, [6, 5], zicht.formule);
    const kop = tekenLijn(d.mc, st.mc, kleuren.mc, 2.5, null, 1);
    if (kop && st.mc < 1) {
      cirkel(kop.x, kop.y, 10, "rgba(" + kleuren.bandRgb + ", 0.2)", null);
      cirkel(kop.x, kop.y, 4.5, kleuren.mc, kleuren.vlak, 1.5);
    }
    tekenMarkers(st.markers);
    if (hoverDag !== null && klaar) tekenCrosshair();
  }

  function fase(t, [a, b]) {
    return klem((t - a) / (b - a), 0, 1);
  }

  function werkAnimatieBij(t) {
    st.raster = easeUit(fase(t, T.raster));
    st.sims = easeUit(fase(t, T.sims));
    tekenSimsTot(Math.floor(st.sims * d.N));
    st.band = fase(t, T.band);
    st.formule = easeInUit(fase(t, T.formule));
    st.mc = easeInUit(fase(t, T.mc));
    st.markers = fase(t, T.markers);
    if (!anim.kaarten && t >= T.markers[0]) {
      anim.kaarten = true;
      waarden.speel();
    }
    if (t >= T.markers[1]) {
      anim.bezig = false;
      klaar = true;
    }
  }

  function lus(tijd) {
    rafId = 0;
    const dt = vorigeTijd ? Math.min(64, tijd - vorigeTijd) : 16;
    vorigeTijd = tijd;
    let doorgaan = false;
    if (anim.bezig) {
      werkAnimatieBij(tijd - anim.start);
      doorgaan = anim.bezig;
    }
    for (const sleutel of ["band", "formule"]) {
      const verschil = doel[sleutel] - zicht[sleutel];
      if (Math.abs(verschil) > 0.001) {
        zicht[sleutel] += Math.sign(verschil) * Math.min(Math.abs(verschil), dt / 280);
        doorgaan = true;
      } else {
        zicht[sleutel] = doel[sleutel];
      }
    }
    render();
    if (doorgaan) vraagFrame();
    else vorigeTijd = 0;
  }

  function vraagFrame() {
    if (!rafId) rafId = requestAnimationFrame(lus);
  }

  function eindstand() {
    anim.bezig = false;
    st = { raster: 1, sims: 1, band: 1, formule: 1, mc: 1, markers: 1 };
    zicht.band = doel.band;
    zicht.formule = doel.formule;
    tekenSimsTot(d.N);
    klaar = true;
    waarden.speel();
    vraagFrame();
  }

  function speelAf() {
    if (!d) return;
    if (wachter) { wachter.disconnect(); wachter = null; }
    verbergHover();
    simsCtx.setTransform(1, 0, 0, 1, 0, 0);
    simsCtx.clearRect(0, 0, simsLaag.width, simsLaag.height);
    simsTot = 0;
    klaar = false;
    if (weinigBeweging()) {
      eindstand();
      return;
    }
    waarden.verberg();
    st = { raster: 0, sims: 0, band: 0, formule: 0, mc: 0, markers: 0 };
    anim = { bezig: true, start: performance.now(), kaarten: false };
    vraagFrame();
  }

  function startAlsZichtbaar() {
    if (weinigBeweging() || !("IntersectionObserver" in window)) {
      speelAf();
      return;
    }
    waarden.verberg();
    wachter = new IntersectionObserver((items) => {
      if (items[0].isIntersecting) speelAf();
    }, { threshold: 0.35 });
    wachter.observe(wrap);
  }

  function schrijfSamenvatting() {
    const tekst =
      "Samenvatting van de grafiek: voorspelde koers van " + d.ticker + " over " + geheel(d.N) +
      " handelsdagen. Het startpunt S0 is " + koers(d.S0) + " (laatste koers). De Monte Carlo-mediaan eindigt op " +
      koers(d.mc[d.N]) + " en de formulelijn op " + koers(d.formule[d.N]) + ".";
    zetTekst("grafiek-samenvatting", tekst);
    canvas.setAttribute("aria-label", "Geanimeerde grafiek van de voorspelling voor " + d.ticker);
  }

  // ---- hover-crosshair, tooltip en toetsenbord ----
  function rij(label, waarde, swKlasse) {
    const regel = document.createElement("div");
    regel.className = "tooltip-rij";
    const links = document.createElement("span");
    const sw = document.createElement("span");
    sw.className = "sw " + swKlasse;
    links.append(sw, document.createTextNode(label));
    const rechts = document.createElement("strong");
    rechts.textContent = waarde;
    regel.append(links, rechts);
    return regel;
  }

  function tooltipRegels(dag) {
    const kop = dag === 0 ? "Dag 0 · laatste koers (S0)" : "Dag " + geheel(dag) + " · ± " + fmtEen.format(dag / 21) + " maanden";
    const regels = [["Monte Carlo-mediaan", koers(d.mc[dag]), ""]];
    if (doel.formule) regels.push(["Formule", koers(d.formule[dag]), "sw-formule"]);
    if (doel.band) regels.push(["90%-bereik", koers(d.onder[dag]) + " – " + koers(d.boven[dag]), "sw-band"]);
    return { kop, regels };
  }

  function vulTooltip(dag) {
    const { kop, regels } = tooltipRegels(dag);
    const kopEl = document.createElement("div");
    kopEl.className = "tooltip-kop";
    kopEl.textContent = kop;
    const inhoud = [kopEl, ...regels.map(([label, waarde, klasse]) => rij(label, waarde, klasse))];
    if (doel.band) {
      const noot = document.createElement("div");
      noot.className = "tooltip-noot";
      noot.textContent = "90%-bereik: berekend uit de formule (illustratief).";
      inhoud.push(noot);
    }
    tooltip.replaceChildren(...inhoud);
    tooltip.hidden = false;

    const x = xPx(dag);
    const breedte = tooltip.offsetWidth;
    const hoogte = tooltip.offsetHeight;
    let links = x + 16;
    if (links + breedte > B - 4) links = x - 16 - breedte;
    links = klem(links, 4, Math.max(4, B - breedte - 4));
    const boven = klem(yPx(d.mc[dag]) - hoogte - 14, 4, Math.max(4, H - hoogte - 4));
    tooltip.style.transform = "translate(" + Math.round(links) + "px, " + Math.round(boven) + "px)";
  }

  function zetHover(dag) {
    hoverDag = klem(dag, 0, d.N);
    vulTooltip(hoverDag);
    vraagFrame();
  }

  function verbergHover() {
    if (hoverDag === null) return;
    hoverDag = null;
    tooltip.hidden = true;
    vraagFrame();
  }

  function dagBijPositie(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < plot.l - 12 || x > plot.r + 12) return null;
    return Math.round(klem((x - plot.l) / (plot.r - plot.l), 0, 1) * d.N);
  }

  function opAanwijzer(event) {
    if (!d || !klaar) return;
    const dag = dagBijPositie(event.clientX);
    if (dag === null) verbergHover();
    else zetHover(dag);
  }

  canvas.addEventListener("pointermove", opAanwijzer);
  canvas.addEventListener("pointerdown", opAanwijzer);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") verbergHover();
  });
  canvas.addEventListener("keydown", (event) => {
    if (!d || !klaar) return;
    const huidig = hoverDag === null ? d.N : hoverDag;
    const sprong = event.shiftKey ? 21 : 1;
    let nieuw = null;
    if (event.key === "ArrowRight") nieuw = huidig + sprong;
    else if (event.key === "ArrowLeft") nieuw = huidig - sprong;
    else if (event.key === "Home") nieuw = 0;
    else if (event.key === "End") nieuw = d.N;
    else if (event.key === "Escape") { verbergHover(); return; }
    if (nieuw === null) return;
    event.preventDefault();
    zetHover(nieuw);
    const { kop, regels } = tooltipRegels(hoverDag);
    zetTekst("grafiek-live", kop + ". " + regels.map(([label, waarde]) => label + " " + waarde).join(". ") + ".");
  });
  canvas.addEventListener("focus", () => {
    if (d && klaar && hoverDag === null) zetHover(d.N);
  });
  canvas.addEventListener("blur", verbergHover);

  // ---- schakelaars en knop ----
  const bandSchakelaar = $("#toon-band");
  const formuleSchakelaar = $("#toon-formule");
  function werkSchakelaarsBij() {
    doel.band = bandSchakelaar.checked ? 1 : 0;
    doel.formule = formuleSchakelaar.checked ? 1 : 0;
    $(".legenda-band").classList.toggle("is-uit", !doel.band);
    $(".legenda-formule").classList.toggle("is-uit", !doel.formule);
    if (weinigBeweging()) {
      zicht.band = doel.band;
      zicht.formule = doel.formule;
    }
    if (d && hoverDag !== null) vulTooltip(hoverDag);
    vraagFrame();
  }
  bandSchakelaar.addEventListener("change", werkSchakelaarsBij);
  formuleSchakelaar.addEventListener("change", werkSchakelaarsBij);
  $("#opnieuw-knop").addEventListener("click", speelAf);
  werkSchakelaarsBij();

  // ---- herberekenen bij resize en themawissel (scherp op retina) ----
  function herbouw() {
    if (!d || uitkomstBlok.hidden) return;
    meetIndeling();
    bouwRaster();
    herbouwSims();
    if (hoverDag !== null) vulTooltip(hoverDag);
    vraagFrame();
  }
  let resizeTimer = 0;
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(herbouw, 120);
    }).observe(wrap);
  } else {
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(herbouw, 120);
    });
  }
  window.matchMedia("(resolution: 1dppx)").addEventListener?.("change", herbouw);
  document.addEventListener("themawissel", () => {
    leesKleuren();
    herbouw();
  });

  return {
    zetData(data) {
      if (wachter) { wachter.disconnect(); wachter = null; }
      leesKleuren();
      d = bereidDataVoor(data);
      hoverDag = null;
      tooltip.hidden = true;
      simsTot = 0;
      st = { raster: 0, sims: 0, band: 0, formule: 0, mc: 0, markers: 0 };
      klaar = false;
      meetIndeling();
      bouwRaster();
      herbouwSims();
      schrijfSamenvatting();
      render();
      startAlsZichtbaar();
    },
  };
})();
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: starten vanuit de adresbalk (?aandeel=ASML&maanden=12), handig om een link te delen
(() => {
  const parameters = new URLSearchParams(window.location.search);
  const aandeel = parameters.get("aandeel");
  if (!aandeel) return;
  tickerInvoer.value = aandeel.slice(0, 12);
  const maanden = parameters.get("maanden");
  if (maanden && /^\d{1,2}$/.test(maanden)) zetMaanden(maanden);
  markeerChip();
  const invoer = valideer();
  if (invoer) voorspel(invoer);
})();
// # EINDE CLAUDE CODE #
