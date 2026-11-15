"""Harvest figures (image + alt text + caption) from OpenStax economics textbooks via the REX archive API.

License: OpenStax Principles of Economics/Micro/Macro 3e are CC BY-NC-SA 4.0 (non-commercial). Kept in a separate split.
"""
import json, os, re, time, html, urllib.request, hashlib

UA = {"User-Agent": "EconGraphDataset/0.1 (research dataset; chiara@luey.us)"}
BOOKS = {"4c34671f-b057-4918-8796-38ca1b2f4151": "principles-economics-3e",
         "759181db-a886-4a98-8f5c-770a83a78832": "principles-microeconomics-3e",
         "aff0c733-b223-4dfb-aad6-297bd361bdcf": "principles-macroeconomics-3e"}
OUT = "dataset/openstax"


def get(url, raw=False):
    for i in range(4):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            return b if raw else json.loads(b)
        except Exception as e:
            if i == 3: raise
            time.sleep(2 * (i + 1))


def strip(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


rel = get("https://openstax.org/rex/release.json")
A = "https://openstax.org" + rel["archiveUrl"]
recs, seen = [], {}
for bid, slug in BOOKS.items():
    ver = rel["books"][bid]["defaultVersion"]
    book = get(f"{A}/contents/{bid}@{ver}.json")
    pages = []
    def walk(t, ch=""):
        for x in t.get("contents", []):
            if "contents" in x: walk(x, strip(x["title"]))
            else: pages.append((x["id"].split("@")[0], strip(x["title"]), ch, x.get("slug")))
    walk(book["tree"])
    for pid, ptitle, chapter, pslug in pages:
        h = get(f"{A}/contents/{bid}@{ver}:{pid}.json")["content"]
        for m in re.finditer(r'<figure id="([^"]+)".*?</figure>(.{0,1500})', h, re.S):
            fid, body, after = m.group(1), m.group(0), m.group(2)
            img = re.search(r'<img src="\.\./resources/([0-9a-f]+)"[^>]*?(?:data-media-type="([^"]+)")?[^>]*?alt="([^"]*)"', body, re.S)
            if not img: continue
            sha, mime, alt = img.group(1), img.group(2) or "", html.unescape(img.group(3))
            cap = re.search(r'os-caption-container">(.*?)</div>', after, re.S)
            num = re.search(r'os-number">([^<]+)<', after)
            if sha in seen:
                seen[sha]["also_in"].append(f"{slug}:{fid}"); continue
            path = f"images/{sha}.{'png' if 'png' in mime else 'jpg'}"
            fp = os.path.join(OUT, path)
            if not os.path.exists(fp):
                try: open(fp, "wb").write(get(f"{A}/resources/{sha}", raw=True))
                except Exception as e: print("dl fail", sha, e); continue
            r = {"id": f"openstax_{fid}_{sha[:8]}", "image": path, "book": slug, "chapter": chapter, "page": ptitle,
                 "figure_id": fid, "figure_number": num.group(1).strip() if num else None,
                 "caption": strip(cap.group(1)) if cap else None, "alt_text": alt,
                 "source_page": f"https://openstax.org/books/{slug}/pages/{pslug}" if pslug else None,
                 "original_url": f"{A}/resources/{sha}", "license": "CC BY-NC-SA 4.0",
                 "license_url": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
                 "author": "OpenStax (Rice University)", "verdict": "unreviewed", "also_in": []}
            seen[sha] = r; recs.append(r)
        print(slug, ptitle[:50], len(recs), flush=True)
        time.sleep(0.3)
json.dump(recs, open(os.path.join(OUT, "catalog.json"), "w"), ensure_ascii=False, indent=1)
print("done", len(recs))
