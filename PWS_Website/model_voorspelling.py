import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

naam = input("Voer de naam van het aandeel in: ").upper()
maanden = int(input("Voer het aantal maanden in dat u vooruit wilt voorspellen: "))

opties = [naam + ".AS", naam]
koers = []

for ticker in opties:
    data = yf.Ticker(ticker).history(period="10y")
    if "Close" in data and len(data) >= 500:
        koers = data["Close"]
        break

if len(koers) == 0:
    raise SystemExit("Geen of te weinig data gevonden voor " + naam + ".")

print("Gebruikte ticker:", ticker)

print("Eerste datum:", koers.index[0])
print("Laatste datum:", koers.index[-1])
print("Aantal dagen:", len(koers))
print("Lege waarden:", koers.isna().sum())

rendement = np.log(koers / koers.shift(1)).dropna()

gem_dag = rendement.mean()
std_dag = rendement.std()

nu = gem_dag * 252
sigma = std_dag * np.sqrt(252)
mu = nu + 0.5 * sigma**2
S0 = koers.iloc[-1]

print("Aantal logrendementen:", len(rendement))
print("nu =", round(nu, 4))
print("sigma =", round(sigma, 4))
print("mu =", round(mu, 4))
print("S0 =", round(S0, 2))

dagen = maanden * 21
dagnummer = np.arange(1, dagen + 1)

t = np.arange(1, dagen + 1) / 252
pad = S0 * np.exp(nu * t)

print("Voorspelling na", maanden, "maanden:", round(pad[-1], 2))

np.random.seed(42)

aantal = 10000
dt = 1 / 252

z = np.random.normal(0, 1, (aantal, dagen))
stap = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z
paden = S0 * np.exp(np.cumsum(stap, axis=1))

mediaan_mc = np.median(paden, axis=0)

print("Voorspelling na", maanden, "maanden (Monte Carlo):", round(mediaan_mc[-1], 2))

tabel = pd.DataFrame({"Dag": dagnummer, "Voorspelling formule": np.round(pad, 2), "Voorspelling Monte Carlo": np.round(mediaan_mc, 2)})

print(tabel.to_string(index=False))

tabel.to_csv("voorspelling_" + ticker + ".csv", index=False)

getekend = 1000
lijn = np.median(paden[:getekend], axis=0)

plt.figure(figsize=(10, 6))
plt.plot(dagnummer, paden[:getekend].T, color="lightgray", linewidth=0.5)
plt.plot(dagnummer, lijn, color="black", linewidth=2, label="Voorspellijn (mediaan van " + str(getekend) + " simulaties)")
plt.plot([], [], color="lightgray", label=str(getekend) + " van de 10.000 simulaties")
plt.title("Voorspelling: " + ticker)
plt.xlabel("Handelsdag vanaf vandaag")
plt.ylabel("Koers")
plt.legend()
plt.savefig("voorspelling_" + ticker + ".png", dpi=150)
plt.show()