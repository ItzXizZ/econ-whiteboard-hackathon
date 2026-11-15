"""Filter the raw Commons harvest to economics graphs, map each file to a graph_type, download 800px thumbnails."""
import json, re, os, time, urllib.request, concurrent.futures as cf
CAT_MAP = {
 "Supply and demand curves": "supply_demand", "Elasticity-related supply and demand curves": "elasticity", "Surplus-related supply and demand curves": "consumer_producer_surplus",
 "Tax-related supply and demand curves": "per_unit_tax", "Carbon tax": "per_unit_tax", "Pigovian tax": "negative_externality", "Price controls": "price_control",
 "Cost and revenue curves": "cost_revenue", "Product curves": "short_run_production", "Cost curves": "cost_curves", "Indifference curves": "consumer_optimum",
 "Budget constraints": "budget_line", "Price consumption curves": "price_consumption_curve", "Income consumption curves": "income_consumption_curve", "Engel curve": "engel_curve",
 "Isoquants": "isoquant_isocost", "Isocosts": "isoquant_isocost", "Cobb–Douglas production functions": "production_function", "Edgeworth box diagrams": "edgeworth_box",
 "SVG production possibility frontiers": "ppf", "Production possibility frontiers": "ppf", "Production-possibility frontiers": "ppf",
 "Lorenz curve": "lorenz_curve", "Lorenz curves depicting Gini coefficient": "lorenz_curve", "Laffer curve": "laffer_curve",
 "Monopolistic market diagrams": "monopoly", "Monopolistically competitive market diagrams": "monopolistic_competition", "Oligopolistic market diagrams": "oligopoly",
 "Monopsonistic market diagrams": "monopsony", "Price discrimination": "price_discrimination", "Labor market diagrams": "labor_market", "Market diagrams": "market_structure",
 "Aggregate supply and demand curves": "ad_as", "Aggregate supply curves": "ad_as", "AD–AS model": "ad_as", "Agregate Demand and Inflation Adjustement model": "ad_ia",
 "Philips curves": "phillips_curve", "IS-LM model diagrams": "is_lm", "IS/MP model": "is_mp", "Keynesian cross": "keynesian_cross", "Paradox of thrift": "keynesian_cross",
 "Solow model": "solow_growth", "Exogenous growth model": "solow_growth", "Money demand": "money_market", "J curves": "j_curve", "Beveridge curve": "beveridge_curve",
 "Inverted yield curve": "yield_curve", "Payoff diagrams": "payoff_diagram", "Economic circular flow diagrams": "circular_flow", "Concentration curve": "lorenz_curve",
 "Utility functions": "utility_function", "Marginal utility": "marginal_utility", "Armey–Rahn curve": "laffer_curve", "Macroeconomic diagrams": "macro_other",
 "Economic curves": "other_curve", "Consumer theory": "consumer_theory", "Pricing theory": "pricing", "Demand": "supply_demand",
}
TITLE_MAP = [(r"laffer", "laffer_curve"), (r"lorenz|gini", "lorenz_curve"), (r"phil+ips", "phillips_curve"), (r"is[-_ ]?lm", "is_lm"), (r"ad[-_ ]?as|aggregate", "ad_as"),
 (r"keynes|cross|45", "keynesian_cross"), (r"solow", "solow_growth"), (r"indiff|utility", "consumer_optimum"), (r"isoquant|isocost", "isoquant_isocost"),
 (r"ppf|production[-_ ]possib|transformation curve", "ppf"), (r"monopsony", "monopsony"), (r"monopol", "monopoly"), (r"oligopol|kinked", "oligopoly"),
 (r"tariff|quota|import|export", "trade"), (r"externalit|pigou", "externality"), (r"deadweight|tax", "per_unit_tax"), (r"surplus", "consumer_producer_surplus"),
 (r"elastic", "elasticity"), (r"price ceiling|price floor|rent control|minimum wage|price control", "price_control"), (r"cost|revenue|marginal", "cost_revenue"),
 (r"supply|demand|nachfrage|angebot|aanbod|vraag|offre|demande|oferta|demanda", "supply_demand"), (r"money|interest|loanable", "money_market"), (r"labou?r|wage|arbeit", "labor_market"),
 (r"edgeworth|contract curve", "edgeworth_box"), (r"budget", "budget_line"), (r"circular flow|kreislauf", "circular_flow"), (r"beveridge", "beveridge_curve"), (r"payoff", "payoff_diagram")]
SKIP_CATS = {"Economic diagrams", "Pricing theory", "Consumer theory"}  # mixed buckets: require a title keyword
def classify(f):
    cats = [c.replace("Category:", "") for c in f["categories_seen"]]
    t = f["title"].lower()
    for c in cats:
        if c in CAT_MAP and c not in SKIP_CATS: return CAT_MAP[c], "commons_category"
    for rx, g in TITLE_MAP:
        if re.search(rx, t): return g, "title_keyword"
    return None, None
raw = json.load(open("wikimedia_raw.json"))
keep = []
for f in raw:
    if not f.get("thumb") or f.get("mime") not in ("image/png", "image/svg+xml", "image/jpeg", "image/gif"): continue
    if "Earle, Does Price Fixing" in " ".join(f["categories_seen"]) or "Office of Price Administration" in " ".join(f["categories_seen"]): continue
    g, how = classify(f)
    if not g: continue
    lic = f.get("license") or ""
    if not re.search(r"CC|Public domain|No restrictions|GFDL|PD", lic, re.I): continue
    keep.append(dict(f, graph_family=g, family_source=how))
seen = set(); keep = [f for f in keep if not (f["title"] in seen or seen.add(f["title"]))]
os.makedirs("dataset/real/images", exist_ok=True)
def base_path(f):
    fn = re.sub(r"[^A-Za-z0-9._-]+", "_", f["title"][5:])[:120]
    ext = ".png" if f["mime"] in ("image/svg+xml", "image/png", "image/gif") else ".jpg"
    return f"dataset/real/images/{os.path.splitext(fn)[0]}", ext
import collections as _c
_n = _c.Counter("".join(base_path(f)) for f in keep)
for f in keep:
    b, ext = base_path(f)
    if _n[b + ext] > 1:
        if os.path.exists(b + ext): os.remove(b + ext)
        b += "__" + re.sub(r"[^a-z0-9]", "", os.path.splitext(f["title"])[1].lower())
        if _n[b + ext] > 1 or b + ext in _c.Counter(): pass
    f["_path"] = b + ext
_m = _c.Counter(f["_path"] for f in keep)
for i, f in enumerate(keep):
    if _m[f["_path"]] > 1:
        b, ext = os.path.splitext(f["_path"]); f["_path"] = f"{b}__{i}{ext}"
UA = {"User-Agent": "EconGraphDataset/0.1 (research dataset; chiara@luey.us)"}
def dl(f):
    path = f["_path"]
    if not os.path.exists(path):
        for i in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(f["thumb"], headers=UA), timeout=40) as r: open(path, "wb").write(r.read()); break
            except Exception as e:
                time.sleep(2 + 3 * i)
        else: return None
        time.sleep(0.3)
    return path
with cf.ThreadPoolExecutor(3) as ex:
    paths = list(ex.map(dl, keep))
out = []
for f, p in zip(keep, paths):
    if not p: continue
    out.append({"id": "wm_" + os.path.basename(p).rsplit(".", 1)[0], "image": p.replace("dataset/real/", ""), "graph_family": f["graph_family"], "family_source": f["family_source"],
                "title": f["title"], "description": f.get("description"), "source_page": f["page"], "original_url": f["url"], "license": f["license"], "license_url": f.get("license_url"),
                "author": f.get("artist"), "commons_categories": f["categories_seen"], "verdict": "unreviewed", "review": None})
json.dump(out, open("dataset/real/catalog.json", "w"), indent=1, ensure_ascii=False)
import collections; print(len(raw), "raw ->", len(keep), "kept ->", len(out), "downloaded"); print(collections.Counter(o["graph_family"] for o in out).most_common())
