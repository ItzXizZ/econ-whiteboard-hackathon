import numpy as np
from .scene import Scene, lin, fn

REG = {}


def graph(gtype, topic, title, errors):
    """errors: dict err_name -> one-line description of the mistake."""
    def deco(f):
        REG[gtype] = dict(fn=f, topic=topic, title=title, errors=errors)
        return f
    return deco


class L:
    """Straight line y = i + m*x."""
    def __init__(s, i, m): s.i, s.m = float(i), float(m)
    def y(s, x): return s.i + s.m * np.asarray(x, float)
    def x(s, y): return (np.asarray(y, float) - s.i) / s.m
    def shiftx(s, dx): return L(s.i - s.m * dx, s.m)
    def shifty(s, dy): return L(s.i + dy, s.m)
    def pts(s, x0=0.0, x1=9.8, lo=0.25, hi=9.8):
        xs = np.linspace(x0, x1, 300); ys = s.y(xs)
        m = (ys >= lo) & (ys <= hi)
        return np.column_stack([xs[m], ys[m]])


def inter(a, b):
    x = (b.i - a.i) / (a.m - b.m)
    return float(x), float(a.y(x))


def vline(x, y0=0.0, y1=9.6):
    return lin(x, y0, x, y1)


def hline(y, x0=0.0, x1=9.6):
    return lin(x0, y, x1, y)


def curve_inter(f, g, x0, x1, n=4000):
    xs = np.linspace(x0, x1, n); d = f(xs) - g(xs)
    idx = np.where(np.sign(d[:-1]) != np.sign(d[1:]))[0]
    return [float(xs[i]) for i in idx]


def sd_lines(rng):
    D = L(rng.uniform(8.2, 9.5), -rng.uniform(0.7, 1.05))
    S = L(rng.uniform(0.6, 1.8), rng.uniform(0.55, 0.95))
    return D, S


def pick(rng, xs):
    return xs[int(rng.integers(len(xs)))]


PQ_LABELS = [("Price (P)", "Quantity (Q)"), ("P", "Q"), ("Price", "Quantity"), ("Price ($)", "Quantity")]
MARKETS = ["coffee", "gasoline", "apartments", "smartphones", "wheat", "concert tickets", "bicycles", "lumber"]


def pq(rng):
    return pick(rng, PQ_LABELS)
