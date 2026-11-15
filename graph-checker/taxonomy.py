"""Master list of economics graphs/concepts: axes, elements, correctness rules, common mistakes, whiteboard interactions.
`generator` = graph_type implemented in econgraphs/ (synthetic right/wrong pairs available)."""
import json
from econgraphs import REG

T = []
def g(id, field, topic, name, x, y, elements, rules, mistakes, moves, gen=None, related=()):
    T.append(dict(id=id, field=field, topic=topic, name=name, axes={"x": x, "y": y}, elements=elements, correctness_rules=rules,
                  common_mistakes=mistakes, whiteboard_interactions=moves, generator=gen, related=list(related)))

PQ = ("Quantity (Q)", "Price (P)")
# ------------------------------------------------------------------ MICRO: foundations
g("ppf", "micro", "scarcity & choice", "Production possibilities frontier (concave)", "Good X", "Good Y",
  ["PPF curve", "efficient point on curve", "inefficient point inside", "unattainable point outside"],
  ["Concave (bowed out) when opportunity costs increase", "Points on curve efficient, inside inefficient, outside unattainable", "Slope = opportunity cost of X in Y"],
  ["Bowed-in PPF labeled increasing cost", "Inside point labeled efficient", "Outside point labeled attainable", "Straight PPF labeled increasing cost"],
  ["Drag a point along the PPF to show the opportunity-cost tradeoff", "Drag a point inside → highlight unemployed resources"], "ppf")
g("ppf_linear", "micro", "scarcity & choice", "Linear PPF (constant opportunity cost)", "Good X", "Good Y", ["straight PPF", "intercepts"],
  ["Straight line ⇔ constant opportunity cost", "Slope = −(Ymax/Xmax)"], ["Labeled increasing opportunity cost", "Wrong slope for given intercepts"], ["Drag an intercept to change opportunity cost"], None, ["comparative_advantage"])
g("ppf_shift", "micro", "economic growth", "PPF outward shift / pivot", "Good X", "Good Y", ["PPF1", "PPF2", "shift arrow"],
  ["Growth (more resources, general tech) → outward shift", "Tech specific to one good → pivot along that axis only", "Destruction of resources → inward shift"],
  ["Growth drawn inward", "One-good technology drawn as parallel shift", "Choosing more capital goods today does not shift tomorrow's PPF further out"],
  ["Drag one intercept to pivot", "Animate PPF1 → PPF2"], "ppf_shift")
g("comparative_advantage", "micro", "trade", "Comparative advantage with two PPFs", "Good X", "Good Y", ["PPF country A", "PPF country B", "terms-of-trade line", "consumption points"],
  ["Lower opportunity cost (flatter PPF for X on x-axis) → comparative advantage in X", "Terms of trade lie between the two opportunity costs", "Post-trade consumption can lie outside own PPF"],
  ["Comparative advantage confused with absolute advantage", "Comparative advantage assigned to the higher-cost producer", "Terms of trade outside the range of opportunity costs"],
  ["Rotate the terms-of-trade line between the two slopes", "Highlight each slope as opportunity cost"], "comparative_advantage")
g("circular_flow", "micro", "foundations", "Circular-flow diagram", None, None, ["households", "firms", "product market", "factor market", "real and money flows"],
  ["Money flows opposite to goods/factor flows", "Households sell factors, buy products"], ["Arrow directions reversed", "Factor and product markets swapped"], ["Trace one dollar around the loop"])
# ------------------------------------------------------------------ MICRO: supply & demand
g("demand_curve", "micro", "demand", "Demand curve, change in quantity demanded vs change in demand", *PQ, ["D curve", "movement along", "shift"],
  ["Downward sloping (law of demand)", "Own-price change → movement along curve; other determinants → shift"],
  ["Upward-sloping demand", "Price change drawn as a shift", "Shift direction wrong for determinant"], ["Drag a point along D vs drag D itself"], "demand_shift")
g("supply_curve", "micro", "supply", "Supply curve, change in quantity supplied vs change in supply", *PQ, ["S curve", "movement along", "shift"],
  ["Upward sloping", "Own-price change → movement along; input cost/tech/expectations/number of sellers → shift"],
  ["'Increase in supply' drawn as upward (leftward) shift", "Price change drawn as a shift"], ["Drag S right/left"], "supply_shift")
g("supply_demand_equilibrium", "micro", "markets", "Market equilibrium", *PQ, ["D", "S", "E", "P*", "Q*"],
  ["Equilibrium at intersection", "P on vertical axis, Q on horizontal"], ["Equilibrium off intersection", "Labels swapped", "Axes swapped", "Demand upward"],
  ["Drag price above P* → highlight surplus; below → shortage"], "supply_demand_equilibrium")
g("demand_shift", "micro", "markets", "Shift in demand", *PQ, ["D1", "D2", "S", "E1", "E2", "arrow"],
  ["Normal good + income↑ → right", "Substitute price↑ → right; complement price↑ → left", "Both P and Q move same direction"],
  ["Wrong direction", "Shifting supply for a demand event", "E2 not at new intersection", "Inferior good treated as normal"], ["Drag D; E slides along S"], "demand_shift")
g("supply_shift", "micro", "markets", "Shift in supply", *PQ, ["S1", "S2", "D", "E1", "E2", "arrow"],
  ["Input cost↓ / tech↑ / more sellers → right", "P and Q move opposite directions"], ["Wrong direction", "Shifting demand for a supply event", "E2 misplaced"], ["Drag S; E slides along D"], "supply_shift")
g("double_shift", "micro", "markets", "Simultaneous shifts of demand and supply", *PQ, ["D1", "D2", "S1", "S2", "E1", "E2"],
  ["One of P or Q is indeterminate unless magnitudes known"], ["Claiming both P and Q changes are determinate"], ["Vary shift sizes to show ambiguity"], None, ["demand_shift", "supply_shift"])
g("consumer_producer_surplus", "micro", "welfare", "Consumer and producer surplus", *PQ, ["CS triangle", "PS triangle", "E"],
  ["CS: below D, above P, 0..Q*", "PS: above S, below P, 0..Q*"], ["Regions swapped", "CS drawn as P×Q rectangle", "Surplus extended past Q*"], ["Hover CS/PS to show area formula"], "consumer_producer_surplus")
g("price_ceiling", "micro", "government", "Price ceiling (binding)", *PQ, ["ceiling line", "Qs", "Qd", "shortage", "DWL"],
  ["Binding only below P*", "Shortage = Qd − Qs", "DWL triangle between Qs and Q*"], ["Ceiling above P* shown as binding", "Shortage labeled surplus", "Qs/Qd swapped"], ["Drag ceiling up past P* → shortage disappears"], "price_ceiling")
g("price_floor", "micro", "government", "Price floor (binding)", *PQ, ["floor line", "Qs", "Qd", "surplus", "DWL"],
  ["Binding only above P*", "Surplus = Qs − Qd"], ["Floor below P* shown as binding", "Surplus labeled shortage", "Qs/Qd swapped"], ["Drag floor down past P* → surplus disappears"], "price_floor")
g("per_unit_tax", "micro", "government", "Per-unit (excise) tax: incidence, revenue, DWL", *PQ, ["S", "S+t", "D", "Pc", "Pp", "Qt", "revenue rectangle", "DWL"],
  ["Tax on sellers shifts S up by t", "Pc − Pp = t", "Revenue = t × Qt", "DWL between Qt and Q*", "Burden falls more on the less elastic side"],
  ["Shift down", "DWL right of Q*", "Revenue uses Q*", "Pp at old P*", "Incidence attributed by who writes the check"], ["Drag t; watch revenue and DWL grow", "Toggle elasticity to move incidence"], "per_unit_tax")
g("per_unit_subsidy", "micro", "government", "Per-unit subsidy", *PQ, ["S", "S−s", "D", "Pc", "Pp", "cost rectangle", "DWL"],
  ["Subsidy shifts S down", "DWL from overproduction right of Q*", "Government cost = s × Qs"], ["Shift up", "DWL left of Q*"], ["Drag subsidy size"], "per_unit_subsidy")
g("tax_incidence_elasticity", "micro", "government", "Tax incidence and elasticity", *PQ, ["elastic vs inelastic D or S", "Pc", "Pp"],
  ["More inelastic side bears more of the tax"], ["Burden on elastic side"], ["Rotate D about E"], None, ["per_unit_tax"])
g("quota", "micro", "government", "Production quota", *PQ, ["vertical quota line", "quota rent", "DWL"],
  ["Quota below Q* raises price on D"], ["Price read off S at quota", "Quota above Q* shown as binding"], ["Drag quota line"])
g("elasticity_comparison", "micro", "elasticity", "Elastic vs inelastic demand", *PQ, ["steep D", "flat D", "common point"],
  ["Through a common point, steeper = more inelastic"], ["Labels swapped", "Slope equated with elasticity along a linear curve"], ["Rotate D through A"], "elasticity_comparison")
g("perfect_elasticity", "micro", "elasticity", "Perfectly elastic / perfectly inelastic", *PQ, ["horizontal D", "vertical D"],
  ["Horizontal = perfectly elastic (∞)", "Vertical = perfectly inelastic (0)"], ["Swapped"], ["Toggle"], "perfect_elasticity")
g("elasticity_along_linear_demand", "micro", "elasticity", "Elasticity along a linear demand curve and total revenue", *PQ, ["D", "midpoint (unit elastic)", "elastic/inelastic segments", "TR curve"],
  ["Upper half elastic, lower half inelastic", "TR max at unit-elastic midpoint"], ["Constant elasticity along a straight line", "TR max at the intercept"], ["Slide price; show TR rectangle change"])
g("cross_income_elasticity", "micro", "elasticity", "Normal/inferior goods, substitutes/complements (shifts)", *PQ, ["D1", "D2"], ["Inferior good: income↑ → D left"], ["Inferior treated as normal"], ["Scenario cards → drag D"])
# ------------------------------------------------------------------ MICRO: consumer
g("total_marginal_utility", "micro", "consumer", "Total and marginal utility", "Quantity consumed", "Utility", ["TU curve", "MU curve"],
  ["MU declines (diminishing MU)", "TU max where MU = 0"], ["MU rising", "TU max not where MU = 0"], ["Drag Q; show TU slope = MU"])
g("budget_line_shift", "micro", "consumer", "Budget constraint and shifts", "Good X", "Good Y", ["BL1", "BL2", "intercepts M/Px, M/Py"],
  ["Income change → parallel shift", "One price change → pivot on the other intercept"], ["Income drawn as pivot", "Price drawn as parallel shift", "Pivot on wrong axis"], ["Drag income slider vs price slider"], "budget_line_shift")
g("consumer_optimum", "micro", "consumer", "Indifference curves and consumer optimum", "Good X", "Good Y", ["budget line", "IC1..IC3", "tangency E"],
  ["ICs convex, downward, non-crossing", "Optimum at tangency MRS = Px/Py"], ["Optimum where IC crosses BL", "ICs cross", "Concave ICs", "Optimum on a non-tangent higher IC (unaffordable)"],
  ["Drag the bundle along BL; highlight the IC it is on"], "consumer_optimum")
g("income_substitution_effect", "micro", "consumer", "Income and substitution effects (Hicks/Slutsky)", "Good X", "Good Y", ["BL1", "BL2", "compensated BL", "A", "B", "C"],
  ["Compensated line parallel to new BL, tangent to old IC", "Substitution effect always toward cheaper good"], ["Compensated line parallel to old BL", "Effects mislabeled"], ["Step through A→B (substitution) → C (income)"])
g("price_consumption_curve", "micro", "consumer", "Price-consumption curve → individual demand", "Good X", "Good Y", ["rotating budget lines", "tangencies", "PCC", "derived demand curve"],
  ["Each tangency maps to one (P, Q) point on demand"], ["Demand derived upward-sloping for normal goods"], ["Rotate BL; plot point on lower panel"])
g("income_consumption_engel", "micro", "consumer", "Income-consumption curve and Engel curve", "Good X", "Good Y / Income", ["ICC", "Engel curve"],
  ["Normal good: Engel slopes up; inferior: bends back"], ["Inferior good with upward Engel curve"], ["Shift BL out; trace ICC"])
g("edgeworth_box", "micro", "general equilibrium", "Edgeworth box and contract curve", "Good X", "Good Y", ["two origins", "ICs of A and B", "contract curve", "lens of mutual gain"],
  ["Pareto efficient where ICs tangent", "B's origin at top-right"], ["Both origins at bottom-left", "Contract curve through IC crossings"], ["Drag endowment point; shade lens"])
# ------------------------------------------------------------------ MICRO: production & costs
g("short_run_production", "micro", "producer", "Total, marginal and average product", "Labor (L)", "Output", ["TP", "MP", "AP"],
  ["MP crosses AP at AP max", "TP max where MP = 0", "TP inflection where MP max"], ["MP misses AP max", "Labels swapped", "TP max where MP max"], ["Drag L; show TP slope = MP"], "short_run_production")
g("cost_curves", "micro", "costs", "Short-run cost curves (MC, ATC, AVC, AFC)", "Quantity (Q)", "Cost", ["MC", "ATC", "AVC", "AFC", "min points"],
  ["MC cuts AVC and ATC at their minima", "ATC − AVC = AFC shrinks with Q", "AFC always falling"], ["MC misses minima", "AVC above ATC", "AFC rising or U-shaped", "ATC and AVC converge to cross"],
  ["Drag Q; show vertical gap ATC−AVC = AFC"], "cost_curves")
g("total_cost_curves", "micro", "costs", "Total cost, variable cost, fixed cost", "Quantity", "Cost", ["TC", "TVC", "TFC"], ["TC = TVC + TFC: parallel vertical gap", "TFC horizontal"], ["TFC sloped", "TC and TVC diverge"], ["Drag Q"])
g("long_run_atc", "micro", "costs", "Long-run ATC envelope and economies of scale", "Quantity", "Cost", ["SRATC curves", "LRATC envelope", "MES"], ["LRATC envelope tangent to SRATCs", "Economies → constant → diseconomies"], ["LRATC through SRATC minima everywhere", "LRATC above SRATCs"], ["Slide plant size"])
g("isoquant_isocost", "micro", "producer", "Isoquant–isocost cost minimization", "Labor (L)", "Capital (K)", ["isocost", "isoquants", "tangency"], ["Tangency MRTS = w/r"], ["Crossing", "Crossing isoquants", "Concave"], ["Rotate isocost when w changes"], "isoquant_isocost")
# ------------------------------------------------------------------ MICRO: market structures
g("pc_firm_profit", "micro", "market structure", "Perfect competition: firm with short-run profit", "Quantity (q)", "Price, cost", ["P=MR=AR=D", "MC", "ATC", "q*", "profit rectangle"],
  ["q* where MR = MC on rising MC", "Profit = (P − ATC(q*))·q*"], ["q at min ATC", "Falling-MC crossing", "Profit to AVC", "Firm demand drawn downward"], ["Drag price line; rectangle updates"], "pc_firm_profit")
g("pc_firm_loss", "micro", "market structure", "Perfect competition: loss and shutdown rule", "Quantity (q)", "Price, cost", ["P line", "MC", "ATC", "AVC", "loss rectangle", "shutdown point"],
  ["Operate if P ≥ min AVC; shut down if P < min AVC"], ["Loss labeled profit", "Shutdown rule uses ATC"], ["Drag P below min AVC → shutdown highlight"], "pc_firm_loss")
g("pc_long_run", "micro", "market structure", "Perfect competition: long-run equilibrium (firm and market side by side)", "Quantity", "Price, cost", ["P = min ATC", "market S/D panel"],
  ["P = MR = MC = min ATC", "Zero economic profit", "Firm panel lowercase q, market uppercase Q"], ["Positive profit in long run", "Market and firm panels at different prices"], ["Shift market D; animate entry"], "pc_long_run")
g("pc_supply_curve", "micro", "market structure", "Firm supply = MC above min AVC", "Quantity", "Price", ["MC", "AVC", "supply segment"], ["Supply curve is MC above shutdown point"], ["Supply drawn as ATC", "Includes MC below AVC"], ["Highlight segment"])
g("monopoly", "micro", "market structure", "Monopoly profit maximization and DWL", *PQ, ["D=AR", "MR", "MC", "ATC", "Qm", "Pm", "profit", "DWL"],
  ["MR twice as steep as linear D", "Qm at MR = MC", "Pm read from D", "DWL between Qm and Qc"], ["Price from MR", "MR parallel to D", "Q at D = MC", "Profit rectangle using MC height"], ["Drag MC; Qm, Pm follow"], "monopoly")
g("natural_monopoly", "micro", "market structure", "Natural monopoly and regulation", *PQ, ["falling ATC", "MC below ATC", "D", "MR", "P=MC (loss)", "P=ATC (fair return)"],
  ["ATC falling across market demand", "P = MC regulation → loss"], ["ATC U-shaped with min inside market", "P = MC shown profitable"], ["Toggle regulation price"])
g("price_discrimination", "micro", "market structure", "Perfect price discrimination", *PQ, ["D = MR", "MC", "Q = competitive Q"], ["No DWL; all CS captured"], ["DWL shaded"], ["Step from single price to discrimination"])
g("monopolistic_competition_lr", "micro", "market structure", "Monopolistic competition (short and long run)", *PQ, ["D", "MR", "MC", "ATC", "tangency", "excess capacity"],
  ["LR: D tangent to ATC left of min ATC", "Zero economic profit", "Excess capacity"], ["Tangent at min ATC", "Profit in long run", "Horizontal demand"], ["Animate entry shifting D left"], "monopolistic_competition_lr")
g("kinked_demand", "micro", "market structure", "Kinked demand oligopoly", *PQ, ["kinked D", "discontinuous MR", "MC range"], ["Elastic above kink, inelastic below", "MC can move within MR gap without price change"], ["Kink reversed", "MR continuous"], ["Drag MC within the gap"])
g("payoff_matrix", "micro", "game theory", "Payoff matrix / Nash equilibrium (prisoner's dilemma)", None, None, ["2×2 matrix", "dominant strategies", "Nash cell"],
  ["Nash: no player gains by deviating unilaterally"], ["Nash marked at jointly best cell", "Payoff order (row, col) reversed"], ["Click cells to check best responses"])
g("cournot_reaction", "micro", "game theory", "Cournot reaction functions", "q1", "q2", ["R1", "R2", "Nash"], ["Equilibrium at intersection"], ["Reaction curves upward-sloping"], ["Drag q1; best response highlights"])
# ------------------------------------------------------------------ MICRO: factor markets, failures, distribution, trade
g("labor_market", "micro", "factor markets", "Competitive labor market and firm wage-taker", "Labor (L)", "Wage (W)", ["D_L = MRP", "S_L", "W*", "firm's horizontal S"], ["Firm hires where MRP = W"], ["MRP upward"], ["Shift MRP with output price"], "minimum_wage")
g("minimum_wage", "micro", "factor markets", "Minimum wage", "Labor (L)", "Wage (W)", ["min wage line", "Ld", "Ls", "unemployment"], ["Binding above W*", "Unemployment = Ls − Ld"], ["Below W* binding", "Unemployment from L*"], ["Drag minimum wage"], "minimum_wage")
g("monopsony", "micro", "factor markets", "Monopsony", "Labor (L)", "Wage (W)", ["S=AFC", "MFC", "MRP", "Lm", "Wm"], ["Lm at MRP = MFC", "Wm from S", "MFC above S"], ["Wage from MFC", "MFC below S"], ["Drag minimum wage into monopsony"], "monopsony")
g("negative_externality", "micro", "market failure", "Negative production externality", *PQ, ["MPC", "MSC", "D = MSB", "Qm", "Qs", "DWL", "Pigouvian tax"],
  ["MSC above MPC", "Market overproduces", "DWL between Qs and Qm"], ["MSC below MPC", "Q labels swapped", "DWL shaded left of Qs"], ["Drag Pigouvian tax to close gap"], "negative_externality")
g("positive_externality", "micro", "market failure", "Positive consumption externality", *PQ, ["MPB", "MSB", "S", "Qm", "Qs", "DWL"], ["MSB above MPB", "Market underproduces"], ["MSB below MPB", "Q labels swapped"], ["Drag subsidy"], "positive_externality")
g("public_goods", "micro", "market failure", "Public good: vertical summation of demand", "Quantity", "Price/benefit", ["individual D", "vertically summed D", "MC"], ["Public good demands sum vertically"], ["Summed horizontally"], ["Add consumers"])
g("common_resource", "micro", "market failure", "Tragedy of the commons", "Quantity harvested", "Cost/benefit", ["MPC", "MSC", "D"], ["Overuse relative to social optimum"], ["Underuse"], [])
g("lorenz_curve", "micro", "distribution", "Lorenz curve and Gini coefficient", "Cumulative % population", "Cumulative % income", ["equality line", "Lorenz", "area A", "area B"], ["Lorenz below equality", "Gini = A/(A+B)"], ["Above equality", "A mislabeled"], ["Bend the Lorenz curve; Gini updates"], "lorenz_curve")
g("tariff", "micro", "trade", "Tariff in a small open economy", *PQ, ["Pw", "Pw+t", "Qs1, Qd1, Qs2, Qd2", "imports", "revenue", "DWL"],
  ["Tariff raises domestic price", "Imports Qd − Qs", "Revenue t × imports", "Two DWL triangles"], ["Tariff below Pw", "Revenue on free-trade imports", "Imports from origin"], ["Drag tariff to prohibitive level"], "tariff")
g("import_quota_trade", "micro", "trade", "Import quota / export market (world price above domestic)", *PQ, ["Pw", "exports"], ["Pw above P* → exports Qs − Qd"], ["Exports measured as Qd − Qs"], [])
g("laffer_curve", "micro", "public finance", "Laffer curve", "Tax rate (%)", "Tax revenue", ["inverted U", "t*"], ["Zero revenue at 0% and 100%"], ["Positive at 100%", "Monotonic"], ["Slide tax rate"], "laffer_curve")
# ------------------------------------------------------------------ MACRO
PL = ("Real GDP (Y)", "Price level (PL)")
g("business_cycle", "macro", "cycles", "Business cycle", "Time", "Real GDP", ["trend", "peak", "trough", "expansion", "contraction"], ["Peak = top, trough = bottom"], ["Peak/trough swapped", "Phases swapped"], ["Hover phases"], "business_cycle")
g("ad_as_long_run", "macro", "AD-AS", "AD-AS long-run equilibrium", *PL, ["AD", "SRAS", "LRAS", "Yf"], ["LRAS vertical at Yf", "AD down, SRAS up", "All three meet in LR eq"], ["LRAS sloped", "AD upward", "LR eq off LRAS", "Axes labeled P/Q (micro)"], ["Drag AD/SRAS"], "ad_as_long_run")
g("ad_as_output_gap", "macro", "AD-AS", "Recessionary / inflationary gap from AD shift", *PL, ["AD1", "AD2", "SRAS", "LRAS", "gap"], ["Y < Yf recessionary, Y > Yf inflationary"], ["Gap mislabeled", "Wrong shift direction"], ["Scenario → drag AD"], "ad_as_output_gap")
g("supply_shock", "macro", "AD-AS", "Negative/positive supply shock (stagflation)", *PL, ["SRAS1", "SRAS2", "AD"], ["Cost increase → SRAS left: PL↑, Y↓"], ["Wrong direction", "Called demand-pull"], ["Drag SRAS"], "supply_shock")
g("self_correction", "macro", "AD-AS", "Long-run self-adjustment (wages adjust, SRAS shifts back to LRAS)", *PL, ["AD2", "SRAS1", "SRAS2", "LRAS"], ["In recession wages fall → SRAS right back to Yf"], ["SRAS shifts wrong way", "AD shifts back on its own"], ["Animate adjustment"], None, ["ad_as_output_gap"])
g("fiscal_monetary_policy_adas", "macro", "policy", "Stabilization policy closing a gap", *PL, ["AD1", "AD2", "LRAS"], ["Expansionary policy shifts AD right to Yf"], ["Contractionary policy for recession"], ["Drag AD"], None, ["ad_as_output_gap"])
g("keynesian_ad_as", "macro", "AD-AS", "Keynesian/intermediate/classical AS ranges", *PL, ["horizontal, upward, vertical AS segments"], ["Horizontal at low Y, vertical at Yf"], ["Ranges reversed"], [])
g("keynesian_cross", "macro", "aggregate expenditure", "Keynesian cross (45° line)", "Real GDP (Y)", "Aggregate expenditure", ["45° line", "AE", "E", "recessionary gap vertical distance"], ["AE slope = MPC < 1", "E on 45° line", "Multiplier = 1/(1−MPC)"], ["AE steeper than 45°", "E off 45° line"], ["Raise G; AE shifts up, E moves by multiplier"], "keynesian_cross")
g("consumption_function", "macro", "aggregate expenditure", "Consumption and saving functions", "Disposable income", "C, S", ["C", "S", "45°", "break-even income"], ["MPC + MPS = 1", "S = 0 where C crosses 45°"], ["MPC > 1", "Saving positive at break-even"], [])
g("phillips_curve", "macro", "inflation/unemployment", "Short-run and long-run Phillips curves", "Unemployment rate", "Inflation rate", ["SRPC", "LRPC", "u_n"], ["SRPC down", "LRPC vertical at u_n"], ["SRPC upward", "LRPC off u_n", "Axes swapped"], ["Shift SRPC with expected inflation"], "phillips_curve")
g("phillips_shift", "macro", "inflation/unemployment", "SRPC shift from expectations / supply shock", "Unemployment rate", "Inflation rate", ["SRPC1", "SRPC2", "LRPC"], ["Higher expected inflation → SRPC up"], ["Shift direction wrong", "LRPC moves with expectations"], [], None, ["phillips_curve"])
g("money_market", "macro", "money", "Money market (MS vertical, MD down)", "Quantity of money", "Nominal interest rate", ["MS", "MD", "i*"], ["MS vertical", "OMO purchase → MS right → i↓"], ["MS upward", "Wrong shift", "Real rate on axis"], ["Drag MS"], "money_market")
g("reserves_market", "macro", "money", "Ample-reserves market (IORB, floor system)", "Quantity of reserves", "Policy rate", ["reserve demand (flat in ample region)", "vertical supply", "IORB"], ["Supply in flat region; rate set by administered rates"], ["Rate changed by shifting supply in ample region"], [])
g("loanable_funds", "macro", "money", "Loanable funds market", "Quantity of loanable funds", "Real interest rate", ["S_LF", "D_LF", "r*"], ["Deficit → D_LF right (or S_LF left): r↑, crowding out"], ["Wrong curve or direction", "Nominal rate on axis"], ["Scenario → drag"], "loanable_funds")
g("fx_market", "macro", "open economy", "Foreign exchange market", "Quantity of currency", "Exchange rate (price of currency)", ["D", "S", "e*"], ["Appreciation = currency's price rises"], ["Direction wrong", "Appreciation/depreciation mislabeled", "Axis price expressed in wrong currency"], ["Drag D/S"], "fx_market")
g("is_lm", "macro", "IS-LM", "IS-LM model", "Output (Y)", "Interest rate (i)", ["IS", "LM", "E"], ["IS down, LM up", "Fiscal shifts IS, money shifts LM"], ["Labels swapped", "Wrong curve shifts"], ["Drag IS/LM"], "is_lm")
g("is_mp", "macro", "IS-MP", "IS-MP model (horizontal MP)", "Output (Y)", "Real interest rate (r)", ["IS", "MP"], ["MP horizontal at policy rate"], ["MP upward"], [], None, ["is_lm"])
g("mundell_fleming", "macro", "open economy", "Mundell-Fleming (IS*-LM*)", "Output (Y)", "Exchange rate (e)", ["IS*", "LM* vertical"], ["LM* vertical under floating rates"], ["LM* upward"], [])
g("solow_growth", "macro", "growth", "Solow model steady state", "Capital per worker (k)", "Output, investment per worker", ["f(k)", "sf(k)", "(n+δ)k", "k*"], ["sf(k) below f(k)", "k* where sf(k) = (n+δ)k"], ["SS off intersection", "Curves swapped"], ["Raise s; k* moves right"], "solow_growth")
g("aggregate_production_function", "macro", "growth", "Per-worker production function and technology shift", "Capital per worker", "Output per worker", ["f(k)", "shifted f(k)"], ["Concave", "Technology shifts up"], ["Convex"], [])
g("quantity_theory", "macro", "money", "Quantity theory / long-run money neutrality (vertical LRAS + AD shift)", *PL, ["LRAS", "AD shift"], ["Money ↑ → only PL↑ in long run"], ["Real GDP rises permanently"], [])
g("beveridge_curve", "macro", "labor", "Beveridge curve", "Unemployment rate", "Job vacancy rate", ["downward curve"], ["Inverse relation"], ["Upward"], [])
g("j_curve", "macro", "open economy", "J-curve of trade balance after depreciation", "Time", "Trade balance", ["J shape"], ["Worsens then improves"], ["Inverted J"], [])
g("yield_curve", "macro", "finance", "Yield curve (normal / inverted)", "Maturity", "Yield", ["curve"], ["Normal upward; inverted downward"], ["Labels swapped"], [])
g("bond_price_interest", "macro", "finance", "Bond market (bond price vs interest rate inverse)", "Quantity of bonds", "Price of bonds", ["D_bonds", "S_bonds"], ["Bond price↑ ⇔ interest rate↓"], ["Same-direction relation"], [])
g("crowding_out", "macro", "policy", "Crowding out (loanable funds + investment demand)", "Quantity", "Real interest rate", ["D_LF shift", "investment demand curve"], ["r↑ reduces private investment"], ["Investment rises"], [], None, ["loanable_funds"])
g("investment_demand", "macro", "aggregate expenditure", "Investment demand curve", "Quantity of investment", "Real interest rate", ["ID curve"], ["Downward sloping"], ["Upward"], [])

impl = set(REG)
for t in T:
    if t["generator"] and t["generator"] not in impl: raise SystemExit(f"bad generator {t}")
json.dump(T, open("dataset/taxonomy.json", "w"), indent=1, ensure_ascii=False)
L = ["# Economics graph taxonomy", "", f"{len(T)} graphs ({sum(t['field']=='micro' for t in T)} micro, {sum(t['field']=='macro' for t in T)} macro). "
     f"{sum(bool(t['generator']) for t in T)} map to a synthetic generator.", ""]
for fld in ("micro", "macro"):
    L += [f"## {fld.title()}", ""]
    for t in [t for t in T if t["field"] == fld]:
        L += [f"### {t['name']}  `{t['id']}`" + (f"  — generator: `{t['generator']}`" if t["generator"] else ""), f"*{t['topic']}* · axes: {t['axes']['x']} / {t['axes']['y']}", "",
              "- **Elements:** " + ", ".join(t["elements"]), "- **Correct when:** " + "; ".join(t["correctness_rules"]), "- **Common mistakes:** " + "; ".join(t["common_mistakes"])]
        if t["whiteboard_interactions"]: L.append("- **Whiteboard:** " + "; ".join(t["whiteboard_interactions"]))
        L.append("")
open("dataset/TAXONOMY.md", "w").write("\n".join(L))
print(len(T), "graphs")
