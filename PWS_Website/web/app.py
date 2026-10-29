# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Bestand: web/app.py
# Webserver (FastAPI) rond het bestaande model model_voorspelling.py.
# Het model wordt als zwarte doos aangeroepen: de invoer gaat via stdin,
# de uitvoer (stdout, CSV en PNG) wordt ingelezen en als JSON doorgegeven.
# Dit bestand bevat GEEN financiële berekeningen; alle cijfers komen uit het model.
# EINDE CLAUDE CODE #

# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: imports en instellingen
import csv
import glob
import hashlib
import io
import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import weakref
from collections import OrderedDict, deque
from datetime import date, datetime, timezone
from typing import Any, Deque, Dict, List, Optional, Tuple

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

WEB_MAP = os.path.dirname(os.path.abspath(__file__))
PROJECT_MAP = os.path.dirname(WEB_MAP)
MODEL_PAD = os.environ.get("MODEL_PAD", os.path.join(PROJECT_MAP, "model_voorspelling.py"))
STATIC_MAP = os.path.join(WEB_MAP, "static")

TICKER_PATROON = re.compile(r"^[A-Za-z0-9.\-]{1,12}$")
MIN_MAANDEN = 1
MAX_MAANDEN = 24
STANDAARD_MAANDEN = 12
MODEL_TIMEOUT = 90
MAX_BODY = 2048

MAX_GELIJKTIJDIG = int(os.environ.get("MAX_GELIJKTIJDIG", "2"))
WACHTTIJD_WACHTRIJ = int(os.environ.get("WACHTTIJD_WACHTRIJ", "60"))
CACHE_TTL = int(os.environ.get("CACHE_TTL", "3600"))
CACHE_MAX = int(os.environ.get("CACHE_MAX", "64"))
RATE_LIMIT_AANTAL = int(os.environ.get("RATE_LIMIT_AANTAL", "20"))
RATE_LIMIT_VENSTER = int(os.environ.get("RATE_LIMIT_VENSTER", "600"))
VERTROUW_PROXY = os.environ.get("VERTROUW_PROXY", "0") == "1"

VOORBEELDEN = "ASML, AAPL of HEIA"
ALGEMENE_FOUT = (
    "Er ging iets mis bij het draaien van het model. "
    "Probeer het over een paar minuten opnieuw of kies een ander aandeel."
)
CSV_KOLOMMEN = ["Dag", "Voorspelling formule", "Voorspelling Monte Carlo"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pws")
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: vaste waarden uit het modelbestand lezen (alleen lezen, nooit aanpassen)
def _lees_modelbron() -> str:
    with open(MODEL_PAD, "r", encoding="utf-8") as bestand:
        return bestand.read()


def _zoek_int(bron: str, patroon: str) -> Optional[int]:
    gevonden = re.search(patroon, bron, re.MULTILINE)
    return int(gevonden.group(1)) if gevonden else None


_MODELBRON = _lees_modelbron()
MODEL_INFO = {
    "getekend": _zoek_int(_MODELBRON, r"^getekend\s*=\s*(\d+)\s*$"),
    "simulaties": _zoek_int(_MODELBRON, r"^aantal\s*=\s*(\d+)\s*$"),
    "seed": _zoek_int(_MODELBRON, r"np\.random\.seed\(\s*(\d+)\s*\)"),
}
MODEL_SHA256 = hashlib.sha256(_MODELBRON.encode("utf-8")).hexdigest()
log.info("Model: %s (sha256 %s), info uit bron: %s", MODEL_PAD, MODEL_SHA256, MODEL_INFO)
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: foutklassen en invoervalidatie
class GebruikersFout(Exception):
    """Fout met een vriendelijke Nederlandse melding die de gebruiker mag zien."""

    def __init__(self, status: int, melding: str, headers: Optional[Dict[str, str]] = None):
        super().__init__(melding)
        self.status = status
        self.melding = melding
        self.headers = headers or {}


class UitvoerFout(Exception):
    """De uitvoer van het model heeft niet het verwachte formaat (interne fout)."""


def valideer_invoer(data: Any) -> Tuple[str, int]:
    if not isinstance(data, dict):
        raise GebruikersFout(400, "Ongeldig verzoek. Vul een aandeel en een aantal maanden in.")

    ticker = data.get("ticker")
    if not isinstance(ticker, str) or not ticker.strip():
        raise GebruikersFout(400, "Vul de naam van een aandeel in, bijvoorbeeld ASML.")
    ticker = ticker.strip()
    if not TICKER_PATROON.match(ticker):
        raise GebruikersFout(
            400,
            "De naam van het aandeel mag alleen letters, cijfers, een punt of een streepje "
            "bevatten (maximaal 12 tekens).",
        )

    maanden_ruw = data.get("maanden", STANDAARD_MAANDEN)
    maanden = None  # type: Optional[int]
    if isinstance(maanden_ruw, bool):
        maanden = None
    elif isinstance(maanden_ruw, int):
        maanden = maanden_ruw
    elif isinstance(maanden_ruw, float) and maanden_ruw.is_integer():
        maanden = int(maanden_ruw)
    elif isinstance(maanden_ruw, str) and re.fullmatch(r"\s*\d{1,3}\s*", maanden_ruw):
        maanden = int(maanden_ruw)
    if maanden is None or not (MIN_MAANDEN <= maanden <= MAX_MAANDEN):
        raise GebruikersFout(
            400,
            "Het aantal maanden moet een heel getal van {} tot en met {} zijn.".format(MIN_MAANDEN, MAX_MAANDEN),
        )
    return ticker.upper(), maanden
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: uitvoer van het model inlezen (stdout en CSV) - alleen omzetten, niets uitrekenen
GETAL = r"([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"

STDOUT_PATRONEN = {
    "ticker": r"Gebruikte ticker:[ \t]*(\S+)",
    "eerste_datum": r"Eerste datum:[ \t]*(\d{4}-\d{2}-\d{2})",
    "laatste_datum": r"Laatste datum:[ \t]*(\d{4}-\d{2}-\d{2})",
    "aantal_dagen_data": r"Aantal dagen:[ \t]*(\d+)",
    "lege_waarden": r"Lege waarden:[ \t]*(\d+)",
    "aantal_logrendementen": r"Aantal logrendementen:[ \t]*(\d+)",
    "nu": r"^nu = " + GETAL + r"[ \t]*$",
    "sigma": r"^sigma = " + GETAL + r"[ \t]*$",
    "mu": r"^mu = " + GETAL + r"[ \t]*$",
    "S0": r"^S0 = " + GETAL + r"[ \t]*$",
}
GEHEEL = {"aantal_dagen_data", "lege_waarden", "aantal_logrendementen"}
KOMMAGETAL = {"nu", "sigma", "mu", "S0"}
EIND_FORMULE = re.compile(r"Voorspelling na (\d+) maanden:[ \t]*" + GETAL)
EIND_MC = re.compile(r"Voorspelling na (\d+) maanden \(Monte Carlo\):[ \t]*" + GETAL)


def _als_getal(tekst: str, veld: str) -> float:
    waarde = float(tekst)
    if not math.isfinite(waarde):
        raise UitvoerFout("Veld {} is geen eindig getal: {!r}".format(veld, tekst))
    return waarde


def parse_stdout(stdout: str, maanden: int) -> Dict[str, Any]:
    resultaat = {}  # type: Dict[str, Any]
    ontbrekend = []  # type: List[str]
    for veld, patroon in STDOUT_PATRONEN.items():
        gevonden = re.search(patroon, stdout, re.MULTILINE)
        if not gevonden:
            ontbrekend.append(veld)
            continue
        tekst = gevonden.group(1)
        if veld in GEHEEL:
            resultaat[veld] = int(tekst)
        elif veld in KOMMAGETAL:
            resultaat[veld] = _als_getal(tekst, veld)
        else:
            resultaat[veld] = tekst

    formule = EIND_FORMULE.search(stdout)
    mc = EIND_MC.search(stdout)
    if not formule:
        ontbrekend.append("Voorspelling na .. maanden")
    if not mc:
        ontbrekend.append("Voorspelling na .. maanden (Monte Carlo)")
    if ontbrekend:
        raise UitvoerFout("Ontbrekende velden in stdout: " + ", ".join(ontbrekend))

    for gevonden, naam in ((formule, "formule"), (mc, "Monte Carlo")):
        if int(gevonden.group(1)) != maanden:
            raise UitvoerFout(
                "Model meldt {} maanden ({}), gevraagd was {}".format(gevonden.group(1), naam, maanden)
            )
    resultaat["eind_formule"] = _als_getal(formule.group(2), "eind_formule")
    resultaat["eind_mc"] = _als_getal(mc.group(2), "eind_mc")
    resultaat["maanden"] = maanden
    return resultaat


def parse_csv(tekst: str) -> Dict[str, List[Any]]:
    lezer = csv.reader(io.StringIO(tekst))
    try:
        kop = next(lezer)
    except StopIteration:
        raise UitvoerFout("CSV is leeg")
    if kop != CSV_KOLOMMEN:
        raise UitvoerFout("Onverwachte CSV-kolommen: {!r}".format(kop))

    dag = []  # type: List[int]
    formule = []  # type: List[float]
    mc_mediaan = []  # type: List[float]
    for regelnummer, rij in enumerate(lezer, start=2):
        if not rij:
            continue
        if len(rij) != 3:
            raise UitvoerFout("CSV-regel {} heeft {} kolommen".format(regelnummer, len(rij)))
        try:
            dag.append(int(rij[0]))
            formule.append(_als_getal(rij[1], "formule"))
            mc_mediaan.append(_als_getal(rij[2], "Monte Carlo"))
        except ValueError:
            raise UitvoerFout("CSV-regel {} bevat geen getallen: {!r}".format(regelnummer, rij))

    if not dag:
        raise UitvoerFout("CSV bevat geen rijen")
    if dag != list(range(1, len(dag) + 1)):
        raise UitvoerFout("CSV-dagen lopen niet netjes op vanaf 1")
    return {"dag": dag, "formule": formule, "mc_mediaan": mc_mediaan}


def parse_uitvoer(stdout: str, csv_tekst: str, maanden: int) -> Dict[str, Any]:
    resultaat = parse_stdout(stdout, maanden)
    tabel = parse_csv(csv_tekst)
    resultaat.update(tabel)
    resultaat["dagen"] = tabel["dag"][-1]

    if resultaat["dagen"] != maanden * 21:
        log.warning("Aantal CSV-rijen (%s) wijkt af van maanden * 21 (%s)", resultaat["dagen"], maanden * 21)
    if tabel["formule"][-1] != resultaat["eind_formule"] or tabel["mc_mediaan"][-1] != resultaat["eind_mc"]:
        log.warning(
            "Eindwaarden stdout (%s / %s) en laatste CSV-rij (%s / %s) verschillen",
            resultaat["eind_formule"], resultaat["eind_mc"], tabel["formule"][-1], tabel["mc_mediaan"][-1],
        )
    return resultaat
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: het model draaien als zwarte doos
_MPL_MAP = tempfile.mkdtemp(prefix="pws_mpl_")
_DOOR_TE_GEVEN = (
    "PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TZ", "SYSTEMROOT",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
)


def _model_omgeving() -> Dict[str, str]:
    omgeving = {naam: os.environ[naam] for naam in _DOOR_TE_GEVEN if naam in os.environ}
    omgeving.update({
        "MPLBACKEND": "Agg",
        "PYTHONUNBUFFERED": "1",
        "PYTHONIOENCODING": "utf-8",
        "MPLCONFIGDIR": _MPL_MAP,
    })
    return omgeving


def _schone_stderr(stderr: str) -> str:
    """Laat onschuldige waarschuwingen weg, zodat het serverlog leesbaar blijft."""
    ruis = ("NotOpenSSLWarning", "warnings.warn(", "FigureCanvasAgg is non-interactive", "plt.show()")
    regels = [r for r in stderr.splitlines() if r.strip() and not any(x in r for x in ruis)]
    return "\n".join(regels[-25:])


def draai_model(ticker: str, maanden: int) -> Dict[str, Any]:
    werkmap = tempfile.mkdtemp(prefix="pws_run_")
    begin = time.monotonic()
    try:
        try:
            proces = subprocess.run(
                [sys.executable, MODEL_PAD],
                input="{}\n{}\n".format(ticker, maanden),
                capture_output=True,
                text=True,
                timeout=MODEL_TIMEOUT,
                cwd=werkmap,
                env=_model_omgeving(),
            )
        except subprocess.TimeoutExpired:
            log.error("Model-timeout na %s s voor %s / %s", MODEL_TIMEOUT, ticker, maanden)
            raise GebruikersFout(
                504, "Het model deed er te lang over. Misschien is de koersbron traag; probeer het zo opnieuw."
            )

        duur = time.monotonic() - begin
        if proces.returncode != 0:
            if "Geen of te weinig data gevonden" in proces.stderr:
                log.info("Geen data voor %s (%.1f s)", ticker, duur)
                raise GebruikersFout(
                    404, "We vonden geen koersdata voor {}; probeer bijvoorbeeld {}.".format(ticker, VOORBEELDEN)
                )
            log.error(
                "Model stopte met exitcode %s voor %s / %s:\n%s",
                proces.returncode, ticker, maanden, _schone_stderr(proces.stderr),
            )
            raise GebruikersFout(500, ALGEMENE_FOUT)

        csv_paden = glob.glob(os.path.join(werkmap, "voorspelling_*.csv"))
        png_paden = glob.glob(os.path.join(werkmap, "voorspelling_*.png"))
        if len(csv_paden) != 1 or len(png_paden) != 1:
            raise UitvoerFout("Verwacht 1 CSV en 1 PNG, gevonden: {} en {}".format(len(csv_paden), len(png_paden)))

        with open(csv_paden[0], "rb") as bestand:
            csv_bytes = bestand.read()
        with open(png_paden[0], "rb") as bestand:
            png_bytes = bestand.read()

        data = parse_uitvoer(proces.stdout, csv_bytes.decode("utf-8"), maanden)
        data["invoer"] = ticker
        data.update(MODEL_INFO)
        log.info("Model klaar voor %s / %s maanden in %.1f s (ticker %s)", ticker, maanden, duur, data["ticker"])
        return {
            "data": data,
            "csv": csv_bytes,
            "png": png_bytes,
            "csv_naam": _veilige_bestandsnaam(os.path.basename(csv_paden[0])),
        }
    except UitvoerFout as fout:
        log.error("Uitvoer van het model niet zoals verwacht voor %s / %s: %s", ticker, maanden, fout)
        raise GebruikersFout(500, ALGEMENE_FOUT)
    finally:
        shutil.rmtree(werkmap, ignore_errors=True)


def _veilige_bestandsnaam(naam: str) -> str:
    return re.sub(r"[^A-Za-z0-9._\-]", "_", naam)
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: cache (sleutel = ticker, maanden, datum; TTL ongeveer 1 uur)
class Cache:
    def __init__(self, ttl: int, maximum: int):
        self.ttl = ttl
        self.maximum = maximum
        self._items = OrderedDict()  # type: OrderedDict
        self._lock = threading.Lock()

    def get(self, sleutel: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            item = self._items.get(sleutel)
            if item is None:
                return None
            verloopt, waarde = item
            if verloopt < time.monotonic():
                del self._items[sleutel]
                return None
            self._items.move_to_end(sleutel)
            return waarde

    def put(self, sleutel: str, waarde: Dict[str, Any]) -> None:
        with self._lock:
            self._items[sleutel] = (time.monotonic() + self.ttl, waarde)
            self._items.move_to_end(sleutel)
            while len(self._items) > self.maximum:
                self._items.popitem(last=False)


def cache_sleutel(ticker: str, maanden: int) -> str:
    tekst = "{}|{}|{}".format(ticker, maanden, date.today().isoformat())
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()[:16]


CACHE = Cache(CACHE_TTL, CACHE_MAX)
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: gelijktijdigheid (maximaal N modelruns tegelijk, geen dubbele runs voor dezelfde vraag)
_SEMAFOOR = threading.BoundedSemaphore(MAX_GELIJKTIJDIG)


class _Slot:
    def __init__(self) -> None:
        self.lock = threading.Lock()


_SLOTS = weakref.WeakValueDictionary()  # type: weakref.WeakValueDictionary
_SLOTS_LOCK = threading.Lock()


def _slot_voor(sleutel: str) -> _Slot:
    with _SLOTS_LOCK:
        slot = _SLOTS.get(sleutel)
        if slot is None:
            slot = _Slot()
            _SLOTS[sleutel] = slot
        return slot


def voorspelling_ophalen(ticker: str, maanden: int) -> Tuple[str, Dict[str, Any], bool]:
    sleutel = cache_sleutel(ticker, maanden)
    item = CACHE.get(sleutel)
    if item is not None:
        return sleutel, item, True

    slot = _slot_voor(sleutel)
    with slot.lock:
        item = CACHE.get(sleutel)
        if item is not None:
            return sleutel, item, True
        if not _SEMAFOOR.acquire(timeout=WACHTTIJD_WACHTRIJ):
            raise GebruikersFout(503, "Het is op dit moment erg druk. Probeer het over een minuut opnieuw.")
        try:
            item = draai_model(ticker, maanden)
        finally:
            _SEMAFOOR.release()
        item["data"]["gegenereerd_op"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        CACHE.put(sleutel, item)
        return sleutel, item, False
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: eenvoudige rate limit per IP-adres (schuivend venster)
_VERZOEKEN = {}  # type: Dict[str, Deque[float]]
_VERZOEKEN_LOCK = threading.Lock()


def _client_ip(request: Request) -> str:
    if VERTROUW_PROXY:
        doorgestuurd = request.headers.get("x-forwarded-for", "")
        if doorgestuurd:
            return doorgestuurd.split(",")[0].strip()
    return request.client.host if request.client else "onbekend"


def controleer_rate_limit(ip: str) -> None:
    nu_tijd = time.monotonic()
    with _VERZOEKEN_LOCK:
        if len(_VERZOEKEN) > 10000:
            for oud_ip in [k for k, v in _VERZOEKEN.items() if not v or v[-1] < nu_tijd - RATE_LIMIT_VENSTER]:
                del _VERZOEKEN[oud_ip]
        tijden = _VERZOEKEN.setdefault(ip, deque())
        while tijden and tijden[0] <= nu_tijd - RATE_LIMIT_VENSTER:
            tijden.popleft()
        if len(tijden) >= RATE_LIMIT_AANTAL:
            wacht = max(1, int(math.ceil(tijden[0] + RATE_LIMIT_VENSTER - nu_tijd)))
            raise GebruikersFout(
                429,
                "Je hebt veel voorspellingen kort achter elkaar gevraagd. "
                "Wacht ongeveer {} seconden en probeer het dan opnieuw.".format(wacht),
                {"Retry-After": str(wacht)},
            )
        tijden.append(nu_tijd)
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: FastAPI-app, beveiligingsheaders en endpoints
app = FastAPI(title="PWS koersvoorspelling", docs_url=None, redoc_url=None, openapi_url=None)

# Welke sites de pagina in een frame mogen tonen. Standaard niemand; bij Hugging Face Spaces
# toont huggingface.co de site in een frame, daarom kan dit via FRAME_ANCESTORS worden ingesteld.
FRAME_ANCESTORS = os.environ.get("FRAME_ANCESTORS", "").strip()
CSP = (
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; "
    "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; "
    "form-action 'self'; frame-ancestors " + (FRAME_ANCESTORS or "'none'")
)


@app.middleware("http")
async def beveiligingsheaders(request: Request, call_next):
    antwoord = await call_next(request)
    antwoord.headers.setdefault("X-Content-Type-Options", "nosniff")
    antwoord.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if not FRAME_ANCESTORS:
        antwoord.headers.setdefault("X-Frame-Options", "DENY")
    antwoord.headers.setdefault("Content-Security-Policy", CSP)
    if request.url.path.startswith("/static/"):
        antwoord.headers.setdefault("Cache-Control", "no-cache")
    return antwoord


def _fout_antwoord(fout: GebruikersFout) -> JSONResponse:
    return JSONResponse({"fout": fout.melding}, status_code=fout.status, headers=fout.headers)


@app.post("/api/voorspel")
async def api_voorspel(request: Request):
    try:
        controleer_rate_limit(_client_ip(request))
        ruw = await request.body()
        if len(ruw) > MAX_BODY:
            raise GebruikersFout(413, "Het verzoek is te groot.")
        try:
            invoer = json.loads(ruw.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            raise GebruikersFout(400, "Ongeldig verzoek. Vul een aandeel en een aantal maanden in.")
        ticker, maanden = valideer_invoer(invoer)
        sleutel, item, uit_cache = await run_in_threadpool(voorspelling_ophalen, ticker, maanden)
    except GebruikersFout as fout:
        return _fout_antwoord(fout)
    except Exception:
        log.exception("Onverwachte fout in /api/voorspel")
        return JSONResponse({"fout": ALGEMENE_FOUT}, status_code=500)

    antwoord = dict(item["data"])
    antwoord["uit_cache"] = uit_cache
    antwoord["csv_url"] = "/api/bestand/{}/csv".format(sleutel)
    antwoord["png_url"] = "/api/bestand/{}/png".format(sleutel)
    antwoord["csv_bestandsnaam"] = item["csv_naam"]
    return JSONResponse(antwoord)


@app.get("/api/bestand/{sleutel}/{soort}")
def api_bestand(sleutel: str, soort: str):
    if not re.fullmatch(r"[0-9a-f]{16}", sleutel) or soort not in ("csv", "png"):
        return JSONResponse({"fout": "Bestand niet gevonden."}, status_code=404)
    item = CACHE.get(sleutel)
    if item is None:
        return JSONResponse(
            {"fout": "Dit bestand is verlopen. Vraag de voorspelling opnieuw op."}, status_code=404
        )
    if soort == "csv":
        return Response(
            item["csv"],
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="{}"'.format(item["csv_naam"])},
        )
    return Response(item["png"], media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/status")
def api_status():
    return {"ok": True, "model_gevonden": os.path.isfile(MODEL_PAD)}


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_MAP, "index.html"), headers={"Cache-Control": "no-cache"})


app.mount("/static", StaticFiles(directory=STATIC_MAP), name="static")
# EINDE CLAUDE CODE #
