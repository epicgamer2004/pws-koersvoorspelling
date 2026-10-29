# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Bestand: tests/mock_yfinance/yfinance.py
# Nagemaakte (mock) versie van het pakket yfinance, alleen voor de tests.
# Door deze map vooraan op PYTHONPATH te zetten, gebruikt het ongewijzigde model
# deze nepkoersen in plaats van Yahoo. Er wordt niets aan het model veranderd.
# - Tickers die beginnen met "ONBEKEND" geven een lege tabel (zoals een onbekend aandeel).
# - Tickers die beginnen met "KORT" geven te weinig data (100 dagen).
# - Alle andere tickers geven 2520 werkdagen aan nagemaakte, vaste koersen.
# EINDE CLAUDE CODE #

# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: nagemaakte Ticker-klasse
import numpy as np
import pandas as pd


class Ticker:
    def __init__(self, ticker):
        self.ticker = ticker

    def history(self, period="10y", **kwargs):
        naam = self.ticker.upper()
        if naam.startswith("ONBEKEND"):
            return pd.DataFrame()
        aantal = 100 if naam.startswith("KORT") else 2520

        datums = pd.bdate_range(end="2024-06-28", periods=aantal, tz="Europe/Amsterdam")
        generator = np.random.default_rng(7)
        stappen = generator.normal(0.0004, 0.015, aantal)
        koers = 100.0 * np.exp(np.cumsum(stappen))
        return pd.DataFrame(
            {"Open": koers, "High": koers, "Low": koers, "Close": koers, "Volume": 1000},
            index=pd.DatetimeIndex(datums, name="Date"),
        )
# EINDE CLAUDE CODE #
