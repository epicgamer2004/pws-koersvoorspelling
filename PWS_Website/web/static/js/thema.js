// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Bestand: web/static/js/thema.js
// Wordt in de <head> geladen, nog voordat de pagina getekend wordt. Zet het gekozen
// thema (licht of donker) alvast klaar, zodat de pagina niet eerst in de verkeerde kleur flitst.
// # EINDE CLAUDE CODE #

// # BEGIN CLAUDE CODE: weergave, geen modelcode #
// Onderdeel: thema vooraf instellen
(function () {
  var root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");
  try {
    var opgeslagen = window.localStorage.getItem("pws-thema");
    if (opgeslagen === "light" || opgeslagen === "dark") {
      root.setAttribute("data-theme", opgeslagen);
    }
  } catch (e) {
    // localStorage is niet beschikbaar (bijvoorbeeld privévenster): dan volgen we het systeem.
  }
  var systeemDonker = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-thema-actief", root.getAttribute("data-theme") || (systeemDonker ? "dark" : "light"));
})();
// # EINDE CLAUDE CODE #
