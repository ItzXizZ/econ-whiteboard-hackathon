"""Scene model + renderer. A scene is a list of semantic elements in data coords (0-10 box);
the renderer draws it whiteboard-style and returns pixel-space geometry for every element."""
import json, logging, warnings
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, FancyArrowPatch

logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
import os, glob
from matplotlib import font_manager
HAND_FONTS = []
for _f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts", "*.ttf"))):
    font_manager.fontManager.addfont(_f); HAND_FONTS.append(font_manager.FontProperties(fname=_f).get_name())
warnings.filterwarnings("ignore")

W, H, DPI = 800, 600, 100
AX_RECT = [0.10, 0.10, 0.82, 0.82]


def lin(x0, y0, x1, y1, n=40):
    return np.column_stack([np.linspace(x0, x1, n), np.linspace(y0, y1, n)])


def fn(f, x0, x1, n=80):
    x = np.linspace(x0, x1, n)
    return np.column_stack([x, f(x)])


def clip_box(pts, lo=0.0, hi=10.0):
    m = (pts[:, 0] >= lo) & (pts[:, 0] <= hi) & (pts[:, 1] >= lo) & (pts[:, 1] <= hi)
    return pts[m]


class Scene:
    def __init__(self, gtype, title, xlabel, ylabel, caption="", topic="", lim=(0, 10, 0, 10)):
        self.gtype, self.title, self.caption, self.topic = gtype, title, caption, topic
        self.xlabel, self.ylabel, self.lim = xlabel, ylabel, lim
        self.els, self.steps, self.facts = [], [], {}
        self.error = None
        self.generic_ok = True
        self.swap_pair = None

    def _add(self, **kw):
        kw.setdefault("label", None)
        kw.setdefault("style", {})
        self.els.append(kw)
        return kw

    def get(self, id):
        return next(e for e in self.els if e["id"] == id)

    def has(self, id):
        return any(e["id"] == id for e in self.els)

    def remove(self, *ids):
        self.els = [e for e in self.els if e["id"] not in ids]

    def curve(self, id, role, label, pts, lpos=1.0, dashed=False, color=0, above=False):
        return self._add(id=id, kind="curve", role=role, label=label, pts=np.asarray(pts, float),
                         lpos=lpos, style={"dashed": dashed, "color": color, "above": above})

    def point(self, id, role, xy, label=None, xtick=None, ytick=None, guides=True, color=0):
        e = self._add(id=id, kind="point", role=role, label=label, xy=np.asarray(xy, float), style={"color": color})
        x, y = xy
        if guides and ytick is not None:
            self._add(id=f"{id}_hguide", kind="guide", role="guide", pts=lin(self.lim[0], y, x, y, 2), of=id)
        if guides and xtick is not None:
            self._add(id=f"{id}_vguide", kind="guide", role="guide", pts=lin(x, self.lim[2], x, y, 2), of=id)
        if ytick is not None:
            self._add(id=f"{id}_ytick", kind="tick", role="axis_value", label=ytick, xy=np.array([self.lim[0], y]), axis="y", of=id)
        if xtick is not None:
            self._add(id=f"{id}_xtick", kind="tick", role="axis_value", label=xtick, xy=np.array([x, self.lim[2]]), axis="x", of=id)
        return e

    def move_point(self, id, xy):
        p = self.get(id); p["xy"] = np.asarray(xy, float); x, y = xy
        for e in self.els:
            if e.get("of") != id: continue
            if e["id"].endswith("_hguide"): e["pts"] = lin(self.lim[0], y, x, y, 2)
            if e["id"].endswith("_vguide"): e["pts"] = lin(x, self.lim[2], x, y, 2)
            if e["id"].endswith("_ytick"): e["xy"] = np.array([self.lim[0], y])
            if e["id"].endswith("_xtick"): e["xy"] = np.array([x, self.lim[2]])

    def region(self, id, role, label, poly, color=1):
        return self._add(id=id, kind="region", role=role, label=label, poly=np.asarray(poly, float), style={"color": color})

    def arrow(self, id, role, a, b, label=None):
        return self._add(id=id, kind="arrow", role=role, label=label, a=np.asarray(a, float), b=np.asarray(b, float))

    def text(self, id, role, xy, label):
        return self._add(id=id, kind="text", role=role, label=label, xy=np.asarray(xy, float))

    def step(self, text, *ids):
        self.steps.append({"text": text, "highlight": list(ids)})

    def set_error(self, etype, highlight, explanation, fix, severity="major"):
        self.error = {"type": etype, "severity": severity, "highlight": list(highlight),
                      "explanation": explanation, "fix": fix}


PALETTES = {
    "marker": ["#1f3fbf", "#c62828", "#2e7d32", "#6a1b9a", "#ef6c00", "#111111"],
    "mono": ["#111111"] * 6,
    "textbook": ["#0b5394", "#cc0000", "#38761d", "#674ea7", "#e69138", "#222222"],
}
HAND_PALETTES = {
    "whiteboard": ["#1a237e", "#b71c1c", "#1b5e20", "#4a148c", "#e65100", "#212121"],
    "pencil": ["#3a3a3a", "#4a4a4a", "#2f2f2f", "#555555", "#404040", "#222222"],
    "ink": ["#0d2b8a", "#0d2b8a", "#a01818", "#0d2b8a", "#0d2b8a", "#111133"],
    "black_marker": ["#151515"] * 6,
}
HAND_BG = {"whiteboard": "#f4f6f6", "paper": "#fdfcf7", "ruled": "#fbfaf3", "grid": "#fbfbf8", "sticky": "#fdf3a7", "notebook": "#f6f1e3"}


def render(scene, path, rng):
    hand = bool(HAND_FONTS) and rng.random() < 0.5
    if hand: return _render_hand(scene, path, rng)
    style = {
        "hand": False,
        "sketch": bool(rng.random() < 0.45),
        "palette": str(rng.choice(list(PALETTES))),
        "lw": float(rng.uniform(1.6, 3.4)),
        "fs": int(rng.integers(12, 17)),
        "bg": str(rng.choice(["#ffffff", "#fbfbf7", "#f4f6f4"])),
        "show_title": bool(rng.random() < 0.6),
    }
    return _draw(scene, path, style, PALETTES[style["palette"]], "DejaVu Sans",
                 plt.xkcd(scale=0.8, length=120, randomness=2) if style["sketch"] else plt.rc_context({}))


def _render_hand(scene, path, rng):
    surf = str(rng.choice(list(HAND_BG)))
    pal_name = "whiteboard" if surf == "whiteboard" and rng.random() < 0.7 else str(rng.choice(list(HAND_PALETTES)))
    style = {"hand": True, "sketch": True, "surface": surf, "palette": pal_name, "font": str(rng.choice(HAND_FONTS)),
             "lw": float(rng.uniform(1.8, 4.2) if surf == "whiteboard" else rng.uniform(1.0, 2.6)),
             "fs": int(rng.integers(14, 21)), "bg": HAND_BG[surf], "show_title": bool(rng.random() < 0.3),
             "wobble": float(rng.uniform(0.8, 2.2)), "axis_arrows": bool(rng.random() < 0.6)}
    return _draw(scene, path, style, HAND_PALETTES[pal_name], style["font"],
                 plt.xkcd(scale=style["wobble"], length=float(rng.uniform(60, 160)), randomness=float(rng.uniform(1.5, 4))))


def _draw(scene, path, style, pal, font, ctx):
    with ctx:
        plt.rcParams["font.family"] = font
        plt.rcParams["path.effects"] = []
        fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor=style["bg"])
        ax = fig.add_axes(AX_RECT)
        ax.set_facecolor(style["bg"])
        if style.get("surface") in ("ruled", "grid", "notebook"):
            for yy in np.arange(0.02, 1, 0.045): fig.add_artist(plt.Line2D([0, 1], [yy, yy], color="#9fb8d8", lw=0.6, alpha=0.7, zorder=-10))
            if style["surface"] == "grid":
                for xx in np.arange(0.02, 1, 0.045 * H / W): fig.add_artist(plt.Line2D([xx, xx], [0, 1], color="#9fb8d8", lw=0.6, alpha=0.7, zorder=-10))
            if style["surface"] == "notebook": fig.add_artist(plt.Line2D([0.06, 0.06], [0, 1], color="#e57373", lw=1.0, zorder=-10))
        ax.patch.set_alpha(0 if style.get("surface") in ("ruled", "grid", "notebook") else 1)
        x0, x1, y0, y1 = scene.lim
        pad = 0.04 * (x1 - x0)
        ax.set_xlim(x0 - pad, x1 + pad * 3); ax.set_ylim(y0 - pad, y1 + pad * 3)
        for s in ax.spines.values(): s.set_visible(False)
        ax.set_frame_on(False)
        ax.set_xticks([]); ax.set_yticks([])
        k = dict(color="#111111", lw=style["lw"] * 0.8)
        ast = "->" if style.get("axis_arrows", True) else "-"
        ax.annotate("", xy=(x1 + pad * 2, y0), xytext=(x0, y0), arrowprops=dict(arrowstyle=ast, **k))
        ax.annotate("", xy=(x0, y1 + pad * 2), xytext=(x0, y0), arrowprops=dict(arrowstyle=ast, **k))
        artists = {}
        fs = style["fs"]
        artists["y_axis"] = ax.text(x0 - pad * 0.5, y1 + pad * 2.3, scene.ylabel or "", ha="left", va="bottom", fontsize=fs)
        artists["x_axis"] = ax.text(x1 + pad * 2.5, y0 + pad * 0.4, scene.xlabel or "", ha="right", va="bottom", fontsize=fs)
        ax.text(x0 - pad * 0.6, y0 - pad * 0.6, "0", ha="right", va="top", fontsize=fs - 2)
        if style["show_title"]:
            fig.suptitle(scene.title, fontsize=fs + 1, y=0.985)
        if scene.caption:
            fig.text(0.5, 0.012, scene.caption, ha="center", va="bottom", fontsize=fs - 3, style="italic")
        label_art = {}
        for e in scene.els:
            c = pal[e["style"].get("color", 0) % len(pal)]
            if e["kind"] == "curve":
                p = e["pts"]
                ax.plot(p[:, 0], p[:, 1], color=c, lw=style["lw"], ls="--" if e["style"].get("dashed") else "-", solid_capstyle="round")
                if e["label"]:
                    i = int(round(e["lpos"] * (len(p) - 1)))
                    right = p[i, 0] > 8.4 or e["style"].get("above")
                    dy = 0.35 if e["style"].get("above") else 0.12
                    label_art[e["id"]] = ax.text(p[i, 0] + (-0.15 if right else 0.12), p[i, 1] + dy, e["label"], color=c, fontsize=fs, ha="right" if right else "left", va="bottom")
            elif e["kind"] == "guide":
                p = e["pts"]; ax.plot(p[:, 0], p[:, 1], color="#555555", lw=style["lw"] * 0.5, ls=(0, (4, 3)))
            elif e["kind"] == "point":
                ax.plot(*e["xy"], "o", color=pal[-1], ms=4 + style["lw"])
                if e["label"]:
                    right = e["xy"][0] > 7.8
                    label_art[e["id"]] = ax.text(e["xy"][0] + (-0.15 if right else 0.15), e["xy"][1] + 0.15, e["label"], fontsize=fs, ha="right" if right else "left", va="bottom")
            elif e["kind"] == "tick":
                if e["axis"] == "y":
                    label_art[e["id"]] = ax.text(e["xy"][0] - pad * 0.4, e["xy"][1], e["label"], fontsize=fs - 1, ha="right", va="center")
                else:
                    label_art[e["id"]] = ax.text(e["xy"][0], e["xy"][1] - pad * 0.4, e["label"], fontsize=fs - 1, ha="center", va="top")
            elif e["kind"] == "region":
                ax.add_patch(Polygon(e["poly"], closed=True, fc=c, alpha=0.22, ec=c, lw=0.8, hatch="//" if style["palette"] == "mono" else None))
                if e["label"]:
                    cx, cy = e["poly"].mean(axis=0)
                    label_art[e["id"]] = ax.text(cx, cy, e["label"], fontsize=fs - 1, ha="center", va="center", weight="bold")
            elif e["kind"] == "arrow":
                ax.add_patch(FancyArrowPatch(e["a"], e["b"], arrowstyle="-|>", mutation_scale=12 + style["lw"] * 3, color="#333333", lw=style["lw"] * 0.7))
                if e["label"]:
                    m = (e["a"] + e["b"]) / 2
                    label_art[e["id"]] = ax.text(m[0], m[1] + 0.3, e["label"], fontsize=fs - 2, ha="center")
            elif e["kind"] == "text":
                label_art[e["id"]] = ax.text(*e["xy"], e["label"], fontsize=fs - 1, ha="center", va="center")
        fig.canvas.draw()
        r = fig.canvas.get_renderer()
        inv = ax.transData.inverted(); FW, FH = fig.bbox.width, fig.bbox.height

        def nudge(a, dx, dy):
            q = ax.transData.transform(a.get_position()) + (dx, dy)
            a.set_position(tuple(inv.transform(q)))

        placed = [artists[k].get_window_extent(r) for k in ("x_axis", "y_axis") if artists[k].get_text()]
        for e in scene.els:
            a = label_art.get(e["id"])
            if a is None or e["kind"] not in ("curve", "point"): continue
            for _ in range(8):
                b = a.get_window_extent(r)
                if b.x1 > FW - 6: nudge(a, FW - 6 - b.x1, 0); continue
                if b.y1 > FH - 6: nudge(a, 0, FH - 6 - b.y1); continue
                hit = [o for o in placed if b.overlaps(o)]
                if not hit: break
                nudge(a, 0, b.height + 3)
            placed.append(a.get_window_extent(r))

        def topx(pts):
            d = ax.transData.transform(np.atleast_2d(pts))
            return np.column_stack([d[:, 0], H - d[:, 1]])

        def bb(a):
            b = a.get_window_extent(r)
            return [round(b.x0, 1), round(H - b.y1, 1), round(b.x1, 1), round(H - b.y0, 1)]

        def bbox_of(px, m=4):
            return [round(px[:, 0].min() - m, 1), round(px[:, 1].min() - m, 1), round(px[:, 0].max() + m, 1), round(px[:, 1].max() + m, 1)]

        ann = []
        for name in ("x_axis", "y_axis"):
            if (scene.xlabel if name == "x_axis" else scene.ylabel):
                ann.append({"id": name, "kind": "axis", "role": name, "label": scene.xlabel if name == "x_axis" else scene.ylabel, "label_bbox": bb(artists[name])})
        for e in scene.els:
            a = {"id": e["id"], "kind": e["kind"], "role": e["role"], "label": e["label"]}
            if e["kind"] in ("curve", "guide"):
                px = topx(e["pts"]); step = max(1, len(px) // 24)
                a["polyline"] = np.round(px[::step], 1).tolist() + ([np.round(px[-1], 1).tolist()] if (len(px) - 1) % step else [])
                a["bbox"] = bbox_of(px)
                a["data_polyline"] = np.round(e["pts"][::step], 3).tolist()
            elif e["kind"] in ("point", "tick", "text"):
                px = topx(e["xy"])[0]; a["center"] = np.round(px, 1).tolist(); a["data_xy"] = np.round(e["xy"], 3).tolist()
                a["bbox"] = [round(px[0] - 8, 1), round(px[1] - 8, 1), round(px[0] + 8, 1), round(px[1] + 8, 1)]
            elif e["kind"] == "region":
                px = topx(e["poly"]); a["polygon"] = np.round(px, 1).tolist(); a["bbox"] = bbox_of(px, 0)
            elif e["kind"] == "arrow":
                px = topx(np.vstack([e["a"], e["b"]])); a["from"] = np.round(px[0], 1).tolist(); a["to"] = np.round(px[1], 1).tolist(); a["bbox"] = bbox_of(px)
            if e["id"] in label_art:
                a["label_bbox"] = bb(label_art[e["id"]])
                if e["kind"] in ("tick", "text"): a["bbox"] = a["label_bbox"]
            ann.append(a)
        fig.savefig(path, dpi=DPI, facecolor=style["bg"])
        plt.close(fig)
    return ann, style
