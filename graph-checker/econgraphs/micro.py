import numpy as np
from .common import graph, L, inter, vline, hline, curve_inter, sd_lines, pick, pq, MARKETS
from .scene import Scene, lin, fn

# ---------------------------------------------------------------- supply & demand

@graph("supply_demand_equilibrium", "micro/markets", "Market equilibrium", {
    "demand_slopes_up": "Demand curve drawn upward-sloping",
    "equilibrium_off_intersection": "Equilibrium point not at the D/S intersection",
    "curve_labels_swapped": "Supply and demand labels swapped"})
def sd_eq(rng, err=None):
    D, S = sd_lines(rng); yl, xl = pq(rng); m = pick(rng, MARKETS)
    s = Scene("supply_demand_equilibrium", f"Market for {m}", xl, yl)
    q, p = inter(D, S)
    s.curve("D", "demand", "D", D.pts()); s.curve("S", "supply", "S", S.pts(), color=1)
    s.point("E", "equilibrium", (q, p), "E", "Q*", "P*")
    s.facts = {"Q*": q, "P*": p}
    s.step("Demand slopes down: higher price, lower quantity demanded (law of demand).", "D")
    s.step("Supply slopes up: higher price, higher quantity supplied.", "S")
    s.step("Equilibrium E is where D and S cross; read P* and Q* off the axes.", "E", "E_ytick", "E_xtick")
    if err == "demand_slopes_up":
        bad = L(p - 1.9 * q, 1.9); s.get("D")["pts"] = bad.pts()
        s.set_error(err, ["D"], "The demand curve slopes upward. By the law of demand, quantity demanded falls as price rises, so demand must slope downward.",
                    "Redraw D from the upper left to the lower right through E.")
    elif err == "equilibrium_off_intersection":
        q2 = q - rng.uniform(1.2, 2.0); s.move_point("E", (q2, float(D.y(q2))))
        s.set_error(err, ["E", "E_ytick", "E_xtick", "D", "S"], "E is placed on the demand curve but not where demand and supply cross. At that price quantity demanded exceeds quantity supplied, so it is not an equilibrium.",
                    "Move E to the intersection of D and S and re-read P* and Q*.")
    elif err == "curve_labels_swapped":
        s.get("D")["label"], s.get("S")["label"] = "S", "D"
        s.set_error(err, ["D", "S"], "The downward-sloping curve is labeled S and the upward-sloping curve D. Demand slopes down and supply slopes up.",
                    "Swap the labels: the downward-sloping curve is D, the upward-sloping curve is S.")
    return s


DEM_UP = ["Consumer incomes rise ({m} is a normal good)", "Price of a substitute for {m} rises", "More buyers enter the {m} market", "Buyers expect {m} prices to rise next month"]
DEM_DN = ["Price of a complement to {m} rises", "Consumer incomes fall ({m} is a normal good)", "Tastes shift away from {m}"]
SUP_UP = ["New technology lowers the cost of producing {m}", "Input prices for {m} fall", "More firms enter the {m} market"]
SUP_DN = ["Input prices for {m} rise", "A storm destroys {m} production capacity", "A per-unit tax is placed on {m} producers"]


def _shift(rng, err, which):
    D, S = sd_lines(rng); yl, xl = pq(rng); m = pick(rng, MARKETS)
    up = bool(rng.random() < 0.5)
    pool = (DEM_UP if up else DEM_DN) if which == "D" else (SUP_UP if up else SUP_DN)
    cap = pick(rng, pool).format(m=m)
    dx = rng.uniform(1.5, 2.2) * (1 if up else -1)
    name = "demand" if which == "D" else "supply"
    s = Scene(f"{name}_shift", f"{'Increase' if up else 'Decrease'} in {name}: {m}", xl, yl, caption=cap)
    moved = which if err != "wrong_curve_shifted" else ("S" if which == "D" else "D")
    mdx = -dx if err == "shift_wrong_direction" else dx
    s.curve("D1" if moved == "D" else "D", "demand", "D₁" if moved == "D" else "D", D.pts())
    s.curve("S1" if moved == "S" else "S", "supply", "S₁" if moved == "S" else "S", S.pts(), color=1)
    q1, p1 = inter(D, S)
    s.point("E1", "equilibrium", (q1, p1), "E₁", "Q₁", "P₁")
    base = D if moved == "D" else S
    new = base.shiftx(mdx)
    s.curve(f"{moved}2", "demand" if moved == "D" else "supply", f"{moved}₂", new.pts(), color=2)
    q2, p2 = inter(new, S) if moved == "D" else inter(D, new)
    ya = min(p1 + 1.8, 8.8) if moved == "D" else max(p1 - 1.8, 1.0)
    xa, xb = float(base.x(ya)), float(new.x(ya)); sg = np.sign(xb - xa)
    s.arrow("shift_arrow", "shift", (xa + 0.15 * sg, ya), (xb - 0.15 * sg, ya))
    if err == "new_equilibrium_misplaced":
        q2, p2 = float(new.x(p1)), p1
    s.point("E2", "equilibrium", (q2, p2), "E₂", "Q₂", "P₂")
    sgn = "right" if up else "left"
    if which == "D":
        pd, qd = ("rises", "rises") if up else ("falls", "falls")
    else:
        pd, qd = ("falls", "rises") if up else ("rises", "falls")
    s.facts = {"scenario": cap, "shift": f"{name} shifts {sgn}", "price": pd, "quantity": qd}
    s.step("Start at E₁ where the original curves cross.", "E1")
    s.step(f"'{cap}' changes {name} itself, so the whole {name} curve shifts {sgn}.", f"{which}2", "shift_arrow")
    s.step(f"New equilibrium E₂: price {pd} (P₁→P₂) and quantity {qd} (Q₁→Q₂).", "E2", "E2_ytick", "E2_xtick")
    if err == "shift_wrong_direction":
        s.set_error(err, [f"{which}2", "shift_arrow"], f"'{cap}' should shift {name} to the {sgn}, but the new curve is drawn to the {'left' if up else 'right'}.",
                    f"Redraw {which}₂ to the {sgn} of {which}₁; equilibrium price {pd} and quantity {qd}.")
    elif err == "wrong_curve_shifted":
        other = "supply" if which == "D" else "demand"
        s.set_error(err, [f"{moved}2", "shift_arrow"], f"'{cap}' is a {name}-side change, but the graph shifts the {other} curve instead.",
                    f"Keep {other} fixed and shift the {name} curve {sgn}.")
    elif err == "new_equilibrium_misplaced":
        s.set_error(err, ["E2", "E2_ytick", "E2_xtick"], "E₂ is drawn at the old price on the new curve, not where the new curve meets the unchanged curve. The market would not clear there.",
                    "Place E₂ at the intersection of the shifted curve and the curve that did not move.")
    return s


@graph("demand_shift", "micro/markets", "Shift in demand", {
    "shift_wrong_direction": "Demand shifted the wrong way for the scenario",
    "wrong_curve_shifted": "Supply shifted for a demand-side event",
    "new_equilibrium_misplaced": "New equilibrium not at new intersection"})
def demand_shift(rng, err=None):
    return _shift(rng, err, "D")


@graph("supply_shift", "micro/markets", "Shift in supply", {
    "shift_wrong_direction": "Supply shifted the wrong way for the scenario",
    "wrong_curve_shifted": "Demand shifted for a supply-side event",
    "new_equilibrium_misplaced": "New equilibrium not at new intersection"})
def supply_shift(rng, err=None):
    return _shift(rng, err, "S")


@graph("consumer_producer_surplus", "micro/welfare", "Consumer and producer surplus", {
    "cs_ps_swapped": "Consumer and producer surplus regions swapped",
    "cs_shaded_as_rectangle": "Consumer surplus shaded as the expenditure rectangle"})
def surplus(rng, err=None):
    D, S = sd_lines(rng); yl, xl = pq(rng)
    s = Scene("consumer_producer_surplus", "Consumer and producer surplus", xl, yl)
    q, p = inter(D, S)
    s.curve("D", "demand", "D", D.pts()); s.curve("S", "supply", "S", S.pts(), color=1)
    s.region("CS", "consumer_surplus", "CS", [(0, D.i), (0, p), (q, p)], color=0)
    s.region("PS", "producer_surplus", "PS", [(0, p), (0, S.i), (q, p)], color=1)
    s.point("E", "equilibrium", (q, p), "E", "Q*", "P*")
    s.step("Find equilibrium E, price P* and quantity Q*.", "E")
    s.step("Consumer surplus: area below demand and above P*, from 0 to Q*.", "CS", "D")
    s.step("Producer surplus: area above supply and below P*, from 0 to Q*.", "PS", "S")
    if err == "cs_ps_swapped":
        s.get("CS")["label"], s.get("PS")["label"] = "PS", "CS"
        s.set_error(err, ["CS", "PS"], "The labels are reversed. Consumer surplus is the triangle under demand and above price; producer surplus is above supply and below price.",
                    "Label the upper triangle CS and the lower triangle PS.")
    elif err == "cs_shaded_as_rectangle":
        s.remove("PS"); s.get("CS")["poly"] = np.array([(0, 0), (0, p), (q, p), (q, 0)])
        s.set_error(err, ["CS"], "The shaded rectangle P*×Q* is total consumer spending, not consumer surplus.",
                    "Shade the triangle between the demand curve and the price line P*, from 0 to Q*.")
    return s


def _control(rng, err, kind):
    D, S = sd_lines(rng); yl, xl = pq(rng)
    q, p = inter(D, S)
    ceiling = kind == "price_ceiling"
    gap = rng.uniform(1.2, 2.0)
    pc = p - gap if ceiling else p + gap
    wrong_side = err in ("ceiling_above_equilibrium", "floor_below_equilibrium")
    if wrong_side: pc = p + gap if ceiling else p - gap
    m = pick(rng, ["apartments", "milk", "gasoline", "wheat", "bread"]) if ceiling else pick(rng, ["wheat", "milk", "corn", "sugar"])
    title = f"Price {'ceiling' if ceiling else 'floor'} on {m}"
    s = Scene(kind, title, xl, yl)
    s.curve("D", "demand", "D", D.pts()); s.curve("S", "supply", "S", S.pts(), color=1)
    s.curve("control", "price_control", "Price ceiling" if ceiling else "Price floor", hline(pc, 0, 9.4), lpos=0.62, color=3)
    s.point("E", "equilibrium", (q, p), "E", "Q*", "P*")
    qs, qd = float(S.x(pc)), float(D.x(pc))
    s.point("A", "quantity_supplied", (qs, pc), None, "Qs", None)
    s.point("B", "quantity_demanded", (qd, pc), None, "Qd", None)
    lo, hi = sorted([qs, qd])
    word = "Shortage" if ceiling else "Surplus"
    if err in ("labeled_surplus", "labeled_shortage"): word = "Surplus" if ceiling else "Shortage"
    s.arrow("gap", "shortage" if ceiling else "surplus", (lo, pc - 0.45), (hi, pc - 0.45), word)
    s.facts = {"binding": True, "Qs": qs, "Qd": qd}
    s.step("Equilibrium without the control is E (P*, Q*).", "E")
    s.step(f"A binding {'ceiling sits below' if ceiling else 'floor sits above'} P*.", "control")
    s.step(f"At the controlled price, quantity supplied is Qs and quantity demanded is Qd.", "A_xtick", "B_xtick")
    s.step(f"The gap Qd−Qs is a {'shortage' if ceiling else 'surplus'}." if ceiling else "The gap Qs−Qd is a surplus.", "gap")
    if wrong_side:
        s.set_error(err, ["control", "gap"], f"The {'ceiling is above' if ceiling else 'floor is below'} the equilibrium price, so it is non-binding: the market still clears at P*, with no {'shortage' if ceiling else 'surplus'}.",
                    f"A binding {'ceiling' if ceiling else 'floor'} must be drawn {'below' if ceiling else 'above'} P*; otherwise remove the gap label.")
    elif err in ("labeled_surplus", "labeled_shortage"):
        right = "shortage" if ceiling else "surplus"
        s.set_error(err, ["gap"], f"At a binding price {'ceiling' if ceiling else 'floor'} quantity {'demanded exceeds quantity supplied' if ceiling else 'supplied exceeds quantity demanded'}, so the gap is a {right}, not a {word.lower()}.",
                    f"Relabel the gap as a {right}.")
    elif err == "qs_qd_swapped":
        s.get("A_xtick")["label"], s.get("B_xtick")["label"] = "Qd", "Qs"
        s.set_error(err, ["A_xtick", "B_xtick", "S", "D"], "Qs and Qd are swapped: quantity supplied is read off the supply curve and quantity demanded off the demand curve.",
                    "Label the quantity where the control line meets S as Qs and where it meets D as Qd.")
    return s


@graph("price_ceiling", "micro/government", "Price ceiling", {
    "ceiling_above_equilibrium": "Ceiling drawn above P* but shown as binding",
    "labeled_surplus": "Shortage mislabeled as surplus",
    "qs_qd_swapped": "Qs and Qd swapped"})
def price_ceiling(rng, err=None):
    return _control(rng, err, "price_ceiling")


@graph("price_floor", "micro/government", "Price floor", {
    "floor_below_equilibrium": "Floor drawn below P* but shown as binding",
    "labeled_shortage": "Surplus mislabeled as shortage",
    "qs_qd_swapped": "Qs and Qd swapped"})
def price_floor(rng, err=None):
    return _control(rng, err, "price_floor")


@graph("per_unit_tax", "micro/government", "Per-unit tax", {
    "tax_shifts_supply_down": "Tax shifts supply down (that is a subsidy)",
    "dwl_wrong_side": "Deadweight loss drawn to the right of Q*",
    "revenue_uses_original_quantity": "Tax revenue rectangle uses Q* instead of Qt",
    "producer_price_at_old_equilibrium": "Producer price drawn at old P*"})
def per_unit_tax(rng, err=None):
    D, S = sd_lines(rng); yl, xl = pq(rng)
    t = rng.uniform(1.6, 2.4)
    St = S.shifty(t if err != "tax_shifts_supply_down" else -t)
    s = Scene("per_unit_tax", "Per-unit tax on sellers", xl, yl, caption=f"A per-unit tax of ${t:.2f} is placed on sellers")
    q, p = inter(D, S); qt, pc = inter(D, St); pp = float(S.y(qt))
    s.curve("D", "demand", "D", D.pts()); s.curve("S", "supply", "S", S.pts(), color=1)
    s.curve("S_tax", "supply_with_tax", "S + tax", St.pts(), color=2)
    s.point("E", "equilibrium", (q, p), None, "Q*", "P*")
    s.point("Ec", "consumer_price", (qt, pc), None, "Qt", "Pc")
    s.point("Ep", "producer_price", (qt, pp), None, None, "Pp")
    if err == "tax_shifts_supply_down":
        s.remove("Ep", "Ep_hguide", "Ep_ytick")
        s.set_error(err, ["S_tax"], "A tax on sellers raises their cost per unit, shifting supply up (left) by the tax. Shifting it down shows a subsidy.",
                    "Draw S + tax above S by the amount of the tax; Pc rises, Qt falls.")
        return s
    rq = q if err == "revenue_uses_original_quantity" else qt
    s.region("revenue", "tax_revenue", "Tax revenue", [(0, pp), (0, pc), (rq, pc), (rq, pp)], color=4)
    if err == "dwl_wrong_side":
        q2 = q + (q - qt)
        s.region("DWL", "deadweight_loss", "DWL", [(q, p), (q2, float(S.y(q2))), (q2, float(D.y(q2)))], color=1)
    else:
        s.region("DWL", "deadweight_loss", "DWL", [(qt, pc), (qt, pp), (q, p)], color=1)
    s.step("Tax shifts supply up by the tax: S → S + tax.", "S_tax")
    s.step("New quantity Qt where D meets S + tax; buyers pay Pc (on D).", "Ec", "Ec_ytick", "Ec_xtick")
    s.step("Sellers keep Pp = Pc − tax, read off the original S at Qt.", "Ep", "Ep_ytick")
    s.step("Tax revenue = tax × Qt (rectangle between Pc and Pp).", "revenue")
    s.step("Deadweight loss is the triangle between D and S from Qt to Q*.", "DWL")
    if err == "dwl_wrong_side":
        s.set_error(err, ["DWL"], "The deadweight loss is drawn beyond Q*. A tax reduces trade, so the lost surplus is between Qt and Q*, to the left of the original equilibrium.",
                    "Shade the triangle with vertices (Qt,Pc), (Qt,Pp) and E.")
    elif err == "revenue_uses_original_quantity":
        s.set_error(err, ["revenue", "Ec_xtick"], "Tax revenue is tax × quantity actually sold after the tax (Qt), not the pre-tax Q*.",
                    "Make the revenue rectangle width Qt.")
    elif err == "producer_price_at_old_equilibrium":
        s.move_point("Ep", (qt, p))
        s.set_error(err, ["Ep", "Ep_ytick", "revenue"], "Pp is drawn at the old equilibrium price. Sellers receive Pc minus the tax, which is the height of the original supply curve at Qt.",
                    "Read Pp off the original S at Qt.")
    return s


@graph("per_unit_subsidy", "micro/government", "Per-unit subsidy", {
    "subsidy_shifts_supply_up": "Subsidy shifts supply up (that is a tax)",
    "dwl_wrong_side": "Deadweight loss drawn left of Q*"})
def per_unit_subsidy(rng, err=None):
    D, S = sd_lines(rng); yl, xl = pq(rng)
    sub = rng.uniform(1.4, 2.0)
    Ss = S.shifty(-sub if err != "subsidy_shifts_supply_up" else sub)
    s = Scene("per_unit_subsidy", "Per-unit subsidy to producers", xl, yl, caption=f"Government pays producers ${sub:.2f} per unit")
    q, p = inter(D, S); qs, pc = inter(D, Ss); pp = float(S.y(qs))
    s.curve("D", "demand", "D", D.pts()); s.curve("S", "supply", "S", S.pts(), color=1)
    s.curve("S_sub", "supply_with_subsidy", "S − subsidy", Ss.pts(x0=0), color=2)
    s.point("E", "equilibrium", (q, p), None, "Q*", "P*")
    s.point("Ec", "consumer_price", (qs, pc), None, "Qs", "Pc")
    if err == "subsidy_shifts_supply_up":
        s.set_error(err, ["S_sub"], "A subsidy lowers producers' effective cost, shifting supply down (right). Shifting it up shows a tax.",
                    "Draw S − subsidy below S; price to buyers falls and quantity rises.")
        return s
    s.point("Ep", "producer_price", (qs, pp), None, None, "Pp")
    if err == "dwl_wrong_side":
        q0 = q - (qs - q)
        s.region("DWL", "deadweight_loss", "DWL", [(q, p), (q0, float(S.y(q0))), (q0, float(D.y(q0)))], color=1)
        s.set_error(err, ["DWL"], "With a subsidy, output rises past Q*. The deadweight loss comes from overproduction between Q* and Qs, to the right of E.",
                    "Shade the triangle between E, (Qs,Pp) and (Qs,Pc).")
    else:
        s.region("DWL", "deadweight_loss", "DWL", [(q, p), (qs, pp), (qs, pc)], color=1)
    s.step("Subsidy shifts supply down by the subsidy amount.", "S_sub")
    s.step("Quantity rises to Qs; buyers pay Pc, sellers receive Pp = Pc + subsidy.", "Ec", "Ep")
    s.step("Overproduction between Q* and Qs creates deadweight loss.", "DWL")
    return s


@graph("elasticity_comparison", "micro/elasticity", "Elastic vs inelastic demand", {
    "elasticity_labels_swapped": "Steep curve labeled elastic, flat curve labeled inelastic"})
def elasticity(rng, err=None):
    yl, xl = pq(rng)
    x0, y0 = rng.uniform(4, 5.5), rng.uniform(4, 5.5)
    steep, flat = L(y0 + rng.uniform(2.5, 4) * x0, -rng.uniform(2.5, 4)), L(y0 + rng.uniform(0.2, 0.35) * x0, -rng.uniform(0.2, 0.35))
    steep = L(y0 - steep.m * x0, steep.m); flat = L(y0 - flat.m * x0, flat.m)
    s = Scene("elasticity_comparison", "Price elasticity of demand", xl, yl)
    a, b = ("Elastic", "Inelastic") if err else ("Inelastic", "Elastic")
    s.curve("D_steep", "demand_inelastic", f"D ({a.lower()})", steep.pts(), lpos=0.05)
    s.curve("D_flat", "demand_elastic", f"D ({b.lower()})", flat.pts(), lpos=0.97, color=1)
    s.point("A", "common_point", (x0, y0), "A")
    s.step("Both curves pass through A.", "A")
    s.step("The steep curve: a big price change barely changes quantity → inelastic (|Ed| < 1).", "D_steep")
    s.step("The flat curve: a small price change causes a large quantity change → elastic (|Ed| > 1).", "D_flat")
    if err:
        s.set_error("elasticity_labels_swapped", ["D_steep", "D_flat"], "The labels are reversed. Through the same point, the steeper demand curve is relatively inelastic and the flatter one relatively elastic.",
                    "Label the steep curve inelastic and the flat curve elastic.")
    return s


@graph("perfect_elasticity", "micro/elasticity", "Perfectly elastic and perfectly inelastic demand", {
    "perfect_labels_swapped": "Horizontal curve labeled perfectly inelastic"})
def perfect_el(rng, err=None):
    yl, xl = pq(rng)
    s = Scene("perfect_elasticity", "Perfectly elastic vs perfectly inelastic", xl, yl)
    y, x = rng.uniform(3, 7), rng.uniform(3, 7)
    a, b = ("Perfectly inelastic", "Perfectly elastic") if err else ("Perfectly elastic", "Perfectly inelastic")
    s.curve("D_horizontal", "demand_perfectly_elastic", a, hline(y, 0, 9.3), lpos=0.6)
    s.curve("D_vertical", "demand_perfectly_inelastic", b, vline(x, 0, 9.0), lpos=0.95, color=1)
    s.step("Horizontal demand: any price increase drops quantity to zero → perfectly elastic (Ed = ∞).", "D_horizontal")
    s.step("Vertical demand: quantity never changes with price → perfectly inelastic (Ed = 0).", "D_vertical")
    if err:
        s.set_error("perfect_labels_swapped", ["D_horizontal", "D_vertical"], "A horizontal demand curve is perfectly elastic and a vertical one is perfectly inelastic; the labels are reversed.",
                    "Swap the two labels.")
    return s

# ---------------------------------------------------------------- PPF / trade

GOODS = [("Consumer goods", "Capital goods"), ("Guns", "Butter"), ("Wheat", "Cars"), ("Pizza", "Robots"), ("Food", "Clothing")]


@graph("ppf", "micro/scarcity", "Production possibilities frontier", {
    "ppf_bowed_in": "PPF drawn bowed-in while claiming increasing opportunity cost",
    "point_labels_wrong": "Inside point labeled efficient, frontier point labeled inefficient",
    "outside_point_attainable": "Point outside the PPF labeled attainable"})
def ppf(rng, err=None):
    gx, gy = pick(rng, GOODS)
    X, Y = rng.uniform(7.5, 9.3), rng.uniform(7.5, 9.3)
    s = Scene("ppf", "Production possibilities frontier", gx, gy, caption="Resources are not equally suited to both goods (increasing opportunity cost)")
    if err == "ppf_bowed_in":
        f = lambda x: Y * (1 - np.sqrt(np.clip(x / X, 0, 1))) ** 2
    else:
        f = lambda x: Y * np.sqrt(np.clip(1 - (x / X) ** 2, 0, 1))
    s.curve("PPF", "ppf", "PPF", fn(f, 0, X, 120), lpos=0.75)
    xa = rng.uniform(0.45, 0.6) * X
    s.point("A", "efficient", (xa, float(f(xa))), "A (efficient)" if err != "point_labels_wrong" else "A (inefficient)", guides=False)
    xb = rng.uniform(0.2, 0.35) * X
    s.point("B", "inefficient", (xb, float(f(xb)) * rng.uniform(0.35, 0.6)), "B (inefficient)" if err != "point_labels_wrong" else "B (efficient)", guides=False)
    xc = rng.uniform(0.62, 0.72) * X
    yc = min(9.2, float(Y * np.sqrt(max(0, 1 - (xc / X) ** 2))) + rng.uniform(1.2, 1.8))
    s.point("C", "unattainable", (xc, yc), "C (attainable)" if err == "outside_point_attainable" else "C (unattainable)", guides=False)
    s.step("The frontier shows maximum output combinations with all resources fully used.", "PPF")
    s.step("Points on the curve (A) are efficient.", "A")
    s.step("Points inside (B) are attainable but inefficient (unused resources).", "B")
    s.step("Points outside (C) are unattainable with current resources and technology.", "C")
    s.step("Bowed-out shape = increasing opportunity cost.", "PPF")
    if err == "ppf_bowed_in":
        s.set_error(err, ["PPF"], "The PPF is bowed in (convex). Increasing opportunity cost requires a bowed-out (concave) frontier: each extra unit of X costs more Y.",
                    "Redraw the PPF bowed outward from the origin.")
    elif err == "point_labels_wrong":
        s.set_error(err, ["A", "B"], "Points on the frontier are efficient and points inside are inefficient; A and B are labeled the wrong way around.",
                    "Label A efficient and B inefficient.")
    elif err == "outside_point_attainable":
        s.set_error(err, ["C", "PPF"], "C lies outside the PPF, so it cannot be produced with current resources and technology.",
                    "Label C unattainable.")
    return s


@graph("ppf_shift", "micro/scarcity", "PPF shift (economic growth)", {
    "shift_inward": "Growth drawn as an inward shift",
    "pivot_vs_parallel": "Technology improving one good drawn as an outward shift on both axes"})
def ppf_shift(rng, err=None):
    gx, gy = pick(rng, GOODS)
    X, Y = rng.uniform(5.5, 6.8), rng.uniform(5.5, 6.8)
    one = bool(rng.random() < 0.5)
    cap = f"New technology improves production of {gx.lower()} only" if one else pick(rng, ["The labor force grows", "Investment adds to the capital stock", "General technological progress"])
    s = Scene("ppf_shift", "Economic growth shifts the PPF", gx, gy, caption=cap)
    f1 = lambda x: Y * np.sqrt(np.clip(1 - (x / X) ** 2, 0, 1))
    s.curve("PPF1", "ppf", "PPF₁", fn(f1, 0, X, 100), lpos=0.6)
    k = rng.uniform(1.3, 1.45)
    if err == "shift_inward": X2, Y2 = X / k, Y / k
    elif one and err != "pivot_vs_parallel": X2, Y2 = X * k, Y
    elif one: X2, Y2 = X * k, Y * k
    else: X2, Y2 = X * k, Y * k
    f2 = lambda x: Y2 * np.sqrt(np.clip(1 - (x / X2) ** 2, 0, 1))
    s.curve("PPF2", "ppf", "PPF₂", fn(f2, 0, X2, 100), lpos=0.6, color=2)
    r = 0.7
    s.arrow("shift_arrow", "shift", (X * r, float(f1(X * r))), (X2 * r, float(f2(X2 * r))))
    s.step("Start with PPF₁.", "PPF1")
    s.step(("Technology that only helps one good pivots the PPF out along that good's axis; the other intercept stays put." if one else "More resources or general technology shift the whole PPF outward."), "PPF2", "shift_arrow")
    if err == "shift_inward":
        s.set_error(err, ["PPF2", "shift_arrow"], f"'{cap}' expands production possibilities, so the PPF must shift outward, not inward.",
                    "Draw PPF₂ outside PPF₁.")
    elif err == "pivot_vs_parallel":
        if not one: return ppf_shift(rng, err)
        s.set_error(err, ["PPF2"], f"The technology only affects {gx.lower()}, so the maximum amount of {gy.lower()} does not change. The PPF should pivot out along the {gx.lower()} axis.",
                    f"Keep the {gy.lower()} intercept fixed and move only the {gx.lower()} intercept out.")
    return s


@graph("comparative_advantage", "micro/trade", "Comparative advantage (linear PPFs)", {
    "comparative_advantage_reversed": "Comparative advantage assigned to the higher opportunity-cost producer"})
def comp_adv(rng, err=None):
    gx, gy = pick(rng, GOODS)
    while True:
        ax_, ay = rng.uniform(4, 9.2), rng.uniform(4, 9.2); bx, by = rng.uniform(4, 9.2), rng.uniform(4, 9.2)
        if abs(ay / ax_ - by / bx) > 0.35: break
    s = Scene("comparative_advantage", "Comparative advantage", gx, gy)
    s.curve("PPF_A", "ppf", "Country A", lin(0, ay, ax_, 0), lpos=0.15)
    s.curve("PPF_B", "ppf", "Country B", lin(0, by, bx, 0), lpos=0.85, color=1)
    oa, ob = ay / ax_, by / bx
    who = "A" if oa < ob else "B"
    if err: who = "B" if who == "A" else "A"
    s.text("claim", "claim", (6.8, 8.9), f"Country {who} has comparative\nadvantage in {gx.lower()}")
    s.facts = {"opp_cost_x_A": oa, "opp_cost_x_B": ob}
    s.step(f"Opportunity cost of 1 {gx.lower()} = slope of each PPF: A gives up {oa:.2f}, B gives up {ob:.2f} units of {gy.lower()}.", "PPF_A", "PPF_B")
    s.step(f"Lower opportunity cost → comparative advantage in {gx.lower()}.", "claim")
    if err:
        s.set_error("comparative_advantage_reversed", ["claim", "PPF_A", "PPF_B"], f"Comparative advantage goes to the lower opportunity cost. Country {'A' if oa < ob else 'B'} gives up less {gy.lower()} per unit of {gx.lower()} (flatter PPF).",
                    f"Country {'A' if oa < ob else 'B'} has the comparative advantage in {gx.lower()}.")
    return s


@graph("tariff", "micro/trade", "Tariff in a small open economy", {
    "tariff_lowers_price": "Tariff drawn below the world price",
    "revenue_rectangle_wrong": "Tariff revenue uses free-trade import quantities",
    "imports_from_origin": "Imports measured from the origin instead of Qs to Qd"})
def tariff(rng, err=None):
    D, S = sd_lines(rng); yl, xl = pq(rng)
    q, p = inter(D, S)
    pw = rng.uniform(max(S.i + 0.5, p - 3.2), p - 1.8); t = rng.uniform(0.7, 1.0) * (p - pw) * 0.6
    pt = pw + t if err != "tariff_lowers_price" else pw - t
    s = Scene("tariff", "Tariff on imports", xl, yl)
    s.curve("D", "demand", "D", D.pts()); s.curve("S", "supply", "S (domestic)", S.pts(), color=1)
    s.curve("Pw", "world_price", "Pw", hline(pw, 0, 9.4), lpos=0.92, color=3)
    s.curve("Pt", "price_with_tariff", "Pw + tariff", hline(pt, 0, 9.4), lpos=0.86, color=2)
    qs1, qd1, qs2, qd2 = (float(S.x(pw)), float(D.x(pw)), float(S.x(pt)), float(D.x(pt)))
    s.point("S2", "domestic_supply", (qs2, pt), None, "Qs₂", None); s.point("D2", "domestic_demand", (qd2, pt), None, "Qd₂", None)
    s.point("S1", "domestic_supply", (qs1, pw), None, "Qs₁", None); s.point("D1", "domestic_demand", (qd1, pw), None, "Qd₁", None)
    if err == "tariff_lowers_price":
        s.set_error(err, ["Pt"], "A tariff is a tax on imports; it raises the domestic price above the world price, not below it.",
                    "Draw Pw + tariff above Pw. Domestic quantity supplied rises and imports shrink.")
        return s
    a, b = (qs1, qd1) if err == "revenue_rectangle_wrong" else (qs2, qd2)
    s.region("revenue", "tariff_revenue", "Revenue", [(a, pw), (a, pt), (b, pt), (b, pw)], color=4)
    s.region("DWL1", "deadweight_loss", None, [(qs1, pw), (qs2, pt), (qs2, pw)], color=1)
    s.region("DWL2", "deadweight_loss", None, [(qd2, pt), (qd1, pw), (qd2, pw)], color=1)
    ia = (0, qd2) if err == "imports_from_origin" else (qs2, qd2)
    s.arrow("imports", "imports", (ia[0], pt + 0.45), (ia[1], pt + 0.45), "Imports")
    s.step("At the world price Pw, imports = Qd₁ − Qs₁.", "Pw", "S1_xtick", "D1_xtick")
    s.step("The tariff raises the domestic price to Pw + tariff.", "Pt")
    s.step("Imports shrink to Qd₂ − Qs₂.", "imports")
    s.step("Revenue = tariff × new imports; two triangles are deadweight loss.", "revenue", "DWL1", "DWL2")
    if err == "revenue_rectangle_wrong":
        s.set_error(err, ["revenue"], "Tariff revenue is collected only on imports after the tariff (Qs₂ to Qd₂), not on free-trade imports.",
                    "Shrink the revenue rectangle to span Qs₂–Qd₂ between Pw and Pw + tariff.")
    elif err == "imports_from_origin":
        s.set_error(err, ["imports"], "Imports are the gap between domestic quantity demanded and domestic quantity supplied, not total quantity demanded.",
                    "Measure imports from Qs₂ to Qd₂.")
    return s

# ---------------------------------------------------------------- consumer / producer choice

def _tangency(rng, err, kind):
    cons = kind == "consumer_optimum"
    xl, yl = (pick(rng, ["Good X", "Pizza", "Movies"]), pick(rng, ["Good Y", "Soda", "Books"])) if cons else ("Labor (L)", "Capital (K)")
    s = Scene(kind, "Consumer optimum" if cons else "Cost-minimizing input mix", xl, yl)
    Mx, My, al = rng.uniform(6.5, 8.5), rng.uniform(6.5, 8.5), rng.uniform(0.38, 0.62)
    xs, ys = al * Mx, (1 - al) * My
    u = xs ** al * ys ** (1 - al)
    ic = lambda uu, a=al: (lambda x: (uu / np.maximum(x, 1e-6) ** a) ** (1 / (1 - a)))
    nm, lab = ("budget", "Budget line") if cons else ("isocost", "Isocost")
    cn, cl = ("IC", "IC") if cons else ("isoquant", "Q")
    s.curve("line", nm, lab, lin(0, My, Mx, 0), lpos=0.04)
    levels = [0.72, 1.0, 1.32]
    for i, kk in enumerate(levels):
        f = ic(u * kk); pts = fn(f, 0.35, 9.6, 200); pts = pts[(pts[:, 1] <= 9.6) & (pts[:, 1] >= 0.3)]
        if err == "curves_concave":
            g = lambda x, kk=kk: ys * kk - (My / Mx) * (x - xs * kk) - 0.09 * (x - xs * kk) ** 2
            pts = fn(g, 0.2, 9.6, 200); pts = pts[(pts[:, 1] <= 9.6) & (pts[:, 1] >= 0.3)]
        s.curve(f"{cn}{i+1}", "indifference_curve" if cons else "isoquant", f"{cl}{'₁₂₃'[i]}" if cons else f"Q{'₁₂₃'[i]}", pts, lpos=0.97, color=1 + i)
    s.point("E", "optimum", (xs, ys), "E", "X*" if cons else "L*", "Y*" if cons else "K*")
    if err == "optimum_not_tangent":
        f1 = ic(u * levels[0]); roots = curve_inter(f1, lambda x: My - (My / Mx) * x, 0.3, Mx)
        x2 = roots[0]; s.move_point("E", (x2, float(My - My / Mx * x2)))
        s.set_error(err, ["E", f"{cn}1", "line"], ("At E the indifference curve crosses the budget line, so MRS ≠ Px/Py. The consumer can reach a higher indifference curve by reallocating spending." if cons else
                    "At E the isoquant crosses the isocost, so MRTS ≠ w/r. The same cost could produce more output."),
                    "Move the optimum to where the highest reachable curve is tangent to the line.")
    elif err == "curves_crossing":
        b2 = min(0.85, al + 0.3); xc = xs * 0.55; yc = float(ic(u)(xc)); u3 = xc ** b2 * yc ** (1 - b2)
        pts = fn(ic(u3, b2), 0.35, 9.6, 200); pts = pts[(pts[:, 1] <= 9.6) & (pts[:, 1] >= 0.3)]
        s.get(f"{cn}3")["pts"] = pts
        s.set_error(err, [f"{cn}2", f"{cn}3"], ("Indifference curves cannot cross: the crossing point would give two different utility levels, violating transitivity." if cons else
                    "Isoquants cannot cross: one input bundle cannot produce two different output levels."), "Draw the curves so that none of them intersect.")
    elif err == "curves_concave":
        s.set_error(err, [f"{cn}1", f"{cn}2", f"{cn}3"], ("Indifference curves are drawn concave to the origin. Diminishing MRS makes them convex (bowed toward the origin); with concave curves, the tangency point is a utility minimum." if cons else
                    "Isoquants should be convex to the origin (diminishing MRTS)."), "Redraw the curves bowed toward the origin.")
    if cons:
        s.step("Budget line: all bundles that exactly use income; slope = −Px/Py.", "line")
        s.step("Indifference curves: convex, higher curves = more utility, never cross.", "IC1", "IC2", "IC3")
        s.step("Optimum E: the highest IC that just touches the budget line (MRS = Px/Py).", "E", "IC2")
    else:
        s.step("Isocost: all input combos with the same total cost; slope = −w/r.", "line")
        s.step("Isoquants: combos that produce the same output.", "isoquant1", "isoquant2", "isoquant3")
        s.step("Cost-minimizing mix where an isoquant is tangent to the isocost (MRTS = w/r).", "E")
    return s


@graph("consumer_optimum", "micro/consumer", "Indifference curves and budget line", {
    "optimum_not_tangent": "Optimum where an IC crosses the budget line",
    "curves_crossing": "Indifference curves cross",
    "curves_concave": "Indifference curves concave to origin"})
def consumer_optimum(rng, err=None):
    return _tangency(rng, err, "consumer_optimum")


@graph("isoquant_isocost", "micro/producer", "Isoquants and isocost", {
    "optimum_not_tangent": "Optimum where an isoquant crosses the isocost",
    "curves_crossing": "Isoquants cross",
    "curves_concave": "Isoquants concave to origin"})
def isoquant(rng, err=None):
    return _tangency(rng, err, "isoquant_isocost")


@graph("budget_line_shift", "micro/consumer", "Budget line shifts", {
    "income_drawn_as_pivot": "Income change drawn as a pivot",
    "price_drawn_as_parallel": "Single-price change drawn as a parallel shift"})
def budget_shift(rng, err=None):
    xl, yl = pick(rng, ["Good X", "Pizza"]), pick(rng, ["Good Y", "Soda"])
    Mx, My = rng.uniform(4.5, 6), rng.uniform(4.5, 6); k = rng.uniform(1.3, 1.5)
    inc = bool(rng.random() < 0.5)
    cap = "Income rises, prices unchanged" if inc else f"Price of {xl.lower()} falls"
    s = Scene("budget_line_shift", "Budget line shift", xl, yl, caption=cap)
    s.curve("BL1", "budget", "BL₁", lin(0, My, Mx, 0), lpos=0.05)
    if inc: X2, Y2 = (Mx * k, My * k) if err != "income_drawn_as_pivot" else (Mx * k, My)
    else: X2, Y2 = (Mx * k, My) if err != "price_drawn_as_parallel" else (Mx * k, My * k)
    s.curve("BL2", "budget", "BL₂", lin(0, Y2, X2, 0), lpos=0.95, color=2)
    s.step("Original budget line BL₁.", "BL1")
    s.step("Income change → parallel shift (same slope). Price change of one good → pivot around the other good's intercept.", "BL2")
    if err == "income_drawn_as_pivot" and inc:
        s.set_error(err, ["BL2"], "A pure income increase with unchanged prices keeps the slope (−Px/Py), so the line shifts out in parallel; both intercepts move.",
                    "Move both intercepts out proportionally.")
    elif err == "price_drawn_as_parallel" and not inc:
        s.set_error(err, ["BL2"], f"Only the price of {xl.lower()} changed, so the {yl.lower()} intercept (income/Py) stays fixed; the line pivots out along the {xl.lower()} axis.",
                    f"Keep the {yl.lower()} intercept and move only the {xl.lower()} intercept.")
    elif err:
        return budget_shift(rng, err)
    return s

# ---------------------------------------------------------------- costs & market structures

def _costs(rng, scale=None):
    a, b, c, F = 6.0, 1.2, 0.09, rng.uniform(6, 10)
    k = scale or rng.uniform(0.85, 1.05)
    AVC = lambda q: k * (a - b * q + c * q ** 2)
    MC = lambda q: k * (a - 2 * b * q + 3 * c * q ** 2)
    AFC = lambda q: k * F / q
    ATC = lambda q: AFC(q) + AVC(q)
    qs = np.linspace(0.4, 9.8, 2000)
    q_atc = float(qs[np.argmin(ATC(qs))]); q_avc = float(qs[np.argmin(AVC(qs))])
    return dict(AVC=AVC, MC=MC, AFC=AFC, ATC=ATC, q_atc=q_atc, q_avc=q_avc)


def _cpts(f, x0=0.4, x1=9.8):
    p = fn(f, x0, x1, 300); return p[(p[:, 1] <= 9.7) & (p[:, 1] >= 0.15)]


@graph("cost_curves", "micro/costs", "Short-run cost curves", {
    "mc_misses_atc_min": "MC does not pass through the minimum of ATC/AVC",
    "atc_avc_labels_swapped": "AVC labeled above ATC",
    "afc_rising": "AFC drawn rising"})
def cost_curves(rng, err=None):
    C = _costs(rng)
    s = Scene("cost_curves", "Short-run cost curves", pick(rng, ["Quantity (Q)", "Output (q)", "Q"]), pick(rng, ["Cost ($)", "Costs", "$"]))
    mcf = C["MC"] if err != "mc_misses_atc_min" else (lambda q: C["MC"](q - 1.3))
    s.curve("MC", "marginal_cost", "MC", _cpts(mcf, 0.4 if err != "mc_misses_atc_min" else 1.7), color=1)
    s.curve("ATC", "average_total_cost", "ATC" if err != "atc_avc_labels_swapped" else "AVC", _cpts(C["ATC"]))
    s.curve("AVC", "average_variable_cost", "AVC" if err != "atc_avc_labels_swapped" else "ATC", _cpts(C["AVC"]), color=2)
    af = C["AFC"] if err != "afc_rising" else (lambda q: 0.3 + 0.35 * q)
    s.curve("AFC", "average_fixed_cost", "AFC", _cpts(af), color=3)
    s.point("minATC", "min_atc", (C["q_atc"], float(C["ATC"](C["q_atc"]))), None, guides=False)
    s.point("minAVC", "min_avc", (C["q_avc"], float(C["AVC"](C["q_avc"]))), None, guides=False)
    s.step("MC is U-shaped (diminishing marginal returns).", "MC")
    s.step("MC cuts AVC and ATC at their minimum points.", "minAVC", "minATC", "MC")
    s.step("ATC = AVC + AFC, so ATC lies above AVC and the gap (AFC) shrinks as output rises.", "ATC", "AVC", "AFC")
    if err == "mc_misses_atc_min":
        s.set_error(err, ["MC", "minATC", "minAVC"], "MC must cross ATC and AVC at their minimum points: when marginal cost is below average, the average falls; when above, it rises.",
                    "Redraw MC so it passes through the lowest points of AVC and ATC.")
    elif err == "atc_avc_labels_swapped":
        s.set_error(err, ["ATC", "AVC"], "ATC = AVC + AFC, so ATC must lie above AVC. The labels are reversed.", "Label the higher U-shaped curve ATC and the lower one AVC.")
    elif err == "afc_rising":
        s.set_error(err, ["AFC"], "Average fixed cost = FC/Q always falls as output rises, since a fixed amount is spread over more units.", "Draw AFC as a downward-sloping curve that approaches the axis.")
    return s


def _pc_firm(rng, err, kind):
    C = _costs(rng)
    atcmin = float(C["ATC"](C["q_atc"])); avcmin = float(C["AVC"](C["q_avc"]))
    if kind == "pc_firm_profit": P = atcmin + rng.uniform(1.4, 2.4)
    elif kind == "pc_firm_loss": P = avcmin + (atcmin - avcmin) * rng.uniform(0.35, 0.65)
    else: P = atcmin
    if kind == "pc_long_run" and err == "lr_price_above_atc_min": P = atcmin + rng.uniform(1.4, 2.0)
    title = {"pc_firm_profit": "Perfectly competitive firm: short-run profit", "pc_firm_loss": "Perfectly competitive firm: short-run loss", "pc_long_run": "Perfectly competitive firm: long-run equilibrium"}[kind]
    s = Scene(kind, title, pick(rng, ["Quantity (q)", "Output (q)", "q"]), pick(rng, ["Price, cost ($)", "P, C", "$"]))
    s.curve("MC", "marginal_cost", "MC", _cpts(C["MC"]), color=1)
    s.curve("ATC", "average_total_cost", "ATC", _cpts(C["ATC"]))
    if kind == "pc_firm_loss": s.curve("AVC", "average_variable_cost", "AVC", _cpts(C["AVC"]), color=2)
    s.curve("MR", "marginal_revenue", "P = MR = AR = D", hline(P, 0, 9.0), lpos=0.12, color=3)
    roots = curve_inter(C["MC"], lambda q: P + 0 * q, 0.4, 9.8)
    q = roots[-1]
    if err == "output_at_min_atc": q = C["q_atc"]
    if err == "output_where_mc_falling" and len(roots) > 1: q = roots[0]
    atc = float(C["ATC"](q))
    s.point("E", "profit_max", (q, P), None, "q*", "P")
    s.point("ATCq", "atc_at_q", (q, atc), None, None, "ATC" if kind != "pc_long_run" else None, guides=kind != "pc_long_run")
    s.facts = {"P": P, "q*": roots[-1], "ATC(q*)": float(C["ATC"](roots[-1]))}
    s.step("A price taker faces a horizontal demand: P = MR = AR.", "MR")
    s.step("Profit-maximizing output where MR = MC (on the rising part of MC).", "E", "E_xtick")
    if kind == "pc_firm_profit":
        bot = float(C["AVC"](q)) if err == "profit_height_uses_avc" else atc
        if err == "profit_height_uses_avc": s.move_point("ATCq", (q, bot)); s.get("ATCq_ytick")["label"] = "ATC"
        s.region("profit", "economic_profit", "Profit", [(0, bot), (0, P), (q, P), (q, bot)], color=2)
        s.step("Profit = (P − ATC) × q*, the rectangle between P and ATC at q*.", "profit", "ATCq")
        if err == "output_at_min_atc":
            s.set_error(err, ["E", "E_xtick", "profit"], "Output is set at the minimum of ATC. A profit-maximizing firm produces where MR = MC, which is to the right of min ATC when P is above it.",
                        "Move q* to where P = MC on the rising MC curve.")
        elif err == "output_where_mc_falling" and len(roots) > 1:
            s.set_error(err, ["E", "E_xtick", "MC"], "q* is at the crossing on the falling part of MC; there, producing more adds profit. The profit maximum is where MC crosses MR from below.",
                        "Use the MC = MR crossing on the upward-sloping part of MC.")
        elif err == "profit_height_uses_avc":
            s.set_error(err, ["profit", "ATCq", "ATCq_ytick"], "The profit rectangle is measured down to AVC (which ignores fixed costs). Economic profit is (P − ATC) × q.",
                        "Draw the bottom of the profit rectangle at ATC(q*).")
    elif kind == "pc_firm_loss":
        s.region("loss", "economic_loss", "Loss" if err != "loss_labeled_profit" else "Profit", [(0, P), (0, atc), (q, atc), (q, P)], color=1)
        claim = "Firm should keep producing\n(P > AVC)" if err != "shutdown_claim_wrong" else "Firm should shut down\n(P < ATC)"
        s.text("claim", "claim", (6.2, 9.0), claim)
        s.step("Price is below ATC → loss = (ATC − P) × q*.", "loss", "ATCq")
        s.step("Price is above AVC, so it covers variable costs: keep producing in the short run.", "AVC", "claim")
        if err == "loss_labeled_profit":
            s.set_error(err, ["loss", "ATCq", "MR"], "ATC at q* is above the price, so the firm earns an economic loss, not a profit.", "Label the rectangle 'Loss'.")
        elif err == "shutdown_claim_wrong":
            s.set_error(err, ["claim", "AVC", "MR"], "The shutdown rule compares P with AVC, not ATC. Since P > min AVC, producing loses less than shutting down (which loses all fixed costs).",
                        "The firm should keep operating in the short run; shut down only if P < min AVC.")
    else:
        s.step("Long run: entry/exit drives price to min ATC, so economic profit is zero.", "E", "ATC")
        if err == "lr_price_above_atc_min":
            s.set_error(err, ["MR", "ATC", "E"], "Price is above min ATC, so firms earn positive economic profit. That attracts entry, so it cannot be a long-run equilibrium.",
                        "In long-run equilibrium P = MR = MC = min ATC.")
    return s


@graph("pc_firm_profit", "micro/market_structure", "Perfect competition: profit", {
    "output_at_min_atc": "Output chosen at min ATC instead of MR = MC",
    "output_where_mc_falling": "Output at falling-MC crossing",
    "profit_height_uses_avc": "Profit rectangle measured to AVC"})
def pc_profit(rng, err=None):
    return _pc_firm(rng, err, "pc_firm_profit")


@graph("pc_firm_loss", "micro/market_structure", "Perfect competition: loss", {
    "loss_labeled_profit": "Loss rectangle labeled profit",
    "shutdown_claim_wrong": "Shutdown rule applied using ATC"})
def pc_loss(rng, err=None):
    return _pc_firm(rng, err, "pc_firm_loss")


@graph("pc_long_run", "micro/market_structure", "Perfect competition: long run", {
    "lr_price_above_atc_min": "Long-run equilibrium shown with positive profit"})
def pc_lr(rng, err=None):
    return _pc_firm(rng, err, "pc_long_run")


@graph("monopoly", "micro/market_structure", "Monopoly", {
    "price_read_from_mr": "Monopoly price read off MR/MC instead of demand",
    "mr_parallel_to_demand": "MR drawn parallel to demand",
    "quantity_where_d_meets_mc": "Output where demand meets MC"})
def monopoly(rng, err=None):
    a, b = rng.uniform(8.8, 9.6), rng.uniform(0.8, 1.05)
    D = L(a, -b); MR = L(a, -2 * b); MC = L(rng.uniform(1.0, 2.2), rng.uniform(0.35, 0.6))
    yl, xl = pq(rng)
    s = Scene("monopoly", "Profit-maximizing monopoly", xl, yl)
    s.curve("D", "demand", "D = AR", D.pts(), lpos=0.9)
    mr = MR if err != "mr_parallel_to_demand" else L(a - 2.2, -b)
    s.curve("MR", "marginal_revenue", "MR", mr.pts(), lpos=0.95, color=2)
    s.curve("MC", "marginal_cost", "MC", MC.pts(), color=1)
    qm, cm = inter(MR, MC); pm = float(D.y(qm)); qc, pc = inter(D, MC)
    if err == "mr_parallel_to_demand": qm, cm = inter(mr, MC); pm = float(D.y(qm))
    q_draw, p_draw = qm, pm
    if err == "price_read_from_mr": p_draw = cm
    if err == "quantity_where_d_meets_mc": q_draw, p_draw = qc, pc
    s.point("M", "monopoly_price", (q_draw, p_draw), "M", "Qm", "Pm")
    if err != "quantity_where_d_meets_mc":
        s.point("X", "mr_eq_mc", (qm, cm), None, guides=False)
        s.region("DWL", "deadweight_loss", "DWL", [(qm, pm), (qm, cm), (qc, pc)], color=1)
    s.point("C", "competitive", (qc, pc), None, "Qc", None)
    s.step("MR lies below demand and (for linear D) is twice as steep.", "MR", "D")
    s.step("Choose Qm where MR = MC.", "X", "M_xtick")
    s.step("Price is read up from Qm to the demand curve: Pm.", "M", "M_ytick")
    s.step("Output is below the competitive Qc, so there is deadweight loss.", "DWL", "C")
    if err == "price_read_from_mr":
        s.set_error(err, ["M", "M_ytick", "D"], "The monopolist charges the highest price consumers will pay for Qm, which is on the demand curve, not at the MR = MC point.",
                    "Go up from Qm to D and read Pm there.")
    elif err == "mr_parallel_to_demand":
        s.set_error(err, ["MR", "D"], "With linear demand P = a − bQ, MR = a − 2bQ: same intercept, twice as steep. MR cannot be parallel to demand.",
                    "Draw MR starting at the demand intercept and hitting the quantity axis halfway to demand's intercept.")
    elif err == "quantity_where_d_meets_mc":
        s.set_error(err, ["M", "M_xtick", "MR"], "Q where D = MC is the competitive outcome. A monopolist restricts output to where MR = MC.",
                    "Find Qm at MR = MC, then read Pm from demand; shade the DWL.")
    return s


@graph("monopolistic_competition_lr", "micro/market_structure", "Monopolistic competition: long run", {
    "tangent_at_min_atc": "Demand tangent to ATC at its minimum",
    "lr_profit_shown": "Long-run equilibrium shown with economic profit"})
def moncomp(rng, err=None):
    C = _costs(rng, scale=rng.uniform(0.9, 1.0))
    q0 = C["q_atc"] * rng.uniform(0.55, 0.68)
    if err == "tangent_at_min_atc": q0 = C["q_atc"]
    h = 1e-4; slope = float((C["ATC"](q0 + h) - C["ATC"](q0 - h)) / (2 * h)); p0 = float(C["ATC"](q0))
    if err == "tangent_at_min_atc": slope = -0.7
    D = L(p0 - slope * q0, slope); up = 1.2 if err == "lr_profit_shown" else 0.0
    D = D.shifty(up); MR = L(D.i, 2 * D.m)
    s = Scene("monopolistic_competition_lr", "Monopolistic competition: long-run equilibrium", pick(rng, ["Quantity (Q)", "Q"]), pick(rng, ["Price, cost", "P, C"]))
    s.curve("ATC", "average_total_cost", "ATC", _cpts(C["ATC"]))
    s.curve("MC", "marginal_cost", "MC", _cpts(C["MC"]), color=1)
    s.curve("D", "demand", "D", D.pts(), lpos=0.85, color=3)
    s.curve("MR", "marginal_revenue", "MR", MR.pts(), lpos=0.95, color=2)
    s.point("E", "lr_equilibrium", (q0, float(D.y(q0))), "E", "Q", "P = ATC")
    s.point("minATC", "min_atc", (C["q_atc"], float(C["ATC"](C["q_atc"]))), None, "Q at min ATC", None)
    s.step("Firm picks Q where MR = MC.", "MR", "MC")
    s.step("Long run: entry pushes demand until it is tangent to ATC → P = ATC, zero economic profit.", "E", "D", "ATC")
    s.step("Tangency is on the falling part of ATC → excess capacity (Q < output at min ATC).", "minATC")
    if err == "tangent_at_min_atc":
        s.set_error(err, ["E", "D", "minATC"], "A monopolistically competitive firm faces downward-sloping demand, so the tangency must be on the downward-sloping part of ATC, left of the minimum (excess capacity).",
                    "Draw D tangent to ATC to the left of min ATC.")
    elif err == "lr_profit_shown":
        s.set_error(err, ["D", "E", "ATC"], "Demand lies above ATC, so firms earn economic profit. With free entry, that cannot persist in the long run.",
                    "Shift D (and MR) left until D is just tangent to ATC.")
    return s


def _ext(rng, err, neg):
    D, S = sd_lines(rng); yl, xl = pq(rng)
    e = rng.uniform(1.4, 2.2)
    s = Scene("negative_externality" if neg else "positive_externality", ("Negative" if neg else "Positive") + " externality", xl, yl,
              caption=pick(rng, ["Factory pollution", "Traffic congestion", "Second-hand smoke"]) if neg else pick(rng, ["Vaccinations", "Education", "Research and development"]))
    if neg:
        MSC = S.shifty(e if err != "social_curve_wrong_side" else -e)
        s.curve("D", "demand", "D = MPB = MSB", D.pts(), lpos=0.88)
        s.curve("MPC", "private_cost", "S = MPC", S.pts(), color=1)
        s.curve("MSC", "social_cost", "MSC", MSC.pts(), color=2)
        qm, pm = inter(D, S); qs, ps = inter(D, MSC)
        s.point("Em", "market", (qm, pm), None, "Qm" if err != "q_labels_swapped" else "Qs", "Pm")
        s.point("Es", "social", (qs, ps), None, "Qs" if err != "q_labels_swapped" else "Qm", "Ps")
        if err != "social_curve_wrong_side":
            s.region("DWL", "deadweight_loss", "DWL", [(qs, ps), (qm, float(MSC.y(qm))), (qm, pm)], color=1)
        s.step("Market output Qm where D meets private supply (MPC).", "Em")
        s.step("MSC = MPC + external cost, so it lies above MPC.", "MSC")
        s.step("Socially optimal Qs where D meets MSC: the market overproduces (Qm > Qs).", "Es")
        s.step("DWL triangle between MSC and D from Qs to Qm.", "DWL")
        if err == "social_curve_wrong_side":
            s.set_error(err, ["MSC", "MPC"], "With a negative externality, social cost exceeds private cost, so MSC must lie above MPC, not below.",
                        "Draw MSC above S = MPC by the external cost per unit.")
        elif err == "q_labels_swapped":
            s.set_error(err, ["Em_xtick", "Es_xtick"], "The market quantity is where D meets MPC and the social optimum is where D meets MSC; with a negative externality the market overproduces, so Qm > Qs.",
                        "Swap the Qm and Qs labels.")
    else:
        MSB = D.shifty(e if err != "social_curve_wrong_side" else -e)
        s.curve("MPB", "private_benefit", "D = MPB", D.pts(), lpos=0.88)
        s.curve("MSB", "social_benefit", "MSB", MSB.pts(), lpos=0.85, color=2)
        s.curve("S", "supply", "S = MPC = MSC", S.pts(), color=1)
        qm, pm = inter(D, S); qs, ps = inter(MSB, S)
        s.point("Em", "market", (qm, pm), None, "Qm" if err != "q_labels_swapped" else "Qs", "Pm")
        s.point("Es", "social", (qs, ps), None, "Qs" if err != "q_labels_swapped" else "Qm", "Ps")
        if err != "social_curve_wrong_side":
            s.region("DWL", "deadweight_loss", "DWL", [(qm, float(MSB.y(qm))), (qm, pm), (qs, ps)], color=1)
        s.step("Market output Qm where private demand (MPB) meets supply.", "Em")
        s.step("MSB = MPB + external benefit, so it lies above MPB.", "MSB")
        s.step("Social optimum Qs where MSB meets S: the market underproduces (Qm < Qs).", "Es")
        s.step("DWL triangle between MSB and S from Qm to Qs.", "DWL")
        if err == "social_curve_wrong_side":
            s.set_error(err, ["MSB", "MPB"], "With a positive externality, social benefit exceeds private benefit, so MSB must lie above MPB.", "Draw MSB above D = MPB.")
        elif err == "q_labels_swapped":
            s.set_error(err, ["Em_xtick", "Es_xtick"], "With a positive externality the market underproduces: Qm (D meets S) is less than Qs (MSB meets S). The labels are reversed.", "Swap the Qm and Qs labels.")
    return s


@graph("negative_externality", "micro/market_failure", "Negative externality", {
    "social_curve_wrong_side": "MSC drawn below MPC", "q_labels_swapped": "Market and social quantities swapped"})
def neg_ext(rng, err=None):
    return _ext(rng, err, True)


@graph("positive_externality", "micro/market_failure", "Positive externality", {
    "social_curve_wrong_side": "MSB drawn below MPB", "q_labels_swapped": "Market and social quantities swapped"})
def pos_ext(rng, err=None):
    return _ext(rng, err, False)


@graph("minimum_wage", "micro/factor_markets", "Labor market with minimum wage", {
    "min_wage_below_equilibrium": "Minimum wage below W* shown as causing unemployment",
    "unemployment_measured_wrong": "Unemployment measured from L* instead of Ld to Ls"})
def min_wage(rng, err=None):
    D, S = sd_lines(rng)
    s = Scene("minimum_wage", "Labor market: minimum wage", pick(rng, ["Quantity of labor (L)", "Labor (L)"]), pick(rng, ["Wage (W)", "Wage rate"]))
    q, p = inter(D, S)
    w = p + rng.uniform(1.3, 2.0) if err != "min_wage_below_equilibrium" else p - rng.uniform(1.3, 2.0)
    s.curve("LD", "labor_demand", "D_L = MRP", D.pts(), lpos=0.86); s.curve("LS", "labor_supply", "S_L", S.pts(), color=1)
    s.curve("Wmin", "minimum_wage", "Minimum wage", hline(w, 0, 9.4), lpos=0.62, color=3)
    s.point("E", "equilibrium", (q, p), None, "L*", "W*")
    ld, ls = float(D.x(w)), float(S.x(w))
    s.point("A", "labor_demanded", (ld, w), None, "Ld", None); s.point("B", "labor_supplied", (ls, w), None, "Ls", None)
    lo, hi = sorted([ld, ls])
    if err == "unemployment_measured_wrong": lo, hi = q, ls
    s.arrow("unemp", "unemployment", (lo, w + 0.45), (hi, w + 0.45), "Unemployment")
    s.step("Equilibrium wage W* and employment L*.", "E")
    s.step("A binding minimum wage is set above W*.", "Wmin")
    s.step("Firms hire only Ld; Ls workers want jobs → unemployment = Ls − Ld.", "unemp", "A_xtick", "B_xtick")
    if err == "min_wage_below_equilibrium":
        s.set_error(err, ["Wmin", "unemp"], "A minimum wage below the equilibrium wage is non-binding; the market wage stays at W* and there is no unemployment from it.",
                    "Draw a binding minimum wage above W*.")
    elif err == "unemployment_measured_wrong":
        s.set_error(err, ["unemp", "A_xtick"], "Unemployment is the gap between labor supplied and labor demanded at the minimum wage (Ls − Ld), not Ls − L*.",
                    "Measure the gap from Ld to Ls.")
    return s


@graph("monopsony", "micro/factor_markets", "Monopsony labor market", {
    "wage_read_from_mfc": "Wage read off MFC instead of supply",
    "mfc_below_supply": "MFC drawn below the labor supply curve"})
def monopsony(rng, err=None):
    S = L(rng.uniform(0.8, 1.6), rng.uniform(0.55, 0.75)); MFC = L(S.i, 2 * S.m) if err != "mfc_below_supply" else L(S.i, 0.5 * S.m)
    MRP = L(rng.uniform(8.6, 9.5), -rng.uniform(0.75, 1.0))
    s = Scene("monopsony", "Monopsony", pick(rng, ["Quantity of labor (L)", "Labor (L)"]), pick(rng, ["Wage (W)", "Wage rate"]))
    s.curve("S", "labor_supply", "S = AFC", S.pts(), color=1); s.curve("MFC", "marginal_factor_cost", "MFC", MFC.pts(), lpos=0.9, color=2)
    s.curve("MRP", "labor_demand", "MRP = D", MRP.pts(), lpos=0.88)
    lm, wm_mfc = inter(MRP, MFC); wm = float(S.y(lm)); lc, wc = inter(MRP, S)
    s.point("X", "mrp_eq_mfc", (lm, wm_mfc), None, None, None, guides=False)
    s.point("W", "monopsony_wage", (lm, wm if err != "wage_read_from_mfc" else wm_mfc), None, "Lm", "Wm")
    s.point("C", "competitive", (lc, wc), None, "Lc", "Wc")
    s.step("MFC lies above supply (to hire one more worker, pay everyone more).", "MFC", "S")
    s.step("Hire Lm where MRP = MFC.", "X", "W_xtick")
    s.step("Pay the wage on the supply curve at Lm: Wm < Wc, Lm < Lc.", "W", "W_ytick")
    if err == "wage_read_from_mfc":
        s.set_error(err, ["W", "W_ytick", "S"], "The monopsonist pays the lowest wage workers will accept for Lm, which is on the supply curve, not the MFC = MRP point.",
                    "Drop from the MRP = MFC point down to S and read Wm there.")
    elif err == "mfc_below_supply":
        s.set_error(err, ["MFC", "S"], "Marginal factor cost exceeds the wage for a monopsonist (raising the wage applies to all workers), so MFC lies above S and is steeper.",
                    "Draw MFC above S with the same intercept and twice the slope.")
    return s


@graph("short_run_production", "micro/producer", "Marginal and average product", {
    "mp_misses_ap_max": "MP does not cross AP at its maximum",
    "mp_ap_labels_swapped": "MP and AP labels swapped"})
def sr_prod(rng, err=None):
    a = rng.uniform(1.6, 2.0); b = a / rng.uniform(8.5, 10.5) * 1.0
    AP = lambda l: a * l - b * l ** 2; MP = lambda l: 2 * a * l - 3 * b * l ** 2
    k = 9.0 / max(MP(np.linspace(0, 10, 400)).max(), 1e-6) * 0.9
    APs, MPs = (lambda l: k * AP(l)), (lambda l: k * MP(l))
    s = Scene("short_run_production", "Marginal and average product of labor", "Labor (L)", pick(rng, ["Output per worker", "MP, AP"]))
    mpf = MPs if err != "mp_misses_ap_max" else (lambda l: MPs(l - 0.9))
    s.curve("MP", "marginal_product", "MP" if err != "mp_ap_labels_swapped" else "AP", _cpts(mpf, 0.05 if err != "mp_misses_ap_max" else 0.95, 9.8), lpos=0.9, color=1)
    s.curve("AP", "average_product", "AP" if err != "mp_ap_labels_swapped" else "MP", _cpts(APs, 0.05, 9.8), lpos=0.7)
    la = a / (2 * b)
    s.point("maxAP", "max_ap", (la, float(APs(la))), None, guides=False)
    s.step("MP rises, then falls (diminishing marginal returns).", "MP")
    s.step("MP crosses AP at AP's maximum.", "maxAP")
    if err == "mp_misses_ap_max":
        s.set_error(err, ["MP", "maxAP"], "When MP > AP, AP rises; when MP < AP, AP falls. So MP must cross AP exactly at AP's peak.", "Redraw MP through the top of AP.")
    elif err == "mp_ap_labels_swapped":
        s.set_error(err, ["MP", "AP"], "The curve that peaks earlier and falls faster (eventually below zero) is MP; the flatter one it crosses at the peak is AP. Labels are reversed.", "Swap the MP and AP labels.")
    return s


@graph("lorenz_curve", "micro/distribution", "Lorenz curve and Gini coefficient", {
    "lorenz_above_equality": "Lorenz curve drawn above the line of equality",
    "gini_area_mislabeled": "Area under the Lorenz curve labeled as the inequality area"})
def lorenz(rng, err=None):
    k = rng.uniform(1.8, 3.2)
    s = Scene("lorenz_curve", "Lorenz curve", "Cumulative % of population", "Cumulative % of income")
    s.curve("equality", "line_of_equality", "Line of equality", lin(0, 0, 9.5, 9.5), lpos=0.6, above=True)
    f = (lambda x: 9.5 * (x / 9.5) ** k) if err != "lorenz_above_equality" else (lambda x: 9.5 * (x / 9.5) ** (1 / k))
    pts = fn(f, 0, 9.5, 100)
    s.curve("lorenz", "lorenz_curve", "Lorenz curve", pts, lpos=0.93, color=1)
    xs = np.linspace(0, 9.5, 60)
    if err == "gini_area_mislabeled":
        s.region("A", "inequality_area", "A (inequality)", np.vstack([np.column_stack([xs, f(xs)]), [(9.5, 0)]]), color=1)
    elif err != "lorenz_above_equality":
        s.region("A", "inequality_area", "A", np.vstack([np.column_stack([xs, xs]), np.column_stack([xs[::-1], f(xs[::-1])])]), color=1)
    s.step("The 45° line is perfect equality.", "equality")
    s.step("The Lorenz curve sags below it: the bottom x% of people earn less than x% of income.", "lorenz")
    s.step("Gini = A / (A + B), where A is the gap between the two curves.", "A")
    if err == "lorenz_above_equality":
        s.set_error(err, ["lorenz", "equality"], "A Lorenz curve can never lie above the line of equality: the poorest x% cannot earn more than x% of income.", "Draw the Lorenz curve bowed below the 45° line.")
    elif err == "gini_area_mislabeled":
        s.set_error(err, ["A", "lorenz"], "The area under the Lorenz curve is B. The inequality area A is between the line of equality and the Lorenz curve.", "Shade the gap between the two curves as A.")
    return s


@graph("laffer_curve", "micro/public_finance", "Laffer curve", {
    "revenue_positive_at_100": "Revenue drawn positive at a 100% tax rate",
    "revenue_monotonic": "Revenue drawn rising at every tax rate"})
def laffer(rng, err=None):
    g = rng.uniform(0.7, 1.6); t = np.linspace(0, 1, 120)
    r = t * (1 - t) ** g; r = r / r.max() * rng.uniform(7, 8.8)
    if err == "revenue_positive_at_100": r = r + 6.5 * t ** 3
    if err == "revenue_monotonic": r = 8.5 * (1 - np.exp(-3 * t)) / (1 - np.exp(-3))
    s = Scene("laffer_curve", "Laffer curve", "Tax rate (%)", "Tax revenue")
    s.curve("laffer", "laffer_curve", "Laffer curve", np.column_stack([t * 9.5, r]), lpos=0.75)
    s.text("t0", "tax_rate_0", (0.1, -0.6), "0%"); s.text("t100", "tax_rate_100", (9.5, -0.6), "100%")
    i = int(np.argmax(r)); s.point("peak", "revenue_max", (t[i] * 9.5, r[i]), None, "t*", None)
    s.step("Zero revenue at 0% (no tax) and at 100% (no incentive to earn taxable income).", "t0", "t100")
    s.step("Revenue peaks at t*; above t*, cutting rates raises revenue.", "peak")
    if err == "revenue_positive_at_100":
        s.set_error(err, ["laffer", "t100"], "At a 100% tax rate there is no incentive to earn taxable income, so revenue falls to zero.", "Bring the curve back down to zero at 100%.")
    elif err == "revenue_monotonic":
        s.set_error(err, ["laffer", "peak"], "This curve keeps rising. The Laffer curve rises, peaks at some rate t*, then falls to zero at 100%.", "Draw an inverted U from 0% to 100%.")
    return s
