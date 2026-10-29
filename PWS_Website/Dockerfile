# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Bestand: Dockerfile
# Bouwt een container met de website en het (ongewijzigde) model.
# Klaar voor een gratis web service bij Render (zie README, hoofdstuk 3), maar werkt
# ook op elke andere plek waar Docker draait:
#   Bouwen:  docker build -t pws-koersvoorspelling .
#   Starten: docker run -p 10000:10000 -e VERTROUW_PROXY=0 pws-koersvoorspelling
# Daarna staat de pagina op http://localhost:10000
FROM python:3.11-slim

# MAX_GELIJKTIJDIG=1: één modelrun gebruikt bij 24 maanden ongeveer 320 MB geheugen;
# een gratis server heeft 512 MB, dus er past er maar één tegelijk.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=10000 \
    VERTROUW_PROXY=1 \
    MAX_GELIJKTIJDIG=1

WORKDIR /app

# Pakketten van het model (yfinance, pandas, numpy, matplotlib) en van de webserver
COPY requirements-web.txt .
RUN pip install -r requirements-web.txt

# Het modelbestand wordt ongewijzigd meegekopieerd; de website alleen als koppeling erbij
COPY model_voorspelling.py .
COPY web ./web

# Niet als root draaien
RUN useradd --create-home --uid 1000 pws && chown -R pws:pws /app
USER pws
ENV HOME=/home/pws

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import urllib.request,os; urllib.request.urlopen('http://127.0.0.1:%s/api/status' % os.environ.get('PORT','10000'), timeout=4)" || exit 1

# VERTROUW_PROXY=1: achter de proxy van de hostingdienst staat het echte IP-adres van de
# bezoeker in X-Forwarded-For, zodat de rate limit per bezoeker telt. Draait de container
# direct aan het internet, start dan met -e VERTROUW_PROXY=0.
CMD ["sh", "-c", "uvicorn app:app --app-dir web --host 0.0.0.0 --port ${PORT} --no-proxy-headers"]
# EINDE CLAUDE CODE #
