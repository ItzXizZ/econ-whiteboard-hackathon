import numpy as np
from .common import graph, L, inter, vline, hline, curve_inter, pick
from .scene import Scene, lin, fn

PL = [("Price level (PL)", "Real GDP (Y)"), ("PL", "Real GDP"), ("Price level", "Real output (Y)")]


def _adas(rng):
    AD = L(rng.uniform(8.2, 9.4), -rng.uniform(0.7, 1.0)); SR = L(rng.uniform(0.8, 1.8), rng.uniform(0.55, 0.85))
    return AD, SR


@graph("ad_as_long_run", "macro/ad_as", "AD-AS long-run equilibrium", {
    "lras_sloped": "LRAS drawn upward-sloping",
    "ad_upward": "AD drawn upward-sloping",
    "equilibrium_off_lras": "Long-run equilibrium not on LRAS"})
def adas_lr(rng, err=None):
    AD, SR = _adas(rng); yl, xl = pick(rng, PL)
    y, p = inter(AD, SR)
    s = Scene("ad_as_long_run", "Long-run macroeconomic equilibrium", xl, yl)
    yf = y if err != "equilibrium_off_lras" else y + rng.uniform(1.3, 2.0)
    s.curve("LRAS", "lras", "LRAS", vline(yf, 0, 9.3) if err != "lras_sloped" else L(p - 2.5 * yf, 2.5).pts(), lpos=0.97, color=3)
    s.curve("AD", "aggregate_demand", "AD", AD.pts() if err != "ad_upward" else L(p - 1.4 * y, 1.4).pts())
    s.curve("SRAS", "sras", "SRAS", SR.pts(), color=1)
    s.point("E", "equilibrium", (y, p), "E", "Yf" if err != "equilibrium_off_lras" else "Y₁", "PL*")
    if err == "equilibrium_off_lras": s.point("YF", "full_employment", (yf, 0.0), None, "Yf", None, guides=False)
    s.step("AD slopes down (wealth, interest-rate, exchange-rate effects).", "AD")
    s.step("SRAS slopes up (sticky wages/prices).", "SRAS")
    s.step("LRAS is vertical at full-employment output Yf.", "LRAS")
    s.step("Long-run equilibrium: AD, SRAS and LRAS meet at one point.", "E")
    if err == "lras_sloped":
        s.set_error(err, ["LRAS"], "In the long run output is set by resources and technology, not the price level, so LRAS is vertical at Yf.", "Draw LRAS as a vertical line at Yf.")
    elif err == "ad_upward":
        s.set_error(err, ["AD"], "Aggregate demand slopes downward: a higher price level lowers real wealth, raises interest rates and makes exports less competitive.", "Redraw AD downward-sloping.")
    elif err == "equilibrium_off_lras":
        s.set_error(err, ["E", "LRAS", "YF_xtick"], "AD and SRAS meet left of LRAS, so output is below Yf: that is a recessionary gap, not long-run equilibrium.", "Either label it a recessionary gap or draw LRAS through the AD-SRAS intersection.")
    return s


REC = ["Consumer confidence falls", "Business investment drops sharply", "Government cuts spending", "Exports collapse in a global slowdown"]
INF = ["Government increases spending", "A tax cut boosts consumption", "An export boom", "Stock market surge raises household wealth"]


@graph("ad_as_output_gap", "macro/ad_as", "AD shift and output gap", {
    "gap_mislabeled": "Recessionary/inflationary gap mislabeled",
    "ad_shift_wrong_direction": "AD shifted the wrong way for the scenario"})
def adas_gap(rng, err=None):
    AD, SR = _adas(rng); yl, xl = pick(rng, PL)
    rec = bool(rng.random() < 0.5); cap = pick(rng, REC if rec else INF)
    yf, p = inter(AD, SR)
    dx = rng.uniform(1.4, 2.0) * (-1 if rec else 1)
    if err == "ad_shift_wrong_direction": dx = -dx
    AD2 = AD.shiftx(dx); y2, p2 = inter(AD2, SR)
    s = Scene("ad_as_output_gap", "AD shock", xl, yl, caption=cap)
    s.curve("LRAS", "lras", "LRAS", vline(yf, 0, 9.3), lpos=0.97, color=3)
    s.curve("SRAS", "sras", "SRAS", SR.pts(), color=1)
    s.curve("AD1", "aggregate_demand", "AD₁", AD.pts()); s.curve("AD2", "aggregate_demand", "AD₂", AD2.pts(), color=2)
    s.point("E1", "equilibrium", (yf, p), "E₁", "Yf", "PL₁"); s.point("E2", "equilibrium", (y2, p2), "E₂", "Y₂", "PL₂")
    actual_rec = y2 < yf
    word = "Recessionary gap" if actual_rec else "Inflationary gap"
    if err == "gap_mislabeled": word = "Inflationary gap" if actual_rec else "Recessionary gap"
    lo, hi = sorted([yf, y2])
    s.arrow("gap", "output_gap", (lo, 0.6), (hi, 0.6), word)
    s.step("Start in long-run equilibrium E₁ at Yf.", "E1", "LRAS")
    s.step(f"'{cap}' shifts AD {'left' if rec else 'right'}.", "AD2")
    s.step(f"Short run: output {'falls below' if rec else 'rises above'} Yf → {'recessionary' if rec else 'inflationary'} gap.", "E2", "gap")
    if err == "gap_mislabeled":
        s.set_error(err, ["gap", "E2"], f"Output Y₂ is {'below' if actual_rec else 'above'} full employment, which is a {'recessionary' if actual_rec else 'inflationary'} gap.",
                    f"Relabel it '{'Recessionary' if actual_rec else 'Inflationary'} gap'.")
    elif err == "ad_shift_wrong_direction":
        s.set_error(err, ["AD2"], f"'{cap}' {'reduces' if rec else 'increases'} aggregate demand, so AD should shift {'left' if rec else 'right'}.",
                    f"Draw AD₂ to the {'left' if rec else 'right'} of AD₁.")
    return s


@graph("supply_shock", "macro/ad_as", "Aggregate supply shock", {
    "sras_shift_wrong_direction": "SRAS shifted the wrong way",
    "called_demand_pull": "Cost-push inflation labeled demand-pull"})
def supply_shock(rng, err=None):
    AD, SR = _adas(rng); yl, xl = pick(rng, PL)
    neg = bool(rng.random() < 0.6) or err == "called_demand_pull"
    cap = pick(rng, ["Oil prices spike", "Nominal wages rise sharply", "A drought cuts farm output"]) if neg else pick(rng, ["Productivity surges with new technology", "Oil prices collapse"])
    dx = rng.uniform(1.4, 2.0) * (-1 if neg else 1)
    if err == "sras_shift_wrong_direction": dx = -dx
    SR2 = SR.shiftx(dx); y1, p1 = inter(AD, SR); y2, p2 = inter(AD, SR2)
    s = Scene("supply_shock", "Supply shock", xl, yl, caption=cap)
    s.curve("AD", "aggregate_demand", "AD", AD.pts()); s.curve("SRAS1", "sras", "SRAS₁", SR.pts(), color=1); s.curve("SRAS2", "sras", "SRAS₂", SR2.pts(), color=2)
    s.point("E1", "equilibrium", (y1, p1), "E₁", "Y₁", "PL₁"); s.point("E2", "equilibrium", (y2, p2), "E₂", "Y₂", "PL₂")
    if neg:
        s.text("label", "claim", (7.0, 9.2), "Stagflation (cost-push inflation)" if err != "called_demand_pull" else "Demand-pull inflation")
    s.step(f"'{cap}' {'raises' if neg else 'lowers'} production costs → SRAS shifts {'left' if neg else 'right'}.", "SRAS2")
    s.step(f"Price level {'rises' if neg else 'falls'} and real GDP {'falls' if neg else 'rises'}.", "E2")
    if err == "sras_shift_wrong_direction":
        s.set_error(err, ["SRAS2"], f"'{cap}' {'raises' if neg else 'lowers'} costs of production, so SRAS should shift {'left' if neg else 'right'}.", f"Draw SRAS₂ to the {'left' if neg else 'right'}.")
    elif err == "called_demand_pull":
        s.set_error(err, ["label", "SRAS2"], "Inflation caused by a leftward SRAS shift is cost-push inflation (with lower output: stagflation). Demand-pull inflation comes from AD shifting right.", "Relabel it cost-push inflation / stagflation.")
    return s


@graph("phillips_curve", "macro/inflation_unemployment", "Phillips curve", {
    "srpc_upward": "SRPC drawn upward-sloping",
    "lrpc_not_at_natural_rate": "LRPC not at the natural rate of unemployment",
    "axes_swapped_phillips": "Unemployment on the vertical axis"})
def phillips(rng, err=None):
    un = rng.uniform(4, 6); pi = rng.uniform(3.5, 5.5); k = rng.uniform(6, 10)
    f = lambda u: pi + k / u - k / un if err != "srpc_upward" else pi + 0.9 * (u - un)
    s = Scene("phillips_curve", "Short-run and long-run Phillips curves", "Unemployment rate (%)", "Inflation rate (%)")
    if err == "axes_swapped_phillips": s.xlabel, s.ylabel = s.ylabel, s.xlabel
    pts = fn(f, 0.8, 9.6, 200); pts = pts[(pts[:, 1] > 0.2) & (pts[:, 1] < 9.6)]
    s.curve("SRPC", "srpc", "SRPC", pts, lpos=0.95, color=1)
    xl = un if err != "lrpc_not_at_natural_rate" else un + rng.uniform(1.5, 2.2)
    s.curve("LRPC", "lrpc", "LRPC", vline(xl, 0, 9.3), lpos=0.97, color=3)
    s.point("A", "equilibrium", (un, pi), "A", "uₙ (natural rate)", "π")
    s.step("SRPC slopes down: short-run tradeoff between inflation and unemployment.", "SRPC")
    s.step("LRPC is vertical at the natural rate of unemployment uₙ.", "LRPC", "A_xtick")
    s.step("Long-run equilibrium at A where SRPC meets LRPC.", "A")
    if err == "srpc_upward":
        s.set_error(err, ["SRPC"], "The short-run Phillips curve slopes downward: lower unemployment comes with higher inflation in the short run.", "Redraw SRPC downward-sloping.")
    elif err == "lrpc_not_at_natural_rate":
        s.set_error(err, ["LRPC", "A_xtick", "A"], "The LRPC must be vertical at the natural rate uₙ; here it sits at a different unemployment rate, so the long-run point A is off the LRPC.", "Move LRPC to uₙ.")
    elif err == "axes_swapped_phillips":
        s.set_error(err, ["x_axis", "y_axis"], "The Phillips curve puts the inflation rate on the vertical axis and the unemployment rate on the horizontal axis.", "Swap the axis labels.")
    return s


def _mkt(rng, err, kind):
    D = L(rng.uniform(8.2, 9.4), -rng.uniform(0.7, 1.0)); S = L(rng.uniform(0.8, 1.8), rng.uniform(0.55, 0.85))
    if kind == "money_market":
        expand = bool(rng.random() < 0.5)
        cap = pick(rng, ["The central bank buys government bonds", "The central bank lowers the reserve requirement"]) if expand else pick(rng, ["The central bank sells government bonds", "The central bank raises the reserve requirement"])
        s = Scene(kind, "Money market", "Quantity of money (M)", "Nominal interest rate (i)" if err != "axis_real_rate" else "Real interest rate (r)", caption=cap)
        m1 = rng.uniform(4, 5.5); dx = rng.uniform(1.4, 2.0) * (1 if expand else -1)
        if err == "ms_shift_wrong_direction": dx = -dx
        s.curve("MD", "money_demand", "MD", D.pts())
        s.curve("MS1", "money_supply", "MS₁", vline(m1, 0, 9.3) if err != "ms_upward" else L(float(D.y(m1)) - 0.8 * m1, 0.8).pts(), lpos=0.97, color=1)
        s.curve("MS2", "money_supply", "MS₂", vline(m1 + dx, 0, 9.3) if err != "ms_upward" else L(float(D.y(m1)) - 0.8 * (m1 + dx), 0.8).pts(), lpos=0.97, color=2)
        if err != "ms_upward":
            s.point("E1", "equilibrium", (m1, float(D.y(m1))), "E₁", "M₁", "i₁"); s.point("E2", "equilibrium", (m1 + dx, float(D.y(m1 + dx))), "E₂", "M₂", "i₂")
        s.step("Money demand slopes down: higher i raises the opportunity cost of holding money.", "MD")
        s.step("Money supply is vertical: set by the central bank, independent of i.", "MS1")
        s.step(f"'{cap}' shifts MS {'right' if expand else 'left'} → nominal interest rate {'falls' if expand else 'rises'}.", "MS2", "E2")
        if err == "ms_upward":
            s.set_error(err, ["MS1", "MS2"], "The money supply is set by the central bank and does not respond to the interest rate, so MS is vertical.", "Draw MS as vertical lines.")
        elif err == "ms_shift_wrong_direction":
            s.set_error(err, ["MS2"], f"'{cap}' {'increases' if expand else 'decreases'} the money supply, so MS shifts {'right' if expand else 'left'} and i {'falls' if expand else 'rises'}.", f"Move MS₂ to the {'right' if expand else 'left'}.")
        elif err == "axis_real_rate":
            s.set_error(err, ["y_axis"], "The money market graph uses the nominal interest rate (the opportunity cost of holding money); the real rate belongs on the loanable funds graph.", "Label the vertical axis 'Nominal interest rate (i)'.", severity="minor")
        return s
    if kind == "loanable_funds":
        deficit = bool(rng.random() < 0.5)
        cap = "Government runs a larger budget deficit" if deficit else "Households save a larger share of income"
        s = Scene(kind, "Loanable funds market", "Quantity of loanable funds", "Real interest rate (r)", caption=cap)
        s.curve("S1" if not deficit else "S", "supply_lf", "S_LF₁" if not deficit else "S_LF", S.pts(), color=1)
        s.curve("D1" if deficit else "D", "demand_lf", "D_LF₁" if deficit else "D_LF", D.pts())
        q1, r1 = inter(D, S); s.point("E1", "equilibrium", (q1, r1), "E₁", "Q₁", "r₁")
        dx = rng.uniform(1.4, 2.0) * (1 if err != "lf_wrong_direction" else -1)
        if err == "lf_wrong_curve": deficit_draw = not deficit
        else: deficit_draw = deficit
        if deficit_draw:
            if not s.has("D1"): s.get("D")["id"] = "D1"; s.get("D1")["label"] = "D_LF₁"
            new = D.shiftx(dx); s.curve("D2", "demand_lf", "D_LF₂", new.pts(), color=2); q2, r2 = inter(new, S)
        else:
            if not s.has("S1"): s.get("S")["id"] = "S1"; s.get("S1")["label"] = "S_LF₁"
            new = S.shiftx(dx); s.curve("S2", "supply_lf", "S_LF₂", new.pts(), color=2); q2, r2 = inter(D, new)
        s.point("E2", "equilibrium", (q2, r2), "E₂", "Q₂", "r₂")
        moved = "D2" if deficit_draw else "S2"
        s.step("Supply of loanable funds = saving; demand = borrowing for investment (and government deficits).", "S1" if s.has("S1") else "S", "D1" if s.has("D1") else "D")
        s.step(("Government borrowing increases demand for loanable funds → r rises (crowding out)." if deficit else "More saving increases supply of loanable funds → r falls."), moved, "E2")
        if err == "lf_wrong_direction":
            s.set_error(err, [moved], ("More government borrowing increases demand for loanable funds, shifting D right." if deficit else "More saving increases the supply of loanable funds, shifting S right."), "Shift the curve to the right.")
        elif err == "lf_wrong_curve":
            s.set_error(err, [moved], ("A deficit means more government borrowing: the demand curve shifts, not supply." if deficit else "Higher household saving shifts the supply of loanable funds, not demand."), "Shift the other curve instead.")
        return s
    # foreign exchange
    pairs = [("€", "$"), ("¥", "$"), ("£", "$"), ("$", "€")]
    c, h = pick(rng, pairs)
    up = bool(rng.random() < 0.5)
    cap = (f"Demand for {c}-area exports rises" if up else f"Interest rates in the {c} area fall relative to abroad")
    s = Scene(kind, f"Foreign exchange market for {c}", f"Quantity of {c}", f"{h} per {c}", caption=cap)
    s.curve("D1", "currency_demand", f"D{c}₁", D.pts()); s.curve("S", "currency_supply", f"S{c}", S.pts(), color=1)
    q1, p1 = inter(D, S); s.point("E1", "equilibrium", (q1, p1), "E₁", "Q₁", "e₁")
    dx = rng.uniform(1.4, 2.0) * (1 if up else -1) * (-1 if err == "fx_wrong_direction" else 1)
    D2 = D.shiftx(dx); q2, p2 = inter(D2, S); s.curve("D2", "currency_demand", f"D{c}₂", D2.pts(), color=2)
    s.point("E2", "equilibrium", (q2, p2), "E₂", "Q₂", "e₂")
    word = "appreciates" if p2 > p1 else "depreciates"
    if err == "fx_label_wrong": word = "depreciates" if p2 > p1 else "appreciates"
    s.text("claim", "claim", (6.8, 9.2), f"The {c} {word}")
    s.step(f"'{cap}' {'raises' if up else 'lowers'} demand for {c}.", "D2")
    s.step(f"Price of {c} ({h} per {c}) {'rises → appreciation' if up else 'falls → depreciation'}.", "E2", "claim")
    if err == "fx_wrong_direction":
        s.set_error(err, ["D2"], f"'{cap}' {'increases' if up else 'decreases'} demand for {c}, so the demand curve should shift {'right' if up else 'left'}.", f"Shift D{c} {'right' if up else 'left'}.")
    elif err == "fx_label_wrong":
        s.set_error(err, ["claim", "E2_ytick"], f"The price of {c} in {h} {'rose' if p2 > p1 else 'fell'}, so the {c} {'appreciated' if p2 > p1 else 'depreciated'}.", "Fix the appreciation/depreciation label.")
    return s


@graph("money_market", "macro/money", "Money market", {
    "ms_upward": "Money supply drawn upward-sloping",
    "ms_shift_wrong_direction": "MS shifted the wrong way for the policy",
    "axis_real_rate": "Money market vertical axis labeled real interest rate"})
def money_market(rng, err=None):
    return _mkt(rng, err, "money_market")


@graph("loanable_funds", "macro/money", "Loanable funds market", {
    "lf_wrong_direction": "Loanable funds curve shifted the wrong way",
    "lf_wrong_curve": "Wrong loanable-funds curve shifted"})
def loanable_funds(rng, err=None):
    return _mkt(rng, err, "loanable_funds")


@graph("fx_market", "macro/open_economy", "Foreign exchange market", {
    "fx_wrong_direction": "Currency demand shifted the wrong way",
    "fx_label_wrong": "Appreciation/depreciation mislabeled"})
def fx_market(rng, err=None):
    return _mkt(rng, err, "fx_market")


@graph("is_lm", "macro/is_lm", "IS-LM model", {
    "is_lm_labels_swapped": "IS and LM labels swapped",
    "policy_wrong_curve": "Fiscal policy shown shifting LM (or monetary shifting IS)"})
def is_lm(rng, err=None):
    IS = L(rng.uniform(8.2, 9.4), -rng.uniform(0.7, 1.0)); LM = L(rng.uniform(0.8, 1.8), rng.uniform(0.55, 0.85))
    fiscal = bool(rng.random() < 0.5)
    cap = "Expansionary fiscal policy (government spending rises)" if fiscal else "Expansionary monetary policy (money supply rises)"
    s = Scene("is_lm", "IS-LM", pick(rng, ["Output (Y)", "Real GDP (Y)"]), pick(rng, ["Interest rate (i)", "i"]), caption=cap)
    s.curve("IS1", "is", "IS₁" if err != "is_lm_labels_swapped" else "LM₁", IS.pts())
    s.curve("LM1", "lm", "LM₁" if err != "is_lm_labels_swapped" else "IS₁", LM.pts(), color=1)
    y1, i1 = inter(IS, LM); s.point("E1", "equilibrium", (y1, i1), "E₁", "Y₁", "i₁")
    dx = rng.uniform(1.4, 1.9)
    shift_is = fiscal if err != "policy_wrong_curve" else not fiscal
    if shift_is:
        n = IS.shiftx(dx); s.curve("IS2", "is", "IS₂" if err != "is_lm_labels_swapped" else "LM₂", n.pts(), color=2); y2, i2 = inter(n, LM)
    else:
        n = LM.shiftx(dx); s.curve("LM2", "lm", "LM₂" if err != "is_lm_labels_swapped" else "IS₂", n.pts(), color=2); y2, i2 = inter(IS, n)
    s.point("E2", "equilibrium", (y2, i2), "E₂", "Y₂", "i₂")
    moved = "IS2" if shift_is else "LM2"
    s.step("IS slopes down (goods market); LM slopes up (money market).", "IS1", "LM1")
    s.step(("Fiscal expansion shifts IS right: Y and i both rise." if fiscal else "Monetary expansion shifts LM right/down: Y rises, i falls."), moved, "E2")
    if err == "is_lm_labels_swapped":
        s.set_error(err, ["IS1", "LM1", moved], "IS (goods market equilibrium) slopes downward and LM (money market equilibrium) slopes upward; the labels are reversed.", "Swap IS and LM labels.")
    elif err == "policy_wrong_curve":
        s.set_error(err, [moved], ("Government spending is a goods-market change: it shifts IS, not LM." if fiscal else "A money supply increase shifts LM, not IS."), f"Shift {'IS' if fiscal else 'LM'} instead.")
    return s


@graph("keynesian_cross", "macro/aggregate_expenditure", "Keynesian cross", {
    "ae_slope_above_one": "AE line steeper than the 45° line",
    "equilibrium_off_45": "Equilibrium not on the 45° line"})
def kcross(rng, err=None):
    mpc = rng.uniform(0.55, 0.72); A = rng.uniform(2.2, 3.2)
    while A / (1 - mpc) > 7.4: A *= 0.9
    if err == "ae_slope_above_one": mpc = rng.uniform(1.2, 1.4); A = rng.uniform(0.3, 0.8) * -1 + 0.2
    AE = L(A, mpc)
    s = Scene("keynesian_cross", "Keynesian cross", pick(rng, ["Real GDP (Y)", "Income, output (Y)"]), pick(rng, ["Aggregate expenditure (AE)", "AE"]))
    s.curve("45", "45_degree", "45° line (AE = Y)", lin(0, 0, 9.4, 9.4), lpos=0.6)
    s.curve("AE", "aggregate_expenditure", "AE = C + I + G + NX", AE.pts(), lpos=0.85, color=1)
    if err == "ae_slope_above_one":
        s.set_error(err, ["AE", "45"], "AE has slope equal to the MPC, which is between 0 and 1, so AE must be flatter than the 45° line and cross it from above.", "Draw AE with a positive intercept and slope < 1.")
        return s
    y = A / (1 - mpc)
    s.point("E", "equilibrium", (y, y) if err != "equilibrium_off_45" else (y - 1.6, float(AE.y(y - 1.6))), "E", "Y*", None)
    s.step("45° line: every point where spending equals output.", "45")
    s.step("AE has intercept autonomous spending and slope MPC < 1.", "AE")
    s.step("Equilibrium where AE crosses the 45° line: planned spending = output.", "E")
    if err == "equilibrium_off_45":
        s.set_error(err, ["E", "45"], "E is on the AE line but not on the 45° line, so planned spending exceeds output there and inventories fall; output will rise.", "Move E to where AE crosses the 45° line.")
    return s


@graph("solow_growth", "macro/growth", "Solow growth model", {
    "steady_state_off_intersection": "Steady state not where sf(k) = (n+δ)k",
    "output_investment_swapped": "Investment curve drawn above output"})
def solow(rng, err=None):
    al = rng.uniform(0.33, 0.45); A = rng.uniform(2.3, 2.8); sv = rng.uniform(0.3, 0.45)
    kstar = rng.uniform(5, 7); dlt = sv * A * kstar ** (al - 1)
    f = lambda k: A * k ** al
    s = Scene("solow_growth", "Solow model steady state", "Capital per worker (k)", "Output, investment per worker")
    s.curve("f", "output", "f(k)" if err != "output_investment_swapped" else "sf(k)", fn(f, 0, 9.6, 150), lpos=0.95)
    s.curve("sf", "investment", "sf(k)" if err != "output_investment_swapped" else "f(k)", fn(lambda k: sv * f(k), 0, 9.6, 150), lpos=0.95, color=1)
    s.curve("dep", "break_even", "(n + δ)k", fn(lambda k: dlt * k, 0, 9.6, 2), lpos=0.95, color=2)
    k = kstar if err != "steady_state_off_intersection" else kstar - rng.uniform(1.5, 2.2)
    s.point("SS", "steady_state", (k, float(sv * f(k))), "Steady state", "k*", None)
    s.step("f(k): output per worker with diminishing returns.", "f")
    s.step("Investment sf(k) is a fraction s of output, so it lies below f(k).", "sf")
    s.step("Break-even investment (n + δ)k is a straight line.", "dep")
    s.step("Steady state k* where sf(k) = (n + δ)k.", "SS")
    if err == "steady_state_off_intersection":
        s.set_error(err, ["SS", "sf", "dep"], "At the marked k, investment exceeds break-even investment, so capital per worker is still growing. Steady state is where sf(k) crosses (n + δ)k.", "Move k* to the intersection.")
    elif err == "output_investment_swapped":
        s.set_error(err, ["f", "sf"], "Investment per worker sf(k) is a fraction (s < 1) of output, so it must lie below f(k); the labels are swapped.", "Label the higher curve f(k) and the lower one sf(k).")
    return s


@graph("business_cycle", "macro/cycles", "Business cycle", {
    "peak_trough_swapped": "Peak and trough labels swapped",
    "phase_labels_swapped": "Expansion and contraction labels swapped"})
def bcycle(rng, err=None):
    s = Scene("business_cycle", "The business cycle", "Time", "Real GDP")
    g = rng.uniform(0.35, 0.5); b = rng.uniform(1.5, 2.5); A = rng.uniform(1.0, 1.5); w = rng.uniform(1.0, 1.3); ph = rng.uniform(0, 1)
    trend = lambda t: b + g * t; f = lambda t: trend(t) + A * np.sin(w * t + ph)
    s.curve("trend", "trend", "Long-run growth trend", fn(trend, 0, 9.4, 2), lpos=0.75, color=3)
    s.curve("cycle", "real_gdp", None, fn(f, 0, 9.4, 300), color=0)
    ts = np.linspace(0.3, 9.1, 3000); y = f(ts); d = np.diff(y)
    pk = [ts[i] for i in range(1, len(d)) if d[i - 1] > 0 >= d[i]]; tr = [ts[i] for i in range(1, len(d)) if d[i - 1] < 0 <= d[i]]
    if not pk or not tr: return bcycle(rng, err)
    tp, tt = pk[0], tr[0]
    s.point("peak", "peak", (tp, float(f(tp))), "Peak" if err != "peak_trough_swapped" else "Trough", guides=False)
    s.point("trough", "trough", (tt, float(f(tt))), "Trough" if err != "peak_trough_swapped" else "Peak", guides=False)
    a, c = sorted([tp, tt])
    mid = (a + c) / 2
    falling = f(a + 0.01) < f(a)
    lab = "Contraction" if falling else "Expansion"
    if err == "phase_labels_swapped": lab = "Expansion" if falling else "Contraction"
    s.text("phase", "phase", (mid, max(float(f(a)), float(f(c))) + 1.0), lab)
    s.step("Real GDP fluctuates around its long-run trend.", "trend", "cycle")
    s.step("Peak: the top of an expansion; trough: the bottom of a contraction.", "peak", "trough")
    s.step("GDP falls from peak to trough (contraction) and rises from trough to peak (expansion).", "phase")
    if err == "peak_trough_swapped":
        s.set_error(err, ["peak", "trough"], "The high point of the cycle is the peak and the low point is the trough; they are labeled backwards.", "Swap the labels.")
    elif err == "phase_labels_swapped":
        s.set_error(err, ["phase"], f"Between these turning points real GDP is {'falling' if falling else 'rising'}, so this phase is a {'contraction' if falling else 'expansion'}.", "Fix the phase label.")
    return s
