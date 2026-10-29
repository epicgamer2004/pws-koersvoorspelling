<!-- # BEGIN CLAUDE CODE: opmaak, geen modelcode # -->
<!-- Bestand: README.md - uitleg bij de website rond model_voorspelling.py -->

# Koersvoorspelling met Monte Carlo (PWS-website)

Een webpagina rond het bestaande model `model_voorspelling.py` (profielwerkstuk, VWO 6).
Een bezoeker vult een aandeel (bijvoorbeeld `ASML`) en een aantal maanden in. De server
draait het model **ongewijzigd** en de pagina laat de uitkomst zien: een geanimeerde
grafiek, begin- en eindwaarden, de dagtabel, de originele PNG van het model, de parameters
in gewone taal, uitleg, een FAQ en informatie over het profielwerkstuk.

> Dit is een schoolproject en **geen beleggingsadvies**.

---

## 1. Welke bestanden zijn er?

```
PWS_Website/
├── model_voorspelling.py        ← het model (NIET aangepast, alleen gelezen en uitgevoerd)
├── web/
│   ├── app.py                   ← webserver (FastAPI): roept het model aan, leest stdout + CSV + PNG
│   └── static/
│       ├── index.html           ← de pagina
│       ├── css/style.css        ← opmaak (licht en donker)
│       ├── js/thema.js          ← zet licht/donker vóór het tekenen (geen flits)
│       ├── js/app.js            ← formulier, grafiek-animatie, kaarten, tabel
│       └── favicon.svg
├── tests/
│   ├── test_contract.py         ← controleert het stdout- en CSV-formaat van het model
│   └── mock_yfinance/yfinance.py← nagemaakte yfinance (nepkoersen) voor de test
├── requirements-web.txt         ← vaste versies van alle pakketten
├── Dockerfile, .dockerignore    ← om de site als container te hosten
└── README.md
```

Al mijn code staat tussen markers zoals `# BEGIN CLAUDE CODE: koppeling, geen modelcode #`
en `# EINDE CLAUDE CODE #` (in HTML/CSS/JS de varianten met `<!-- -->`, `/* */` en `//`).
In `model_voorspelling.py` staat niets van mij.

### API

| Methode | Pad | Wat |
|---|---|---|
| `POST` | `/api/voorspel` | body `{"ticker": "ASML", "maanden": 12}` → JSON met de uitkomst |
| `GET` | `/api/bestand/<id>/csv` | de originele CSV van het model, byte voor byte ongewijzigd (download) |
| `GET` | `/api/bestand/<id>/png` | de originele PNG van het model |
| `GET` | `/api/status` | `{"ok": true}` (voor een health check) |
| `GET` | `/` | de pagina |

Bij een fout komt er altijd `{"fout": "<vriendelijke Nederlandse melding>"}` terug, nooit een traceback.

### Vorm van het JSON-antwoord

```json
{
  "ticker": "ASML.AS", "invoer": "ASML",
  "eerste_datum": "2016-10-31", "laatste_datum": "2026-10-29",
  "aantal_dagen_data": 2559, "lege_waarden": 0, "aantal_logrendementen": 2558,
  "nu": 0.2785, "sigma": 0.35, "mu": 0.3398, "S0": 1483.6,
  "maanden": 12, "dagen": 252,
  "dag": [1, 2, "..."], "formule": [1485.24, "..."], "mc_mediaan": [1485.27, "..."],
  "eind_formule": 1960.13, "eind_mc": 1953.61,
  "getekend": 1000, "simulaties": 10000, "seed": 42,
  "uit_cache": false, "gegenereerd_op": "2026-10-29T11:49:29+00:00",
  "csv_url": "/api/bestand/c35d783374b00088/csv", "png_url": "/api/bestand/c35d783374b00088/png",
  "csv_bestandsnaam": "voorspelling_ASML.AS.csv"
}
```

(De getallen hierboven komen uit een echte testrun; ze veranderen elke handelsdag.)
Alles behalve `invoer`, de URL's en `uit_cache`/`gegenereerd_op` komt uit de uitvoer van het
model: `nu`, `sigma`, `mu`, `S0`, de datums en tellingen uit stdout; `dag`, `formule` en
`mc_mediaan` uit de CSV; `getekend`, `simulaties` en `seed` worden uit de tekst van het
modelbestand gelezen.

---

## 2. Lokaal starten op macOS (stap voor stap)

Je hebt alleen de Terminal nodig (Programma's → Hulpprogramma's → Terminal).

1. **Ga naar de projectmap**
   ```bash
   cd /Users/hugoboelens/Documents/PWS_Website
   ```
2. **Maak één keer een eigen virtuele omgeving** (een aparte Python-map voor dit project).
   Sla deze stap over als de map `.venv` er al is.
   ```bash
   /usr/bin/python3 -m venv .venv
   ```
3. **Installeer één keer de pakketten** (dit duurt een paar minuten):
   ```bash
   .venv/bin/python -m pip install -r requirements-web.txt
   ```
4. **Start de website**
   ```bash
   .venv/bin/python -m uvicorn app:app --app-dir web --port 8000
   ```
   Je ziet dan iets als `Uvicorn running on http://127.0.0.1:8000`.
5. **Open in je browser:** <http://127.0.0.1:8000>
6. **Stoppen:** klik in de Terminal en druk op `Ctrl` + `C`.

De volgende keer heb je alleen stap 1, 4 en 5 nodig.

Opmerkingen:
- Gebruik de Python uit `.venv`, niet `/usr/bin/python3` (daar ontbreken de pakketten).
  De PWS-omgeving in `/Users/hugoboelens/PWS/.venv` wordt door deze website niet gebruikt of aangepast.
- De waarschuwing `NotOpenSSLWarning ... LibreSSL` is onschuldig; de website toont hem niet.
- Er is internet nodig, want het model haalt de koersen bij Yahoo Finance.

### Test draaien

```bash
.venv/bin/python -m unittest discover -s tests -v
```

De test draait het echte, ongewijzigde model met een nagemaakte `yfinance` (via `PYTHONPATH`),
dus zonder internet. Hij controleert de stdout-regels, de CSV-kolommen, het aantal rijen
(maanden × 21), de PNG, het foutgedrag (onbekend aandeel, te weinig data) en de invoercontrole
van de website.

---

## 3. Online zetten (een vaste link om te delen)

Hiervoor zijn twee gratis accounts nodig: **GitHub** (daar komen de bestanden te staan) en
**Render** (die draait de website). Je hebt geen git of Docker op je Mac nodig; alles gaat
via de website. (Hugging Face Spaces kan niet meer: Docker-Spaces vragen daar nu een betaald
abonnement.)

### 3a. Stap 1 – De bestanden op GitHub zetten

1. Ga naar <https://github.com/signup> en maak een account. Bevestig je e-mailadres.
2. Ga naar <https://github.com/new> (of klik rechtsboven op **+** → **New repository**).
   - **Repository name:** `pws-koersvoorspelling`
   - Kies **Public**.
   - Zet **geen** vinkje bij *Add a README file* (het project heeft er al een).
   - Klik onderaan op de groene knop **Create repository**.
3. Je ziet nu een bijna lege pagina. Klik in de zin *“…or create a new file or **uploading an
   existing file**”* op de blauwe link **uploading an existing file**.
4. Open in Finder de map `/Users/hugoboelens/Documents/PWS_Website` en sleep deze bestanden
   en mappen in één keer naar het grote vak op de GitHub-pagina:
   - `Dockerfile`
   - `requirements-web.txt`
   - `model_voorspelling.py`
   - `README.md`
   - de map `web` (sleep de map zelf, niet de bestanden erin)
   - de map `tests` (niet nodig om te draaien, wel handig om mee te leveren)

   Sleep **niet** de map `.venv` (die is groot en alleen voor je eigen Mac) en ook niet de
   bestanden `voorspelling_ASML.AS.csv` en `.png`.
5. Wacht tot alle bestanden in de lijst staan en klik onderaan op **Commit changes**.
6. Controleer dat je op de GitHub-pagina de map `web` ziet, en daarin `app.py` en de map
   `static` (met `index.html`, `css`, `js` en `favicon.svg`). Staan de bestanden uit `web`
   los bovenaan in plaats van in een map `web`, verwijder de repository dan
   (*Settings* → helemaal onderaan *Delete this repository*) en probeer stap 2 t/m 5 opnieuw.
7. Kopieer het adres uit de adresbalk, bijvoorbeeld
   `https://github.com/<jouw-gebruikersnaam>/pws-koersvoorspelling`.

### 3b. Stap 2 – De website starten op Render

1. Ga naar <https://dashboard.render.com/register> en maak een account (dat kan ook met
   **GitHub**). Een betaalmethode is voor het gratis plan niet nodig.
2. Klik in het dashboard rechtsboven op **+ New** → **Web Service**.
3. Kies bovenaan het tabblad **Public Git Repository**, plak het GitHub-adres uit stap 1.7
   en klik op **Connect**.
4. Vul het formulier in:
   - **Name:** bijvoorbeeld `pws-koersvoorspelling` (dit wordt een deel van de link)
   - **Language:** **Docker** (meestal al gekozen, omdat er een `Dockerfile` is)
   - **Branch:** `main`
   - **Region:** **Frankfurt (EU Central)**
   - **Instance Type:** **Free**
   - Laat de rest leeg of op de standaardwaarde staan.
5. Klik onderaan op **Deploy Web Service**.
6. Het bouwen duurt een paar minuten (de pakketten worden geïnstalleerd). Je kunt meekijken
   in het logboek. Als bovenaan **Live** staat, is de site online.
7. **De link om te delen** staat linksboven onder de naam van je service en ziet eruit als
   `https://pws-koersvoorspelling.onrender.com` (met de naam die je bij stap 4 koos; als die
   al bezet is, plakt Render er een paar tekens achter).

Goed om te weten:
- Het gratis plan **slaapt na 15 minuten zonder bezoekers**. De eerste bezoeker daarna ziet
  een laadscherm van Render; het opstarten duurt ongeveer een minuut. Open de link dus zelf
  even voordat je hem laat zien.
- Er draait online **één modelrun tegelijk** (het gratis plan heeft 512 MB geheugen; één run
  van 24 maanden gebruikt er ongeveer 320). Vraagt iemand anders tegelijk een voorspelling,
  dan wacht die even.
- **Iets aanpassen?** Upload het gewijzigde bestand opnieuw op GitHub (in de juiste map:
  open eerst die map, dan **Add file** → **Upload files**). Render bouwt de site daarna
  vanzelf opnieuw. Gebeurt dat niet, klik dan in Render op **Manual Deploy** → **Deploy
  latest commit**.
- Yahoo Finance blokkeert soms aanvragen vanaf servers van hostingdiensten. Het model meldt
  dan "Geen of te weinig data", en de website zegt dan dat er geen koersdata is, ook bij een
  bestaand aandeel als ASML. Probeer het dan later opnieuw. De cache (1 uur) beperkt het
  aantal aanvragen bij Yahoo. Test de link dus zelf voordat je hem doorstuurt.

### 3c. Met Docker op een andere plek

Elke hostingdienst die een Docker-container kan draaien, kan deze site ook hosten.

```bash
docker build -t pws-koersvoorspelling .
docker run -p 10000:10000 -e VERTROUW_PROXY=0 pws-koersvoorspelling
```

Daarna staat de site op <http://localhost:10000>. De container gebruikt `python:3.11-slim`,
installeert dezelfde pakketten als hierboven (inclusief yfinance, pandas, numpy, matplotlib),
draait als gewone gebruiker (niet als root) en heeft een health check op `/api/status`.
De poort is in te stellen met de omgevingsvariabele `PORT`.

**Proxy:** in de container staat `VERTROUW_PROXY=1`, want bij hostingdiensten staat de site
achter een proxy. Dan telt de rate limit per bezoeker (via de header `X-Forwarded-For`) in
plaats van per proxy. Hangt de container direct aan het internet, start dan met
`-e VERTROUW_PROXY=0`, want anders kan een bezoeker die header zelf invullen en zo de rate
limit ontlopen. (Het maximum aantal modelruns tegelijk blijft altijd gelden.)

### Instellingen (omgevingsvariabelen, allemaal optioneel)

| Variabele | Standaard | Betekenis |
|---|---|---|
| `MAX_GELIJKTIJDIG` | `2` (in Docker `1`) | hoeveel modelruns er tegelijk mogen draaien |
| `WACHTTIJD_WACHTRIJ` | `60` | seconden wachten op een vrije plek, daarna melding "erg druk" |
| `CACHE_TTL` | `3600` | hoe lang (seconden) een uitkomst bewaard wordt |
| `CACHE_MAX` | `64` | maximaal aantal uitkomsten in de cache |
| `RATE_LIMIT_AANTAL` | `20` | maximaal aantal verzoeken per IP-adres per venster |
| `RATE_LIMIT_VENSTER` | `600` | lengte van dat venster in seconden |
| `VERTROUW_PROXY` | `0` (in Docker `1`) | `1` = IP-adres uit `X-Forwarded-For` halen |
| `FRAME_ANCESTORS` | leeg | sites die de pagina in een frame mogen tonen; leeg = niemand |
| `PORT` | `10000` in Docker (Render stelt hem zelf in) | poort van de webserver (alleen in Docker gebruikt) |

---

## 4. Keuzes die ik gemaakt heb

- **FastAPI + uvicorn** als kleine webserver; de pagina is gewone HTML/CSS/JavaScript zonder
  build-stap, zonder frameworks en zonder externe CDN's of lettertypes (systeemfonts).
- **Het model is een zwarte doos.** Elke aanvraag draait
  `subprocess.run([sys.executable, model_voorspelling.py], input="TICKER\nMAANDEN\n", ...)`
  in een **nieuwe tijdelijke map**, met `timeout=90` en een minimale omgeving plus
  `MPLBACKEND=Agg` (anders blokkeert `plt.show()`), `PYTHONUNBUFFERED=1`,
  `PYTHONIOENCODING=utf-8` en `MPLCONFIGDIR`. Gebruikersinvoer gaat alleen via stdin, nooit
  via de shell. CSV en PNG worden met een glob (`voorspelling_*.csv/png`) gezocht.
- **`MPLCONFIGDIR`** is één tijdelijke map per serverproces (niet per aanvraag), zodat
  matplotlib zijn lettertype-cache niet bij elke aanvraag opnieuw hoeft te bouwen.
- **Invoercontrole vooraf:** ticker `^[A-Za-z0-9.\-]{1,12}$`, maanden een heel getal van 1 t/m 24
  (standaard 12). Zowel in de browser als op de server.
- **Cache** met sleutel (ticker, maanden, datum van vandaag) en TTL van 1 uur. Twee gelijke
  aanvragen tegelijk leiden tot één modelrun.
- **Maximaal 2 modelruns tegelijk** (het model gebruikt bij 24 maanden ruim 100 MB geheugen)
  en een **rate limit** per IP-adres (20 per 10 minuten), met een `Retry-After`-header.
- **Fouten:** "Geen of te weinig data" wordt "We vonden geen koersdata voor …; probeer
  bijvoorbeeld ASML, AAPL of HEIA." Alle andere fouten geven een algemene melding; de details
  (gefilterde stderr) komen alleen in het serverlog. Wijkt de stdout af van het verwachte
  formaat, dan logt de server precies welke velden ontbreken.
- **Beveiliging:** alle tekst wordt met `textContent` in de pagina gezet (geen `innerHTML`
  met invoer), er is een strikte Content-Security-Policy (alleen eigen bestanden), en er worden
  geen paden of tracebacks getoond.
- **Grafiek:** eigen Canvas-tekening, scherp op retina (`devicePixelRatio`), opnieuw berekend bij
  resize. Raster en assen staan op een eigen offscreen-canvas, de grijze lijnen op een tweede;
  daardoor blijft de hover-crosshair vloeiend. Animatie in drie fasen: (1) assen faden in en de
  1.000 grijze lijnen groeien ±2,5 s van links naar rechts, (2) de zwarte lijn tekent zichzelf
  met een meebewegende stip (de gestippelde formulelijn tegelijk), (3) markers, eindlabels en de
  kaarten met tellende getallen verschijnen. Ook met het toetsenbord te bedienen (pijltjes,
  Shift + pijl = 21 dagen, Home/End).
- **De y-as** loopt van ongeveer het 2,5%- tot het 97,5%-punt van de grijze lijnen (en omvat
  altijd het 90%-bereik en beide lijnen). Een paar extreme grijze lijnen vallen daardoor buiten
  beeld; anders zou de voorspellijn plat tegen de onderkant liggen.
- **Licht en donker:** volgt de systeeminstelling; de knop rechtsboven overschrijft dat (en
  onthoudt de keuze in de browser). De voorspellijn is zwart in licht en wit in donker.
- **Minder beweging:** bij `prefers-reduced-motion` staat alles direct in de eindstand.
- **Deelbare link:** na een voorspelling staat `?aandeel=ASML&maanden=12` in de adresbalk;
  wie die link opent, krijgt dezelfde voorspelling (meestal uit de cache).

### Wat de pagina zelf uitrekent (en zo labelt)

Alle modelcijfers komen uit stdout of CSV. Alleen dit wordt in de browser berekend:

1. **De grijze lijnen** – "illustratieve simulaties (1.000 van de 10.000)". Eigen generator
   (mulberry32, vaste seed 42, Box-Muller), stap `log-koers += nu·dt + sigma·√dt·Z`, `dt = 1/252`,
   start bij S0. Dit zijn **niet** de simulaties van het model (numpy gebruikt een andere generator).
2. **Het 90%-bereik** (aan/uit) – "berekend uit de formule":
   `S0 · exp(nu·t ± 1,645 · sigma · √t)`, `t = dag/252`.

Verder wordt alleen opgemaakt: getallen in nl-NL-notatie, parameters × 100 als "% per jaar",
"± maanden" = dag / 21 in de tooltip, en het **verschil** eindwaarde − S0 (absoluut en in % van
S0), zoals gevraagd. Dat verschil staat op de pagina vermeld als "in je browser berekend uit die
getoonde waarden". Dag 0 (= S0) is aan het begin van beide lijnen toegevoegd; de dagtabel en de
CSV-download bevatten alleen de rijen van het model.

---

## 5. Opmerkingen over het model

Het modelbestand is niet aangepast. Dit viel me op bij het lezen en draaien:

1. **Formaat wijkt licht af van de opdracht:** `nu`, `sigma`, `mu` en `S0` worden met `round()`
   geprint, dus zonder opvulnullen (`sigma = 0.35` in plaats van `0.3500`, `S0 = 1487.4`).
   De CSV doet hetzelfde (`1490.2`). De website leest dit met een regex en toont het netjes.
   De datums worden met tijd en tijdzone geprint (`2026-10-29 00:00:00+01:00`); de site
   gebruikt alleen het datumdeel.
2. **`plt.show()`** blokkeert zonder scherm. De website zet daarom `MPLBACKEND=Agg`; matplotlib
   schrijft dan een onschuldige waarschuwing (`FigureCanvasAgg is non-interactive`) naar stderr.
3. **Geen controle op het aantal maanden.** Tekst geeft een `ValueError`; `0` of een negatief
   getal geeft een lege reeks en dan een `IndexError` bij `pad[-1]`. De website laat alleen 1 t/m 24 toe.
4. **Gecorrigeerde slotkoersen:** `yf.Ticker(...).history()` gebruikt standaard
   `auto_adjust=True`. De kolom `Close` is dan gecorrigeerd voor splitsingen én dividend. De
   logrendementen (en dus nu, sigma en mu) bevatten daardoor indirect het effect van
   herbelegd dividend, terwijl S0 gewoon de laatste koers is. Goed om te noemen in het verslag.
5. **Ontbrekende waarden:** het model print het aantal lege waarden, maar haalt ze niet weg
   uit `koers`. Als de allerlaatste koers leeg zou zijn, wordt S0 `nan`. (In mijn testruns was
   het aantal lege waarden 0.) De website geeft in dat geval een algemene foutmelding.
6. **Twee "zwarte lijnen":** in de PNG is de zwarte lijn de mediaan van de eerste
   `getekend = 1000` simulaties; in de CSV staat de mediaan van alle 10.000. Die verschillen
   een klein beetje. De pagina legt dat uit in het bijschrift.
7. **Formule en Monte Carlo schatten hetzelfde:** `S0·exp(nu·t)` is precies de mediaan van GBM,
   en de Monte Carlo-stap gebruikt `mu − ½σ² = nu`. Met oneindig veel simulaties vallen de
   lijnen samen; het verschil in de uitkomst is dus Monte Carlo-ruis.
8. **Dag 0 ontbreekt** in de CSV en de PNG (de reeksen beginnen bij dag 1). De website voegt S0
   als dag 0 toe aan de geanimeerde lijnen.
9. **Typ je `ASML.AS`**, dan probeert het model eerst `ASML.AS.AS` (bestaat niet; levert een
   404 op bij Yahoo) en daarna `ASML.AS`. Dat werkt, maar kost een extra aanvraag.
10. **Uitvoer in de huidige map:** het model schrijft `voorspelling_<ticker>.csv/png` in de map
    waarin het draait en overschrijft eerdere bestanden. De website draait elke aanvraag
    daarom in een eigen tijdelijke map (die daarna wordt opgeruimd).
11. **Geheugen en rekentijd** groeien met het aantal dagen: 10.000 × `dagen` getallen voor `z`,
    `stap` en `paden`. Een run duurde in mijn test ongeveer 2 tot 10 seconden, vooral door het
    ophalen van de koersen.
12. **Reproduceerbaarheid:** de seed (42) ligt vast, maar de koersdata verandert elke
    handelsdag. Dezelfde invoer geeft dus alleen op dezelfde dag (met dezelfde data) precies
    dezelfde uitkomst. Tijdens een handelsdag kan de laatste koers zelfs veranderen.

---

## 6. Wat is getest en wat niet

**Getest:**
- `model_voorspelling.py` is onaangeroerd: SHA-256 vóór en na het werk is
  `63bdaa19febc108db61350ec7bb77bfdf2ac10e0e3e7d5c9cc09407e91ed017c`.
- Het model één keer handmatig gedraaid met echte Yahoo-data (ASML, 12 maanden) en het formaat
  vergeleken met de opdracht (zie opmerking 1).
- `tests/test_contract.py` (10 tests) slaagt met de nagemaakte yfinance.
- API met echte data: ASML, HEIA, AAPL; onbekend aandeel (`XQZZQ` → vriendelijke 404);
  ongeldige maanden en tickers (400); geen JSON (400); cache (tweede aanvraag uit de cache);
  CSV-download byte voor byte gelijk; rate limit (429 met `Retry-After`); maximaal 1 run tegelijk
  (tweede run wacht netjes).
- De sectie "Wat dit model niet kan" en de bronnen zijn op verzoek van de makers van de pagina gehaald;
  de disclaimer "geen beleggingsadvies" staat nog in de footer.
- Pagina in de browser: animatie in fasen, hover-tooltip, 90%-bereik aan/uit, opnieuw afspelen,
  licht en donker thema, mobiel formaat (375 px breed, geen horizontaal scrollen), foutmelding
  bij een onbekend aandeel.

**Niet (volledig) getest:**
- De Docker-build en de site op Render zelf: Docker is op deze computer niet geïnstalleerd
  en de accounts moeten door de makers zelf worden aangemaakt. Wel lokaal getest met dezelfde
  instellingen als in de container (`VERTROUW_PROXY=1`). Geheugen van één modelrun (24 maanden) gemeten: ongeveer 320 MB. Wel gecontroleerd dat alle
  vastgezette pakketten bestaan als kant-en-klare wheels voor Python 3.11 op Linux.
- `prefers-reduced-motion` alleen via de code (CSS-regels en de JavaScript-paden), niet met een
  echte systeeminstelling in een browser.
- Screenreaders (alleen de opbouw: labels, `aria-live`, tekstsamenvatting van de grafiek).
- Andere browsers dan de ingebouwde (Chromium-)browser.
<!-- # EINDE CLAUDE CODE # -->
