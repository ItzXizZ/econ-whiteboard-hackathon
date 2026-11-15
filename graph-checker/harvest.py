import json, time, urllib.parse, urllib.request, sys, re
UA = "EconGraphDataset/0.1 (research dataset; chiara@luey.us)"
API = "https://commons.wikimedia.org/w/api.php"
def get(params):
    params = {**params, "format": "json"}
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    for i in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
        except Exception as e:
            time.sleep(2 ** i)
    raise RuntimeError(params)
ROOTS = ["Category:Economic diagrams","Category:Supply and demand curves","Category:Aggregate supply and demand curves",
 "Category:AD–AS model","Category:Cost curves","Category:Cost and revenue curves","Category:Product curves","Category:Indifference curves",
 "Category:Isoquants","Category:Philips curves","Category:IS-LM model diagrams","Category:IS/MP model","Category:Laffer curve",
 "Category:Lorenz curve","Category:Lorenz curves depicting Gini coefficient","Category:Production possibility frontiers",
 "Category:Production-possibility frontiers","Category:Keynesian cross","Category:Paradox of thrift","Category:Price consumption curves",
 "Category:Economic circular flow diagrams","Category:Tax-related supply and demand curves","Category:Elasticity-related supply and demand curves",
 "Category:Surplus-related supply and demand curves","Category:Aggregate supply curves","Category:Consumer theory","Category:Pricing theory"]
MAXDEPTH = 2
seen_cat, files = set(), {}
def walk(cat, depth, root):
    if cat in seen_cat or depth > MAXDEPTH: return
    seen_cat.add(cat); cont = {}
    while True:
        d = get({"action":"query","list":"categorymembers","cmtitle":cat,"cmlimit":500,"cmtype":"file|subcat", **cont})
        for m in d["query"]["categorymembers"]:
            if m["ns"] == 14: walk(m["title"], depth+1, root)
            elif m["ns"] == 6: files.setdefault(m["title"], {"title": m["title"], "categories_seen": []})["categories_seen"].append(cat)
        if "continue" not in d: break
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}
        time.sleep(0.2)
for r in ROOTS:
    walk(r, 0, r); print(r, len(files), file=sys.stderr)
titles = list(files)
for i in range(0, len(titles), 50):
    d = get({"action":"query","titles":"|".join(titles[i:i+50]),"prop":"imageinfo","iiprop":"url|size|mime|extmetadata","iiurlwidth":800})
    for p in d["query"]["pages"].values():
        ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
        v = lambda k: re.sub("<[^>]+>", "", md.get(k, {}).get("value", "")).strip()
        f = files.get(p["title"])
        if not f: continue
        f.update(url=ii.get("url"), thumb=ii.get("thumburl"), page=ii.get("descriptionurl"), mime=ii.get("mime"),
                 width=ii.get("width"), height=ii.get("height"), license=v("LicenseShortName"), license_url=v("LicenseUrl"),
                 artist=v("Artist"), description=v("ImageDescription")[:500], commons_categories=v("Categories"))
    time.sleep(0.2)
json.dump(list(files.values()), open("wikimedia_raw.json","w"), indent=1, ensure_ascii=False)
print("total", len(files))
