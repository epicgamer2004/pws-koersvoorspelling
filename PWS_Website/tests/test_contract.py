# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Bestand: tests/test_contract.py
# Contracttest: controleert of het stdout-formaat en de CSV-kolommen van het
# (ongewijzigde) model nog passen bij wat de webkoppeling in web/app.py verwacht.
# Het model draait hier met een nagemaakte yfinance (tests/mock_yfinance) via
# PYTHONPATH, dus zonder internet en zonder het modelbestand aan te passen.
#
# Starten vanuit de projectmap:
#   .venv/bin/python -m unittest discover -s tests -v
# EINDE CLAUDE CODE #

# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: hulpfuncties
import csv
import glob
import os
import re
import subprocess
import sys
import tempfile
import unittest

TEST_MAP = os.path.dirname(os.path.abspath(__file__))
PROJECT_MAP = os.path.dirname(TEST_MAP)
MODEL_PAD = os.path.join(PROJECT_MAP, "model_voorspelling.py")
MOCK_MAP = os.path.join(TEST_MAP, "mock_yfinance")

sys.path.insert(0, os.path.join(PROJECT_MAP, "web"))
import app as webapp  # noqa: E402


def draai_model_met_mock(ticker, maanden):
    werkmap = tempfile.mkdtemp(prefix="pws_test_")
    omgeving = dict(os.environ)
    omgeving.update({
        "PYTHONPATH": MOCK_MAP,
        "MPLBACKEND": "Agg",
        "PYTHONUNBUFFERED": "1",
        "PYTHONIOENCODING": "utf-8",
        "MPLCONFIGDIR": werkmap,
    })
    proces = subprocess.run(
        [sys.executable, MODEL_PAD],
        input="{}\n{}\n".format(ticker, maanden),
        capture_output=True,
        text=True,
        timeout=120,
        cwd=werkmap,
        env=omgeving,
    )
    return proces, werkmap
# EINDE CLAUDE CODE #


# BEGIN CLAUDE CODE: koppeling, geen modelcode #
# Onderdeel: de tests
class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.maanden = 3
        cls.proces, cls.werkmap = draai_model_met_mock("asml", cls.maanden)

    def test_model_slaagt(self):
        self.assertEqual(self.proces.returncode, 0, self.proces.stderr[-2000:])

    def test_stdout_regels(self):
        stdout = self.proces.stdout
        self.assertIn("Voer de naam van het aandeel in: ", stdout)
        self.assertRegex(stdout, r"Gebruikte ticker: ASML\.AS\n")
        self.assertRegex(stdout, r"Eerste datum: \d{4}-\d{2}-\d{2}")
        self.assertRegex(stdout, r"Laatste datum: \d{4}-\d{2}-\d{2}")
        self.assertRegex(stdout, r"\nAantal dagen: 2520\n")
        self.assertRegex(stdout, r"\nLege waarden: 0\n")
        self.assertRegex(stdout, r"\nAantal logrendementen: 2519\n")
        for naam in ("nu", "sigma", "mu"):
            gevonden = re.search(r"(?m)^" + naam + r" = (-?\d+(?:\.\d+)?)$", stdout)
            self.assertIsNotNone(gevonden, naam)
            self.assertLessEqual(len(gevonden.group(1).split(".")[-1]), 4, naam + " heeft max. 4 decimalen")
        gevonden = re.search(r"(?m)^S0 = (\d+(?:\.\d+)?)$", stdout)
        self.assertIsNotNone(gevonden)
        self.assertRegex(stdout, r"Voorspelling na 3 maanden: \d+(?:\.\d+)?\n")
        self.assertRegex(stdout, r"Voorspelling na 3 maanden \(Monte Carlo\): \d+(?:\.\d+)?\n")
        self.assertRegex(stdout, r"Dag\s+Voorspelling formule\s+Voorspelling Monte Carlo")

    def test_csv_kolommen_en_rijen(self):
        bestanden = glob.glob(os.path.join(self.werkmap, "voorspelling_*.csv"))
        self.assertEqual([os.path.basename(b) for b in bestanden], ["voorspelling_ASML.AS.csv"])
        with open(bestanden[0], newline="", encoding="utf-8") as bestand:
            rijen = list(csv.reader(bestand))
        self.assertEqual(rijen[0], ["Dag", "Voorspelling formule", "Voorspelling Monte Carlo"])
        self.assertEqual(len(rijen) - 1, self.maanden * 21)
        self.assertEqual([int(r[0]) for r in rijen[1:]], list(range(1, self.maanden * 21 + 1)))
        for rij in rijen[1:]:
            for waarde in rij[1:]:
                self.assertRegex(waarde, r"^\d+(?:\.\d{1,2})?$")

    def test_png_bestaat(self):
        bestanden = glob.glob(os.path.join(self.werkmap, "voorspelling_*.png"))
        self.assertEqual(len(bestanden), 1)
        with open(bestanden[0], "rb") as bestand:
            self.assertEqual(bestand.read(8), b"\x89PNG\r\n\x1a\n")

    def test_webkoppeling_kan_uitvoer_lezen(self):
        with open(glob.glob(os.path.join(self.werkmap, "voorspelling_*.csv"))[0], encoding="utf-8") as bestand:
            data = webapp.parse_uitvoer(self.proces.stdout, bestand.read(), self.maanden)
        self.assertEqual(data["ticker"], "ASML.AS")
        self.assertEqual(data["aantal_dagen_data"], 2520)
        self.assertEqual(data["dagen"], self.maanden * 21)
        self.assertEqual(len(data["formule"]), self.maanden * 21)
        self.assertEqual(len(data["mc_mediaan"]), self.maanden * 21)
        self.assertEqual(data["formule"][-1], data["eind_formule"])
        self.assertEqual(data["mc_mediaan"][-1], data["eind_mc"])
        for veld in ("nu", "sigma", "mu", "S0"):
            self.assertIsInstance(data[veld], float)

    def test_getekend_uit_modelbestand(self):
        self.assertIsInstance(webapp.MODEL_INFO["getekend"], int)


class FoutgedragTest(unittest.TestCase):
    def test_onbekend_aandeel(self):
        proces, _ = draai_model_met_mock("onbekendxyz", 12)
        self.assertEqual(proces.returncode, 1)
        self.assertIn("Geen of te weinig data gevonden voor ONBEKENDXYZ.", proces.stderr)

    def test_te_weinig_data(self):
        proces, _ = draai_model_met_mock("kort", 12)
        self.assertEqual(proces.returncode, 1)
        self.assertIn("Geen of te weinig data gevonden voor KORT.", proces.stderr)

    def test_validatie_van_de_webkoppeling(self):
        self.assertEqual(webapp.valideer_invoer({"ticker": " asml ", "maanden": "12"}), ("ASML", 12))
        self.assertEqual(webapp.valideer_invoer({"ticker": "BRK-B"}), ("BRK-B", 12))
        for fout in (
            {"ticker": "", "maanden": 12},
            {"ticker": "AS ML", "maanden": 12},
            {"ticker": "ASML;rm", "maanden": 12},
            {"ticker": "ASML\n12", "maanden": 12},
            {"ticker": "ASML", "maanden": 0},
            {"ticker": "ASML", "maanden": 25},
            {"ticker": "ASML", "maanden": "twaalf"},
            {"ticker": "ASML", "maanden": 1.5},
            {"ticker": "ASML", "maanden": True},
        ):
            with self.assertRaises(webapp.GebruikersFout, msg=repr(fout)):
                webapp.valideer_invoer(fout)

    def test_afwijkende_stdout_geeft_interne_fout(self):
        with self.assertRaises(webapp.UitvoerFout):
            webapp.parse_stdout("Gebruikte ticker: X\nnu = 0.1\n", 12)


if __name__ == "__main__":
    unittest.main()
# EINDE CLAUDE CODE #
