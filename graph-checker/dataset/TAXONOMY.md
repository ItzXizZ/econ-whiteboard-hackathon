# Economics graph taxonomy

83 graphs (56 micro, 27 macro). 44 map to a synthetic generator.

## Micro

### Production possibilities frontier (concave)  `ppf`  — generator: `ppf`
*scarcity & choice* · axes: Good X / Good Y

- **Elements:** PPF curve, efficient point on curve, inefficient point inside, unattainable point outside
- **Correct when:** Concave (bowed out) when opportunity costs increase; Points on curve efficient, inside inefficient, outside unattainable; Slope = opportunity cost of X in Y
- **Common mistakes:** Bowed-in PPF labeled increasing cost; Inside point labeled efficient; Outside point labeled attainable; Straight PPF labeled increasing cost
- **Whiteboard:** Drag a point along the PPF to show the opportunity-cost tradeoff; Drag a point inside → highlight unemployed resources

### Linear PPF (constant opportunity cost)  `ppf_linear`
*scarcity & choice* · axes: Good X / Good Y

- **Elements:** straight PPF, intercepts
- **Correct when:** Straight line ⇔ constant opportunity cost; Slope = −(Ymax/Xmax)
- **Common mistakes:** Labeled increasing opportunity cost; Wrong slope for given intercepts
- **Whiteboard:** Drag an intercept to change opportunity cost

### PPF outward shift / pivot  `ppf_shift`  — generator: `ppf_shift`
*economic growth* · axes: Good X / Good Y

- **Elements:** PPF1, PPF2, shift arrow
- **Correct when:** Growth (more resources, general tech) → outward shift; Tech specific to one good → pivot along that axis only; Destruction of resources → inward shift
- **Common mistakes:** Growth drawn inward; One-good technology drawn as parallel shift; Choosing more capital goods today does not shift tomorrow's PPF further out
- **Whiteboard:** Drag one intercept to pivot; Animate PPF1 → PPF2

### Comparative advantage with two PPFs  `comparative_advantage`  — generator: `comparative_advantage`
*trade* · axes: Good X / Good Y

- **Elements:** PPF country A, PPF country B, terms-of-trade line, consumption points
- **Correct when:** Lower opportunity cost (flatter PPF for X on x-axis) → comparative advantage in X; Terms of trade lie between the two opportunity costs; Post-trade consumption can lie outside own PPF
- **Common mistakes:** Comparative advantage confused with absolute advantage; Comparative advantage assigned to the higher-cost producer; Terms of trade outside the range of opportunity costs
- **Whiteboard:** Rotate the terms-of-trade line between the two slopes; Highlight each slope as opportunity cost

### Circular-flow diagram  `circular_flow`
*foundations* · axes: None / None

- **Elements:** households, firms, product market, factor market, real and money flows
- **Correct when:** Money flows opposite to goods/factor flows; Households sell factors, buy products
- **Common mistakes:** Arrow directions reversed; Factor and product markets swapped
- **Whiteboard:** Trace one dollar around the loop

### Demand curve, change in quantity demanded vs change in demand  `demand_curve`  — generator: `demand_shift`
*demand* · axes: Quantity (Q) / Price (P)

- **Elements:** D curve, movement along, shift
- **Correct when:** Downward sloping (law of demand); Own-price change → movement along curve; other determinants → shift
- **Common mistakes:** Upward-sloping demand; Price change drawn as a shift; Shift direction wrong for determinant
- **Whiteboard:** Drag a point along D vs drag D itself

### Supply curve, change in quantity supplied vs change in supply  `supply_curve`  — generator: `supply_shift`
*supply* · axes: Quantity (Q) / Price (P)

- **Elements:** S curve, movement along, shift
- **Correct when:** Upward sloping; Own-price change → movement along; input cost/tech/expectations/number of sellers → shift
- **Common mistakes:** 'Increase in supply' drawn as upward (leftward) shift; Price change drawn as a shift
- **Whiteboard:** Drag S right/left

### Market equilibrium  `supply_demand_equilibrium`  — generator: `supply_demand_equilibrium`
*markets* · axes: Quantity (Q) / Price (P)

- **Elements:** D, S, E, P*, Q*
- **Correct when:** Equilibrium at intersection; P on vertical axis, Q on horizontal
- **Common mistakes:** Equilibrium off intersection; Labels swapped; Axes swapped; Demand upward
- **Whiteboard:** Drag price above P* → highlight surplus; below → shortage

### Shift in demand  `demand_shift`  — generator: `demand_shift`
*markets* · axes: Quantity (Q) / Price (P)

- **Elements:** D1, D2, S, E1, E2, arrow
- **Correct when:** Normal good + income↑ → right; Substitute price↑ → right; complement price↑ → left; Both P and Q move same direction
- **Common mistakes:** Wrong direction; Shifting supply for a demand event; E2 not at new intersection; Inferior good treated as normal
- **Whiteboard:** Drag D; E slides along S

### Shift in supply  `supply_shift`  — generator: `supply_shift`
*markets* · axes: Quantity (Q) / Price (P)

- **Elements:** S1, S2, D, E1, E2, arrow
- **Correct when:** Input cost↓ / tech↑ / more sellers → right; P and Q move opposite directions
- **Common mistakes:** Wrong direction; Shifting demand for a supply event; E2 misplaced
- **Whiteboard:** Drag S; E slides along D

### Simultaneous shifts of demand and supply  `double_shift`
*markets* · axes: Quantity (Q) / Price (P)

- **Elements:** D1, D2, S1, S2, E1, E2
- **Correct when:** One of P or Q is indeterminate unless magnitudes known
- **Common mistakes:** Claiming both P and Q changes are determinate
- **Whiteboard:** Vary shift sizes to show ambiguity

### Consumer and producer surplus  `consumer_producer_surplus`  — generator: `consumer_producer_surplus`
*welfare* · axes: Quantity (Q) / Price (P)

- **Elements:** CS triangle, PS triangle, E
- **Correct when:** CS: below D, above P, 0..Q*; PS: above S, below P, 0..Q*
- **Common mistakes:** Regions swapped; CS drawn as P×Q rectangle; Surplus extended past Q*
- **Whiteboard:** Hover CS/PS to show area formula

### Price ceiling (binding)  `price_ceiling`  — generator: `price_ceiling`
*government* · axes: Quantity (Q) / Price (P)

- **Elements:** ceiling line, Qs, Qd, shortage, DWL
- **Correct when:** Binding only below P*; Shortage = Qd − Qs; DWL triangle between Qs and Q*
- **Common mistakes:** Ceiling above P* shown as binding; Shortage labeled surplus; Qs/Qd swapped
- **Whiteboard:** Drag ceiling up past P* → shortage disappears

### Price floor (binding)  `price_floor`  — generator: `price_floor`
*government* · axes: Quantity (Q) / Price (P)

- **Elements:** floor line, Qs, Qd, surplus, DWL
- **Correct when:** Binding only above P*; Surplus = Qs − Qd
- **Common mistakes:** Floor below P* shown as binding; Surplus labeled shortage; Qs/Qd swapped
- **Whiteboard:** Drag floor down past P* → surplus disappears

### Per-unit (excise) tax: incidence, revenue, DWL  `per_unit_tax`  — generator: `per_unit_tax`
*government* · axes: Quantity (Q) / Price (P)

- **Elements:** S, S+t, D, Pc, Pp, Qt, revenue rectangle, DWL
- **Correct when:** Tax on sellers shifts S up by t; Pc − Pp = t; Revenue = t × Qt; DWL between Qt and Q*; Burden falls more on the less elastic side
- **Common mistakes:** Shift down; DWL right of Q*; Revenue uses Q*; Pp at old P*; Incidence attributed by who writes the check
- **Whiteboard:** Drag t; watch revenue and DWL grow; Toggle elasticity to move incidence

### Per-unit subsidy  `per_unit_subsidy`  — generator: `per_unit_subsidy`
*government* · axes: Quantity (Q) / Price (P)

- **Elements:** S, S−s, D, Pc, Pp, cost rectangle, DWL
- **Correct when:** Subsidy shifts S down; DWL from overproduction right of Q*; Government cost = s × Qs
- **Common mistakes:** Shift up; DWL left of Q*
- **Whiteboard:** Drag subsidy size

### Tax incidence and elasticity  `tax_incidence_elasticity`
*government* · axes: Quantity (Q) / Price (P)

- **Elements:** elastic vs inelastic D or S, Pc, Pp
- **Correct when:** More inelastic side bears more of the tax
- **Common mistakes:** Burden on elastic side
- **Whiteboard:** Rotate D about E

### Production quota  `quota`
*government* · axes: Quantity (Q) / Price (P)

- **Elements:** vertical quota line, quota rent, DWL
- **Correct when:** Quota below Q* raises price on D
- **Common mistakes:** Price read off S at quota; Quota above Q* shown as binding
- **Whiteboard:** Drag quota line

### Elastic vs inelastic demand  `elasticity_comparison`  — generator: `elasticity_comparison`
*elasticity* · axes: Quantity (Q) / Price (P)

- **Elements:** steep D, flat D, common point
- **Correct when:** Through a common point, steeper = more inelastic
- **Common mistakes:** Labels swapped; Slope equated with elasticity along a linear curve
- **Whiteboard:** Rotate D through A

### Perfectly elastic / perfectly inelastic  `perfect_elasticity`  — generator: `perfect_elasticity`
*elasticity* · axes: Quantity (Q) / Price (P)

- **Elements:** horizontal D, vertical D
- **Correct when:** Horizontal = perfectly elastic (∞); Vertical = perfectly inelastic (0)
- **Common mistakes:** Swapped
- **Whiteboard:** Toggle

### Elasticity along a linear demand curve and total revenue  `elasticity_along_linear_demand`
*elasticity* · axes: Quantity (Q) / Price (P)

- **Elements:** D, midpoint (unit elastic), elastic/inelastic segments, TR curve
- **Correct when:** Upper half elastic, lower half inelastic; TR max at unit-elastic midpoint
- **Common mistakes:** Constant elasticity along a straight line; TR max at the intercept
- **Whiteboard:** Slide price; show TR rectangle change

### Normal/inferior goods, substitutes/complements (shifts)  `cross_income_elasticity`
*elasticity* · axes: Quantity (Q) / Price (P)

- **Elements:** D1, D2
- **Correct when:** Inferior good: income↑ → D left
- **Common mistakes:** Inferior treated as normal
- **Whiteboard:** Scenario cards → drag D

### Total and marginal utility  `total_marginal_utility`
*consumer* · axes: Quantity consumed / Utility

- **Elements:** TU curve, MU curve
- **Correct when:** MU declines (diminishing MU); TU max where MU = 0
- **Common mistakes:** MU rising; TU max not where MU = 0
- **Whiteboard:** Drag Q; show TU slope = MU

### Budget constraint and shifts  `budget_line_shift`  — generator: `budget_line_shift`
*consumer* · axes: Good X / Good Y

- **Elements:** BL1, BL2, intercepts M/Px, M/Py
- **Correct when:** Income change → parallel shift; One price change → pivot on the other intercept
- **Common mistakes:** Income drawn as pivot; Price drawn as parallel shift; Pivot on wrong axis
- **Whiteboard:** Drag income slider vs price slider

### Indifference curves and consumer optimum  `consumer_optimum`  — generator: `consumer_optimum`
*consumer* · axes: Good X / Good Y

- **Elements:** budget line, IC1..IC3, tangency E
- **Correct when:** ICs convex, downward, non-crossing; Optimum at tangency MRS = Px/Py
- **Common mistakes:** Optimum where IC crosses BL; ICs cross; Concave ICs; Optimum on a non-tangent higher IC (unaffordable)
- **Whiteboard:** Drag the bundle along BL; highlight the IC it is on

### Income and substitution effects (Hicks/Slutsky)  `income_substitution_effect`
*consumer* · axes: Good X / Good Y

- **Elements:** BL1, BL2, compensated BL, A, B, C
- **Correct when:** Compensated line parallel to new BL, tangent to old IC; Substitution effect always toward cheaper good
- **Common mistakes:** Compensated line parallel to old BL; Effects mislabeled
- **Whiteboard:** Step through A→B (substitution) → C (income)

### Price-consumption curve → individual demand  `price_consumption_curve`
*consumer* · axes: Good X / Good Y

- **Elements:** rotating budget lines, tangencies, PCC, derived demand curve
- **Correct when:** Each tangency maps to one (P, Q) point on demand
- **Common mistakes:** Demand derived upward-sloping for normal goods
- **Whiteboard:** Rotate BL; plot point on lower panel

### Income-consumption curve and Engel curve  `income_consumption_engel`
*consumer* · axes: Good X / Good Y / Income

- **Elements:** ICC, Engel curve
- **Correct when:** Normal good: Engel slopes up; inferior: bends back
- **Common mistakes:** Inferior good with upward Engel curve
- **Whiteboard:** Shift BL out; trace ICC

### Edgeworth box and contract curve  `edgeworth_box`
*general equilibrium* · axes: Good X / Good Y

- **Elements:** two origins, ICs of A and B, contract curve, lens of mutual gain
- **Correct when:** Pareto efficient where ICs tangent; B's origin at top-right
- **Common mistakes:** Both origins at bottom-left; Contract curve through IC crossings
- **Whiteboard:** Drag endowment point; shade lens

### Total, marginal and average product  `short_run_production`  — generator: `short_run_production`
*producer* · axes: Labor (L) / Output

- **Elements:** TP, MP, AP
- **Correct when:** MP crosses AP at AP max; TP max where MP = 0; TP inflection where MP max
- **Common mistakes:** MP misses AP max; Labels swapped; TP max where MP max
- **Whiteboard:** Drag L; show TP slope = MP

### Short-run cost curves (MC, ATC, AVC, AFC)  `cost_curves`  — generator: `cost_curves`
*costs* · axes: Quantity (Q) / Cost

- **Elements:** MC, ATC, AVC, AFC, min points
- **Correct when:** MC cuts AVC and ATC at their minima; ATC − AVC = AFC shrinks with Q; AFC always falling
- **Common mistakes:** MC misses minima; AVC above ATC; AFC rising or U-shaped; ATC and AVC converge to cross
- **Whiteboard:** Drag Q; show vertical gap ATC−AVC = AFC

### Total cost, variable cost, fixed cost  `total_cost_curves`
*costs* · axes: Quantity / Cost

- **Elements:** TC, TVC, TFC
- **Correct when:** TC = TVC + TFC: parallel vertical gap; TFC horizontal
- **Common mistakes:** TFC sloped; TC and TVC diverge
- **Whiteboard:** Drag Q

### Long-run ATC envelope and economies of scale  `long_run_atc`
*costs* · axes: Quantity / Cost

- **Elements:** SRATC curves, LRATC envelope, MES
- **Correct when:** LRATC envelope tangent to SRATCs; Economies → constant → diseconomies
- **Common mistakes:** LRATC through SRATC minima everywhere; LRATC above SRATCs
- **Whiteboard:** Slide plant size

### Isoquant–isocost cost minimization  `isoquant_isocost`  — generator: `isoquant_isocost`
*producer* · axes: Labor (L) / Capital (K)

- **Elements:** isocost, isoquants, tangency
- **Correct when:** Tangency MRTS = w/r
- **Common mistakes:** Crossing; Crossing isoquants; Concave
- **Whiteboard:** Rotate isocost when w changes

### Perfect competition: firm with short-run profit  `pc_firm_profit`  — generator: `pc_firm_profit`
*market structure* · axes: Quantity (q) / Price, cost

- **Elements:** P=MR=AR=D, MC, ATC, q*, profit rectangle
- **Correct when:** q* where MR = MC on rising MC; Profit = (P − ATC(q*))·q*
- **Common mistakes:** q at min ATC; Falling-MC crossing; Profit to AVC; Firm demand drawn downward
- **Whiteboard:** Drag price line; rectangle updates

### Perfect competition: loss and shutdown rule  `pc_firm_loss`  — generator: `pc_firm_loss`
*market structure* · axes: Quantity (q) / Price, cost

- **Elements:** P line, MC, ATC, AVC, loss rectangle, shutdown point
- **Correct when:** Operate if P ≥ min AVC; shut down if P < min AVC
- **Common mistakes:** Loss labeled profit; Shutdown rule uses ATC
- **Whiteboard:** Drag P below min AVC → shutdown highlight

### Perfect competition: long-run equilibrium (firm and market side by side)  `pc_long_run`  — generator: `pc_long_run`
*market structure* · axes: Quantity / Price, cost

- **Elements:** P = min ATC, market S/D panel
- **Correct when:** P = MR = MC = min ATC; Zero economic profit; Firm panel lowercase q, market uppercase Q
- **Common mistakes:** Positive profit in long run; Market and firm panels at different prices
- **Whiteboard:** Shift market D; animate entry

### Firm supply = MC above min AVC  `pc_supply_curve`
*market structure* · axes: Quantity / Price

- **Elements:** MC, AVC, supply segment
- **Correct when:** Supply curve is MC above shutdown point
- **Common mistakes:** Supply drawn as ATC; Includes MC below AVC
- **Whiteboard:** Highlight segment

### Monopoly profit maximization and DWL  `monopoly`  — generator: `monopoly`
*market structure* · axes: Quantity (Q) / Price (P)

- **Elements:** D=AR, MR, MC, ATC, Qm, Pm, profit, DWL
- **Correct when:** MR twice as steep as linear D; Qm at MR = MC; Pm read from D; DWL between Qm and Qc
- **Common mistakes:** Price from MR; MR parallel to D; Q at D = MC; Profit rectangle using MC height
- **Whiteboard:** Drag MC; Qm, Pm follow

### Natural monopoly and regulation  `natural_monopoly`
*market structure* · axes: Quantity (Q) / Price (P)

- **Elements:** falling ATC, MC below ATC, D, MR, P=MC (loss), P=ATC (fair return)
- **Correct when:** ATC falling across market demand; P = MC regulation → loss
- **Common mistakes:** ATC U-shaped with min inside market; P = MC shown profitable
- **Whiteboard:** Toggle regulation price

### Perfect price discrimination  `price_discrimination`
*market structure* · axes: Quantity (Q) / Price (P)

- **Elements:** D = MR, MC, Q = competitive Q
- **Correct when:** No DWL; all CS captured
- **Common mistakes:** DWL shaded
- **Whiteboard:** Step from single price to discrimination

### Monopolistic competition (short and long run)  `monopolistic_competition_lr`  — generator: `monopolistic_competition_lr`
*market structure* · axes: Quantity (Q) / Price (P)

- **Elements:** D, MR, MC, ATC, tangency, excess capacity
- **Correct when:** LR: D tangent to ATC left of min ATC; Zero economic profit; Excess capacity
- **Common mistakes:** Tangent at min ATC; Profit in long run; Horizontal demand
- **Whiteboard:** Animate entry shifting D left

### Kinked demand oligopoly  `kinked_demand`
*market structure* · axes: Quantity (Q) / Price (P)

- **Elements:** kinked D, discontinuous MR, MC range
- **Correct when:** Elastic above kink, inelastic below; MC can move within MR gap without price change
- **Common mistakes:** Kink reversed; MR continuous
- **Whiteboard:** Drag MC within the gap

### Payoff matrix / Nash equilibrium (prisoner's dilemma)  `payoff_matrix`
*game theory* · axes: None / None

- **Elements:** 2×2 matrix, dominant strategies, Nash cell
- **Correct when:** Nash: no player gains by deviating unilaterally
- **Common mistakes:** Nash marked at jointly best cell; Payoff order (row, col) reversed
- **Whiteboard:** Click cells to check best responses

### Cournot reaction functions  `cournot_reaction`
*game theory* · axes: q1 / q2

- **Elements:** R1, R2, Nash
- **Correct when:** Equilibrium at intersection
- **Common mistakes:** Reaction curves upward-sloping
- **Whiteboard:** Drag q1; best response highlights

### Competitive labor market and firm wage-taker  `labor_market`  — generator: `minimum_wage`
*factor markets* · axes: Labor (L) / Wage (W)

- **Elements:** D_L = MRP, S_L, W*, firm's horizontal S
- **Correct when:** Firm hires where MRP = W
- **Common mistakes:** MRP upward
- **Whiteboard:** Shift MRP with output price

### Minimum wage  `minimum_wage`  — generator: `minimum_wage`
*factor markets* · axes: Labor (L) / Wage (W)

- **Elements:** min wage line, Ld, Ls, unemployment
- **Correct when:** Binding above W*; Unemployment = Ls − Ld
- **Common mistakes:** Below W* binding; Unemployment from L*
- **Whiteboard:** Drag minimum wage

### Monopsony  `monopsony`  — generator: `monopsony`
*factor markets* · axes: Labor (L) / Wage (W)

- **Elements:** S=AFC, MFC, MRP, Lm, Wm
- **Correct when:** Lm at MRP = MFC; Wm from S; MFC above S
- **Common mistakes:** Wage from MFC; MFC below S
- **Whiteboard:** Drag minimum wage into monopsony

### Negative production externality  `negative_externality`  — generator: `negative_externality`
*market failure* · axes: Quantity (Q) / Price (P)

- **Elements:** MPC, MSC, D = MSB, Qm, Qs, DWL, Pigouvian tax
- **Correct when:** MSC above MPC; Market overproduces; DWL between Qs and Qm
- **Common mistakes:** MSC below MPC; Q labels swapped; DWL shaded left of Qs
- **Whiteboard:** Drag Pigouvian tax to close gap

### Positive consumption externality  `positive_externality`  — generator: `positive_externality`
*market failure* · axes: Quantity (Q) / Price (P)

- **Elements:** MPB, MSB, S, Qm, Qs, DWL
- **Correct when:** MSB above MPB; Market underproduces
- **Common mistakes:** MSB below MPB; Q labels swapped
- **Whiteboard:** Drag subsidy

### Public good: vertical summation of demand  `public_goods`
*market failure* · axes: Quantity / Price/benefit

- **Elements:** individual D, vertically summed D, MC
- **Correct when:** Public good demands sum vertically
- **Common mistakes:** Summed horizontally
- **Whiteboard:** Add consumers

### Tragedy of the commons  `common_resource`
*market failure* · axes: Quantity harvested / Cost/benefit

- **Elements:** MPC, MSC, D
- **Correct when:** Overuse relative to social optimum
- **Common mistakes:** Underuse

### Lorenz curve and Gini coefficient  `lorenz_curve`  — generator: `lorenz_curve`
*distribution* · axes: Cumulative % population / Cumulative % income

- **Elements:** equality line, Lorenz, area A, area B
- **Correct when:** Lorenz below equality; Gini = A/(A+B)
- **Common mistakes:** Above equality; A mislabeled
- **Whiteboard:** Bend the Lorenz curve; Gini updates

### Tariff in a small open economy  `tariff`  — generator: `tariff`
*trade* · axes: Quantity (Q) / Price (P)

- **Elements:** Pw, Pw+t, Qs1, Qd1, Qs2, Qd2, imports, revenue, DWL
- **Correct when:** Tariff raises domestic price; Imports Qd − Qs; Revenue t × imports; Two DWL triangles
- **Common mistakes:** Tariff below Pw; Revenue on free-trade imports; Imports from origin
- **Whiteboard:** Drag tariff to prohibitive level

### Import quota / export market (world price above domestic)  `import_quota_trade`
*trade* · axes: Quantity (Q) / Price (P)

- **Elements:** Pw, exports
- **Correct when:** Pw above P* → exports Qs − Qd
- **Common mistakes:** Exports measured as Qd − Qs

### Laffer curve  `laffer_curve`  — generator: `laffer_curve`
*public finance* · axes: Tax rate (%) / Tax revenue

- **Elements:** inverted U, t*
- **Correct when:** Zero revenue at 0% and 100%
- **Common mistakes:** Positive at 100%; Monotonic
- **Whiteboard:** Slide tax rate

## Macro

### Business cycle  `business_cycle`  — generator: `business_cycle`
*cycles* · axes: Time / Real GDP

- **Elements:** trend, peak, trough, expansion, contraction
- **Correct when:** Peak = top, trough = bottom
- **Common mistakes:** Peak/trough swapped; Phases swapped
- **Whiteboard:** Hover phases

### AD-AS long-run equilibrium  `ad_as_long_run`  — generator: `ad_as_long_run`
*AD-AS* · axes: Real GDP (Y) / Price level (PL)

- **Elements:** AD, SRAS, LRAS, Yf
- **Correct when:** LRAS vertical at Yf; AD down, SRAS up; All three meet in LR eq
- **Common mistakes:** LRAS sloped; AD upward; LR eq off LRAS; Axes labeled P/Q (micro)
- **Whiteboard:** Drag AD/SRAS

### Recessionary / inflationary gap from AD shift  `ad_as_output_gap`  — generator: `ad_as_output_gap`
*AD-AS* · axes: Real GDP (Y) / Price level (PL)

- **Elements:** AD1, AD2, SRAS, LRAS, gap
- **Correct when:** Y < Yf recessionary, Y > Yf inflationary
- **Common mistakes:** Gap mislabeled; Wrong shift direction
- **Whiteboard:** Scenario → drag AD

### Negative/positive supply shock (stagflation)  `supply_shock`  — generator: `supply_shock`
*AD-AS* · axes: Real GDP (Y) / Price level (PL)

- **Elements:** SRAS1, SRAS2, AD
- **Correct when:** Cost increase → SRAS left: PL↑, Y↓
- **Common mistakes:** Wrong direction; Called demand-pull
- **Whiteboard:** Drag SRAS

### Long-run self-adjustment (wages adjust, SRAS shifts back to LRAS)  `self_correction`
*AD-AS* · axes: Real GDP (Y) / Price level (PL)

- **Elements:** AD2, SRAS1, SRAS2, LRAS
- **Correct when:** In recession wages fall → SRAS right back to Yf
- **Common mistakes:** SRAS shifts wrong way; AD shifts back on its own
- **Whiteboard:** Animate adjustment

### Stabilization policy closing a gap  `fiscal_monetary_policy_adas`
*policy* · axes: Real GDP (Y) / Price level (PL)

- **Elements:** AD1, AD2, LRAS
- **Correct when:** Expansionary policy shifts AD right to Yf
- **Common mistakes:** Contractionary policy for recession
- **Whiteboard:** Drag AD

### Keynesian/intermediate/classical AS ranges  `keynesian_ad_as`
*AD-AS* · axes: Real GDP (Y) / Price level (PL)

- **Elements:** horizontal, upward, vertical AS segments
- **Correct when:** Horizontal at low Y, vertical at Yf
- **Common mistakes:** Ranges reversed

### Keynesian cross (45° line)  `keynesian_cross`  — generator: `keynesian_cross`
*aggregate expenditure* · axes: Real GDP (Y) / Aggregate expenditure

- **Elements:** 45° line, AE, E, recessionary gap vertical distance
- **Correct when:** AE slope = MPC < 1; E on 45° line; Multiplier = 1/(1−MPC)
- **Common mistakes:** AE steeper than 45°; E off 45° line
- **Whiteboard:** Raise G; AE shifts up, E moves by multiplier

### Consumption and saving functions  `consumption_function`
*aggregate expenditure* · axes: Disposable income / C, S

- **Elements:** C, S, 45°, break-even income
- **Correct when:** MPC + MPS = 1; S = 0 where C crosses 45°
- **Common mistakes:** MPC > 1; Saving positive at break-even

### Short-run and long-run Phillips curves  `phillips_curve`  — generator: `phillips_curve`
*inflation/unemployment* · axes: Unemployment rate / Inflation rate

- **Elements:** SRPC, LRPC, u_n
- **Correct when:** SRPC down; LRPC vertical at u_n
- **Common mistakes:** SRPC upward; LRPC off u_n; Axes swapped
- **Whiteboard:** Shift SRPC with expected inflation

### SRPC shift from expectations / supply shock  `phillips_shift`
*inflation/unemployment* · axes: Unemployment rate / Inflation rate

- **Elements:** SRPC1, SRPC2, LRPC
- **Correct when:** Higher expected inflation → SRPC up
- **Common mistakes:** Shift direction wrong; LRPC moves with expectations

### Money market (MS vertical, MD down)  `money_market`  — generator: `money_market`
*money* · axes: Quantity of money / Nominal interest rate

- **Elements:** MS, MD, i*
- **Correct when:** MS vertical; OMO purchase → MS right → i↓
- **Common mistakes:** MS upward; Wrong shift; Real rate on axis
- **Whiteboard:** Drag MS

### Ample-reserves market (IORB, floor system)  `reserves_market`
*money* · axes: Quantity of reserves / Policy rate

- **Elements:** reserve demand (flat in ample region), vertical supply, IORB
- **Correct when:** Supply in flat region; rate set by administered rates
- **Common mistakes:** Rate changed by shifting supply in ample region

### Loanable funds market  `loanable_funds`  — generator: `loanable_funds`
*money* · axes: Quantity of loanable funds / Real interest rate

- **Elements:** S_LF, D_LF, r*
- **Correct when:** Deficit → D_LF right (or S_LF left): r↑, crowding out
- **Common mistakes:** Wrong curve or direction; Nominal rate on axis
- **Whiteboard:** Scenario → drag

### Foreign exchange market  `fx_market`  — generator: `fx_market`
*open economy* · axes: Quantity of currency / Exchange rate (price of currency)

- **Elements:** D, S, e*
- **Correct when:** Appreciation = currency's price rises
- **Common mistakes:** Direction wrong; Appreciation/depreciation mislabeled; Axis price expressed in wrong currency
- **Whiteboard:** Drag D/S

### IS-LM model  `is_lm`  — generator: `is_lm`
*IS-LM* · axes: Output (Y) / Interest rate (i)

- **Elements:** IS, LM, E
- **Correct when:** IS down, LM up; Fiscal shifts IS, money shifts LM
- **Common mistakes:** Labels swapped; Wrong curve shifts
- **Whiteboard:** Drag IS/LM

### IS-MP model (horizontal MP)  `is_mp`
*IS-MP* · axes: Output (Y) / Real interest rate (r)

- **Elements:** IS, MP
- **Correct when:** MP horizontal at policy rate
- **Common mistakes:** MP upward

### Mundell-Fleming (IS*-LM*)  `mundell_fleming`
*open economy* · axes: Output (Y) / Exchange rate (e)

- **Elements:** IS*, LM* vertical
- **Correct when:** LM* vertical under floating rates
- **Common mistakes:** LM* upward

### Solow model steady state  `solow_growth`  — generator: `solow_growth`
*growth* · axes: Capital per worker (k) / Output, investment per worker

- **Elements:** f(k), sf(k), (n+δ)k, k*
- **Correct when:** sf(k) below f(k); k* where sf(k) = (n+δ)k
- **Common mistakes:** SS off intersection; Curves swapped
- **Whiteboard:** Raise s; k* moves right

### Per-worker production function and technology shift  `aggregate_production_function`
*growth* · axes: Capital per worker / Output per worker

- **Elements:** f(k), shifted f(k)
- **Correct when:** Concave; Technology shifts up
- **Common mistakes:** Convex

### Quantity theory / long-run money neutrality (vertical LRAS + AD shift)  `quantity_theory`
*money* · axes: Real GDP (Y) / Price level (PL)

- **Elements:** LRAS, AD shift
- **Correct when:** Money ↑ → only PL↑ in long run
- **Common mistakes:** Real GDP rises permanently

### Beveridge curve  `beveridge_curve`
*labor* · axes: Unemployment rate / Job vacancy rate

- **Elements:** downward curve
- **Correct when:** Inverse relation
- **Common mistakes:** Upward

### J-curve of trade balance after depreciation  `j_curve`
*open economy* · axes: Time / Trade balance

- **Elements:** J shape
- **Correct when:** Worsens then improves
- **Common mistakes:** Inverted J

### Yield curve (normal / inverted)  `yield_curve`
*finance* · axes: Maturity / Yield

- **Elements:** curve
- **Correct when:** Normal upward; inverted downward
- **Common mistakes:** Labels swapped

### Bond market (bond price vs interest rate inverse)  `bond_price_interest`
*finance* · axes: Quantity of bonds / Price of bonds

- **Elements:** D_bonds, S_bonds
- **Correct when:** Bond price↑ ⇔ interest rate↓
- **Common mistakes:** Same-direction relation

### Crowding out (loanable funds + investment demand)  `crowding_out`
*policy* · axes: Quantity / Real interest rate

- **Elements:** D_LF shift, investment demand curve
- **Correct when:** r↑ reduces private investment
- **Common mistakes:** Investment rises

### Investment demand curve  `investment_demand`
*aggregate expenditure* · axes: Quantity of investment / Real interest rate

- **Elements:** ID curve
- **Correct when:** Downward sloping
- **Common mistakes:** Upward
