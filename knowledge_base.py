"""
knowledge_base.py

A small internal knowledge base stored as a Python dictionary.
For each math topic it provides:
  - formulas: key mathematical formulas relevant to the topic
  - concept:  a short plain-English explanation of the subject area
  - examples: representative problem types the LLM can reference
  - resources: recommended study tips and external references

Connects to: solver.py — the retrieved entry is injected into the LLM system prompt
             to give the model grounded, topic-specific context.
"""

KNOWLEDGE_BASE: dict[str, dict] = {

    # -------------------------------------------------------------------------
    # ALGEBRA
    # -------------------------------------------------------------------------
    "algebra": {
        "concept": (
            "Algebra is the branch of mathematics that studies symbols and the rules "
            "for manipulating them. It covers solving equations, working with "
            "polynomials, and understanding functions and their graphs."
        ),
        "formulas": [
            "Quadratic formula: x = (-b ± √(b²-4ac)) / 2a",
            "Discriminant: Δ = b²-4ac  (Δ>0: two real roots, Δ=0: repeated root, Δ<0: complex roots)",
            "Difference of squares: a² - b² = (a+b)(a-b)",
            "Perfect square trinomial: (a ± b)² = a² ± 2ab + b²",
            "Sum/difference of cubes: a³ ± b³ = (a ± b)(a² ∓ ab + b²)",
            "Logarithm rules: log(xy)=log x+log y,  log(x/y)=log x-log y,  log(xⁿ)=n·log x",
            "Exponential ↔ log: aˣ = y  ↔  log_a(y) = x",
            "Slope-intercept: y = mx + b",
            "Point-slope: y - y₁ = m(x - x₁)",
            "Rational root theorem: if p/q is a rational root of aₙxⁿ+…+a₀, then p | a₀ and q | aₙ",
        ],
        "examples": [
            "Solve 2x² + 3x - 5 = 0",
            "Factor x² - 9",
            "Simplify (x² - 1)/(x - 1)",
            "Solve log₂(x) = 3",
            "Find the roots of x³ - 6x² + 11x - 6 = 0",
        ],
        "resources": [
            "Khan Academy — Algebra (khanacademy.org/math/algebra)",
            "Paul's Online Math Notes — Algebra (tutorial.math.lamar.edu)",
            "Study tip: always verify roots by substituting back into the original equation",
            "Practice: solve quadratics using all three methods — factoring, completing the square, formula",
        ],
    },

    # -------------------------------------------------------------------------
    # CALCULUS (single & multivariable, up to vector calculus)
    # -------------------------------------------------------------------------
    "calculus": {
        "concept": (
            "Calculus studies continuous change via two core operations: differentiation "
            "(rates of change / slopes) and integration (accumulation / area). "
            "Multivariable calculus extends these ideas to functions of several variables, "
            "leading to partial derivatives, multiple integrals, and vector calculus."
        ),
        "formulas": [
            # Limits
            "L'Hôpital's rule: lim f/g = lim f'/g'  (0/0 or ∞/∞ forms)",
            "Squeeze theorem: g(x) ≤ f(x) ≤ h(x) and lim g = lim h = L  →  lim f = L",
            # Differentiation
            "Power rule:  d/dx [xⁿ] = n·xⁿ⁻¹",
            "Product rule: d/dx [f·g] = f'g + fg'",
            "Quotient rule: d/dx [f/g] = (f'g - fg') / g²",
            "Chain rule: d/dx [f(g(x))] = f'(g(x))·g'(x)",
            "Common derivatives: sin'=cos, cos'=-sin, tan'=sec², (eˣ)'=eˣ, (ln x)'=1/x, (aˣ)'=aˣ ln a",
            "Implicit differentiation: differentiate both sides with respect to x, treat y as y(x)",
            # Multivariable
            "Partial derivative: ∂f/∂x — differentiate treating all other variables as constants",
            "Gradient: ∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z)  — points in direction of steepest ascent",
            "Directional derivative: D_u f = ∇f · û",
            "Critical points: ∇f = 0 (set all partial derivatives to zero)",
            "Second derivative test (2-var): D = fₓₓfᵧᵧ - (fₓᵧ)². D>0,fₓₓ>0 → min; D>0,fₓₓ<0 → max; D<0 → saddle",
            # Integration
            "Integral power rule: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C  (n ≠ -1)",
            "Fundamental Theorem: ∫ₐᵇ f(x)dx = F(b) - F(a)  where F'=f",
            "Integration by parts: ∫u dv = uv - ∫v du  (LIATE mnemonic)",
            "Common integrals: ∫sin dx = -cos+C, ∫eˣ dx = eˣ+C, ∫1/x dx = ln|x|+C, ∫sec² dx = tan+C",
            "Trigonometric substitution: √(a²-x²) → x=a sin θ; √(a²+x²) → x=a tan θ; √(x²-a²) → x=a sec θ",
            # Multivariable integrals
            "Double integral: ∬_R f(x,y) dA — compute as iterated integral",
            "Triple integral: ∭_V f(x,y,z) dV",
            "Jacobian (change of variables): dA = |J| du dv, where J=∂(x,y)/∂(u,v)",
            # Vector calculus
            "Divergence: div F = ∇·F = ∂P/∂x + ∂Q/∂y + ∂R/∂z",
            "Curl: curl F = ∇×F",
            "Green's theorem: ∮_C (P dx + Q dy) = ∬_D (∂Q/∂x - ∂P/∂y) dA",
            "Stokes' theorem: ∮_C F·dr = ∬_S (∇×F)·dS",
            "Divergence theorem: ∯_S F·dS = ∭_V (∇·F) dV",
            # Series
            "Taylor series: f(x) = Σ f⁽ⁿ⁾(a)/n! · (x-a)ⁿ",
            "Maclaurin (a=0): eˣ=Σxⁿ/n!, sin x=Σ(-1)ⁿx²ⁿ⁺¹/(2n+1)!, cos x=Σ(-1)ⁿx²ⁿ/(2n)!",
        ],
        "examples": [
            "Find the derivative of x² sin(x)",
            "Compute ∫x² dx",
            "Find all critical points of f(x,y) = x² + y² - 4x - 6y",
            "Evaluate the double integral ∬x²y dA over [0,1]×[0,2]",
            "Use Green's theorem to evaluate a line integral",
        ],
        "resources": [
            "Khan Academy — Calculus 1 & 2 (khanacademy.org/math/calculus-1)",
            "MIT OCW — 18.02 Multivariable Calculus (free video lectures)",
            "Paul's Online Math Notes (tutorial.math.lamar.edu) — thorough worked examples",
            "3Blue1Brown — Essence of Calculus (YouTube) — geometric intuition",
            "Study tip: master single-variable before multivariable; build geometric intuition first",
        ],
    },

    # -------------------------------------------------------------------------
    # LINEAR ALGEBRA
    # -------------------------------------------------------------------------
    "linear algebra": {
        "concept": (
            "Linear algebra studies vectors, vector spaces, and linear transformations "
            "represented as matrices. It is foundational for machine learning, computer "
            "graphics, physics, and virtually every area of applied mathematics."
        ),
        "formulas": [
            "Matrix multiplication: (AB)ᵢⱼ = Σₖ Aᵢₖ Bₖⱼ",
            "Determinant (2×2): det([[a,b],[c,d]]) = ad - bc",
            "Determinant (3×3): cofactor expansion along first row",
            "Inverse (2×2): A⁻¹ = (1/det A)·[[d,-b],[-c,a]]",
            "Eigenvalue equation: Av = λv  →  det(A - λI) = 0",
            "Characteristic polynomial: p(λ) = det(A - λI)",
            "Dot product: a·b = Σ aᵢbᵢ = |a||b|cos θ",
            "Cross product: a×b = (a₂b₃-a₃b₂, a₃b₁-a₁b₃, a₁b₂-a₂b₁)",
            "Rank-nullity: rank(A) + nullity(A) = n  (columns of A)",
            "Projection of v onto u: proj_u(v) = (v·u / u·u)·u",
            "Gram-Schmidt orthogonalisation: e₁=v₁/|v₁|, e₂=(v₂-proj_{e₁}v₂)/|…|, …",
            "Diagonalisation: A = PDP⁻¹ if A has n linearly independent eigenvectors",
            "Cayley-Hamilton: every matrix satisfies its own characteristic equation",
            "SVD: A = UΣVᵀ where U,V orthogonal, Σ diagonal with singular values",
        ],
        "examples": [
            "Find eigenvalues of [[2,1],[1,2]]",
            "Solve Ax = b using Gaussian elimination",
            "Compute the determinant of a 3×3 matrix",
            "Orthogonalise the basis {[1,1,0],[1,0,1],[0,1,1]} using Gram-Schmidt",
            "Diagonalise the matrix [[4,1],[2,3]]",
        ],
        "resources": [
            "3Blue1Brown — Essence of Linear Algebra (YouTube) — best geometric intuition",
            "Gilbert Strang — Introduction to Linear Algebra (MIT OCW 18.06)",
            "Khan Academy — Linear Algebra (khanacademy.org/math/linear-algebra)",
            "Study tip: visualise transformations as stretching/rotating space before doing the algebra",
        ],
    },

    # -------------------------------------------------------------------------
    # DIFFERENTIAL EQUATIONS (ODEs and PDEs)
    # -------------------------------------------------------------------------
    "differential equations": {
        "concept": (
            "Differential equations describe relationships between a function and its "
            "derivatives. Ordinary differential equations (ODEs) involve one variable; "
            "partial differential equations (PDEs) involve functions of several variables. "
            "They model heat conduction, wave propagation, fluid dynamics, and quantum mechanics."
        ),
        "formulas": [
            # ODEs
            "Separable ODE: dy/dx = f(x)g(y)  →  ∫dy/g(y) = ∫f(x)dx",
            "First-order linear: dy/dx + P(x)y = Q(x)  →  integrating factor μ = e^(∫P dx)",
            "Characteristic equation (2nd order): ar² + br + c = 0",
            "  Two real roots r₁,r₂:  y = C₁e^(r₁x) + C₂e^(r₂x)",
            "  Repeated root r:        y = (C₁ + C₂x)e^(rx)",
            "  Complex roots α±βi:     y = e^(αx)(C₁cos βx + C₂sin βx)",
            "Variation of parameters: particular solution for y''+py'+qy=g(x)",
            "Laplace transform: L{f(t)} = ∫₀^∞ e^(-st) f(t) dt",
            "Key Laplace pairs: L{1}=1/s, L{t}=1/s², L{eᵃᵗ}=1/(s-a), L{sin bt}=b/(s²+b²)",
            "Euler's method (numerical): yₙ₊₁ = yₙ + h·f(xₙ, yₙ)",
            # PDEs
            "Heat equation: ∂u/∂t = α² ∂²u/∂x²  (parabolic)",
            "Wave equation: ∂²u/∂t² = c² ∂²u/∂x²  (hyperbolic)",
            "Laplace equation: ∂²u/∂x² + ∂²u/∂y² = 0  (elliptic, steady-state)",
            "Separation of variables: assume u(x,t) = X(x)T(t), substitute, separate",
            "Fourier series: f(x) = a₀/2 + Σ(aₙcos(nπx/L) + bₙsin(nπx/L))",
        ],
        "examples": [
            "Solve dy/dx = 2xy",
            "Find the general solution of y'' - 3y' + 2y = 0",
            "Solve the IVP: y' = y,  y(0) = 1",
            "Use Laplace transforms to solve y'' + y = sin(t)",
            "Solve the heat equation with zero boundary conditions",
        ],
        "resources": [
            "Paul's Online Math Notes — Differential Equations (tutorial.math.lamar.edu)",
            "MIT OCW — 18.03 Differential Equations and 18.152 Intro to PDEs",
            "Khan Academy — Differential Equations",
            "Study tip: always classify the ODE type first (separable, linear, exact, Bernoulli)",
        ],
    },

    # -------------------------------------------------------------------------
    # STATISTICS & PROBABILITY
    # -------------------------------------------------------------------------
    "statistics": {
        "concept": (
            "Statistics and probability provide tools for collecting, analysing, and "
            "drawing conclusions from data, and for quantifying uncertainty. "
            "They underpin scientific research, machine learning, economics, and more."
        ),
        "formulas": [
            # Probability
            "P(A ∪ B) = P(A) + P(B) - P(A ∩ B)  (inclusion-exclusion)",
            "P(A | B) = P(A ∩ B) / P(B)  (conditional probability)",
            "Bayes' theorem: P(A|B) = P(B|A)·P(A) / P(B)",
            "P(A ∩ B) = P(A)·P(B)  iff A and B are independent",
            # Discrete distributions
            "Binomial: P(X=k) = C(n,k)·pᵏ·(1-p)^(n-k),  E[X]=np,  Var=np(1-p)",
            "Poisson: P(X=k) = e^(-λ)·λᵏ/k!,  E[X]=Var[X]=λ",
            "Geometric: P(X=k) = (1-p)^(k-1)·p,  E[X]=1/p",
            # Continuous distributions
            "Normal (Gaussian): f(x) = (1/σ√(2π)) exp(-(x-μ)²/2σ²)",
            "Exponential: f(x) = λe^(-λx),  E[X]=1/λ,  Var=1/λ²",
            # Statistics
            "Sample mean: x̄ = (1/n)Σxᵢ",
            "Sample variance: s² = (1/(n-1))Σ(xᵢ - x̄)²",
            "Standard error: SE = s/√n",
            "Z-score: Z = (X - μ)/σ",
            "95% confidence interval (known σ): x̄ ± 1.96·σ/√n",
            "t-test statistic: t = (x̄ - μ₀) / (s/√n)",
            "Linear regression: ŷ = β₀ + β₁x,  β₁ = Σ(xᵢ-x̄)(yᵢ-ȳ) / Σ(xᵢ-x̄)²",
            "Central Limit Theorem: for large n, X̄ ~ N(μ, σ²/n) regardless of underlying distribution",
        ],
        "examples": [
            "What is the probability of rolling a 6 twice in a row?",
            "Find the mean and variance of a Binomial(10, 0.3) distribution",
            "Compute a 95% confidence interval for a sample mean",
            "State and explain the Central Limit Theorem",
            "Run a t-test: is a sample mean significantly different from μ=50?",
        ],
        "resources": [
            "Khan Academy — Statistics & Probability (khanacademy.org/math/statistics-probability)",
            "StatQuest with Josh Starmer (YouTube) — intuitive explanations",
            "OpenIntro Statistics (free textbook at openintro.org)",
            "Study tip: simulate distributions in Python (numpy.random) to build intuition",
        ],
    },

    # -------------------------------------------------------------------------
    # GRAPH THEORY
    # -------------------------------------------------------------------------
    "graph theory": {
        "concept": (
            "Graph theory studies networks of vertices (nodes) connected by edges. "
            "It models relationships in computer networks, social networks, routing, "
            "scheduling, and many other domains. Graph theory bridges combinatorics, "
            "topology, and algorithm design."
        ),
        "formulas": [
            "Degree: deg(v) = number of edges incident to v",
            "Handshaking lemma: Σ deg(v) = 2|E|  (sum of all degrees = twice edge count)",
            "Simple graph edges: |E| ≤ n(n-1)/2 for n vertices",
            "Complete graph Kₙ: every pair of vertices connected, has n(n-1)/2 edges",
            "Euler path condition: exists iff graph is connected and has exactly 0 or 2 vertices of odd degree",
            "Euler circuit: exists iff connected and ALL vertices have even degree",
            "Hamiltonian path/cycle: visits every vertex exactly once (NP-complete to decide in general)",
            "Planar graph (Euler's formula): V - E + F = 2  (vertices, edges, faces)",
            "Planarity limit: |E| ≤ 3V - 6  for simple planar graphs; |E| ≤ 2V - 4 if no triangles",
            "Four-colour theorem: any planar map can be coloured with ≤ 4 colours",
            "Chromatic number χ(G): minimum colours to colour vertices so no two adjacent share a colour",
            "Bipartite graph: χ(G) ≤ 2; contains no odd cycles",
            "Dijkstra's algorithm: shortest path in a weighted graph with non-negative weights",
            "Kruskal's / Prim's: minimum spanning tree algorithms",
            "Adjacency matrix Aᵢⱼ = 1 if edge (i,j) exists, else 0",
            "Graph isomorphism: same structure, different labelling",
            "Tree: connected acyclic graph; exactly n-1 edges for n vertices",
        ],
        "examples": [
            "Find the chromatic number of K4",
            "Does K₅ have an Euler circuit?",
            "Show that K₃,₃ is non-planar using Euler's formula",
            "Apply Dijkstra's algorithm to find the shortest path",
            "Prove that a tree with n vertices has exactly n-1 edges",
        ],
        "resources": [
            "Introduction to Graph Theory — Douglas West (textbook)",
            "MIT OCW — 6.042J Mathematics for Computer Science (covers graph theory)",
            "Graph Theory by Diestel (free at diestel-graph-theory.com)",
            "Study tip: draw small examples — visualising graphs first makes proofs much clearer",
        ],
    },

    # -------------------------------------------------------------------------
    # REAL ANALYSIS
    # -------------------------------------------------------------------------
    "real analysis": {
        "concept": (
            "Real analysis is the rigorous foundation of calculus. It establishes precise "
            "definitions of limits, continuity, differentiability, and integration using "
            "ε-δ arguments and formal proof. It answers the 'why' behind calculus rules."
        ),
        "formulas": [
            "ε-δ limit definition: lim_{x→a} f(x) = L iff ∀ε>0 ∃δ>0: 0<|x-a|<δ → |f(x)-L|<ε",
            "Continuity at a: lim_{x→a} f(x) = f(a)",
            "Uniform continuity: ∀ε>0 ∃δ>0 ∀x,y: |x-y|<δ → |f(x)-f(y)|<ε  (δ independent of x)",
            "Differentiability: f'(a) = lim_{h→0} (f(a+h)-f(a))/h",
            "Mean Value Theorem: if f continuous on [a,b] and differentiable on (a,b), ∃c: f'(c)=(f(b)-f(a))/(b-a)",
            "Intermediate Value Theorem: if f continuous on [a,b] and f(a)<k<f(b), ∃c∈(a,b): f(c)=k",
            "Extreme Value Theorem: continuous f on compact [a,b] attains its max and min",
            "Riemann integral: ∫ₐᵇ f dx = lim_{|P|→0} Σ f(xᵢ*)·Δxᵢ",
            "Fundamental Theorem of Calculus: F'(x) = f(x) when F(x)=∫ₐˣ f(t)dt",
            "Cauchy sequence: (aₙ) is Cauchy iff ∀ε>0 ∃N: m,n>N → |aₙ-aₘ|<ε",
            "Completeness of ℝ: every Cauchy sequence in ℝ converges (ℝ is complete)",
            "Bolzano-Weierstrass: every bounded sequence in ℝⁿ has a convergent subsequence",
            "Series convergence tests: comparison, ratio, root, integral, alternating series",
            "Uniform convergence: fₙ → f uniformly iff sup_x |fₙ(x)-f(x)| → 0",
        ],
        "examples": [
            "Prove lim_{x→2} (3x+1) = 7 using ε-δ definition",
            "Show f(x) = x² is uniformly continuous on [0,1]",
            "Prove the Mean Value Theorem",
            "Show that the series Σ 1/n² converges using the integral test",
            "Prove that every convergent sequence is a Cauchy sequence",
        ],
        "resources": [
            "Walter Rudin — Principles of Mathematical Analysis (the classic reference)",
            "Abbott — Understanding Analysis (more accessible introduction)",
            "MIT OCW — 18.100 Real Analysis",
            "Study tip: write out ε-δ proofs slowly and always start from the definition",
        ],
    },

    # -------------------------------------------------------------------------
    # GEOMETRY & TRIGONOMETRY
    # -------------------------------------------------------------------------
    "geometry": {
        "concept": (
            "Geometry studies shapes, sizes, and properties of figures in space. "
            "Trigonometry studies relationships between angles and side lengths of triangles "
            "and extends to periodic functions fundamental to physics and engineering."
        ),
        "formulas": [
            # Trig identities
            "Pythagorean: sin²θ + cos²θ = 1,  1+tan²θ=sec²θ,  1+cot²θ=csc²θ",
            "Sum formulas: sin(A±B)=sinAcosB±cosAsinB,  cos(A±B)=cosAcosB∓sinAsinB",
            "Double angle: sin(2θ)=2sinθcosθ,  cos(2θ)=cos²θ-sin²θ=1-2sin²θ=2cos²θ-1",
            "Half angle: sin²θ=(1-cos2θ)/2,  cos²θ=(1+cos2θ)/2",
            "Law of sines: a/sinA = b/sinB = c/sinC",
            "Law of cosines: c² = a² + b² - 2ab cosC",
            # Circle & areas
            "Circle: area = πr², circumference = 2πr",
            "Arc length: s = rθ  (θ in radians)",
            "Sector area: A = ½r²θ",
            "Ellipse: area = πab  (semi-axes a, b)",
            # 3D
            "Sphere: V=(4/3)πr³, A=4πr²",
            "Cylinder: V=πr²h, lateral A=2πrh",
            "Cone: V=(1/3)πr²h, lateral A=πrl  (l=slant height)",
            # Coordinates
            "Distance: d = √((x₂-x₁)²+(y₂-y₁)²)",
            "Midpoint: ((x₁+x₂)/2, (y₁+y₂)/2)",
            "Polar: x=r cosθ, y=r sinθ, r=√(x²+y²)",
        ],
        "examples": [
            "Find all angles in [0,2π) satisfying sin(x) = √3/2",
            "Prove the Pythagorean theorem",
            "Find the area of a triangle with sides 5, 7, 10 using Heron's formula",
            "Simplify cos(2x) - cos(x) using trig identities",
            "Convert the polar equation r = 2cosθ to Cartesian form",
        ],
        "resources": [
            "Khan Academy — Geometry & Trigonometry",
            "Paul's Online Math Notes — Trig (tutorial.math.lamar.edu)",
            "Study tip: the unit circle is worth memorising completely — it makes everything faster",
        ],
    },

    # -------------------------------------------------------------------------
    # COMPLEX ANALYSIS
    # -------------------------------------------------------------------------
    "complex analysis": {
        "concept": (
            "Complex analysis studies functions of complex numbers. It reveals deep and "
            "elegant results: analytic functions obey far stronger constraints than real "
            "differentiable functions. Key applications include contour integration, "
            "Fourier/Laplace transforms, and signal processing."
        ),
        "formulas": [
            "Complex number: z = a + bi,  |z| = √(a²+b²),  arg(z) = arctan(b/a)",
            "Euler's formula: e^(iθ) = cosθ + i sinθ",
            "De Moivre: (cosθ + i sinθ)ⁿ = cos(nθ) + i sin(nθ)",
            "Complex conjugate: z̄ = a - bi,  |z|² = z·z̄",
            "Cauchy-Riemann equations: ∂u/∂x = ∂v/∂y  and  ∂u/∂y = -∂v/∂x  (for f=u+iv analytic)",
            "Cauchy's integral theorem: ∮_C f(z) dz = 0  if f analytic on and inside C",
            "Cauchy's integral formula: f(z₀) = (1/2πi) ∮_C f(z)/(z-z₀) dz",
            "Residue theorem: ∮_C f(z) dz = 2πi Σ Res(f, zₖ)  (sum over poles inside C)",
            "Laurent series: f(z) = Σₙ cₙ(z-z₀)ⁿ  (extends Taylor to include negative powers)",
            "Simple pole residue: Res(f,z₀) = lim_{z→z₀} (z-z₀)f(z)",
            "nth-order pole residue: (1/(n-1)!) · lim d^(n-1)/dz^(n-1) [(z-z₀)ⁿ f(z)]",
        ],
        "examples": [
            "Find all values of i^i",
            "Use the residue theorem to evaluate ∫_{-∞}^{∞} 1/(x²+1) dx",
            "Show that f(z) = |z|² is not analytic anywhere except z=0",
            "Find the Laurent series of 1/(z(z-1)) around z=0",
            "Evaluate the contour integral ∮ e^z/(z²+1) dz",
        ],
        "resources": [
            "Visual Complex Analysis — Tristan Needham (excellent geometric approach)",
            "MIT OCW — 18.04 Complex Variables with Applications",
            "Brown & Churchill — Complex Variables and Applications (standard textbook)",
            "Study tip: always sketch the contour and locate poles before computing residues",
        ],
    },

    # -------------------------------------------------------------------------
    # NUMBER THEORY
    # -------------------------------------------------------------------------
    "number theory": {
        "concept": (
            "Number theory studies the properties of integers. It explores divisibility, "
            "primes, modular arithmetic, and Diophantine equations. Despite simple statements, "
            "number theory contains some of mathematics' deepest theorems (Fermat's Last Theorem, "
            "Riemann Hypothesis) and underlies modern cryptography."
        ),
        "formulas": [
            "Division algorithm: ∀a,b (b>0) ∃ unique q,r: a = bq + r,  0 ≤ r < b",
            "GCD: gcd(a,b) = gcd(b, a mod b)  (Euclidean algorithm)",
            "Bézout's identity: ∃x,y: gcd(a,b) = ax + by",
            "Modular arithmetic: a ≡ b (mod n) iff n | (a-b)",
            "Fermat's Little Theorem: if p prime and p∤a, then aᵖ⁻¹ ≡ 1 (mod p)",
            "Euler's theorem: a^φ(n) ≡ 1 (mod n)  when gcd(a,n)=1",
            "Euler's totient: φ(n) = n·∏_{p|n}(1 - 1/p)",
            "Chinese Remainder Theorem: system of congruences with pairwise coprime moduli has unique solution mod ∏mᵢ",
            "Wilson's theorem: (p-1)! ≡ -1 (mod p) iff p is prime",
            "Fundamental theorem of arithmetic: every integer > 1 is a unique product of primes",
            "Infinitely many primes: Euclid's proof by contradiction",
            "Prime Number Theorem: π(x) ~ x/ln(x)  (density of primes)",
            "Quadratic residue: a is a QR mod p iff a^((p-1)/2) ≡ 1 (mod p)  (Euler's criterion)",
        ],
        "examples": [
            "Find gcd(252, 198) using the Euclidean algorithm",
            "Prove there are infinitely many primes",
            "Solve 3x ≡ 7 (mod 11)",
            "Use Fermat's Little Theorem to compute 2¹⁰⁰ mod 13",
            "Find all integer solutions to 3x + 5y = 1",
        ],
        "resources": [
            "An Introduction to the Theory of Numbers — Hardy & Wright",
            "Elementary Number Theory — David Burton",
            "MIT OCW — 18.781 Theory of Numbers",
            "Study tip: practice the Euclidean algorithm until it becomes automatic — it underlies everything",
        ],
    },

    # -------------------------------------------------------------------------
    # DISCRETE MATHEMATICS & PROOF THEORY / LOGIC
    # -------------------------------------------------------------------------
    "discrete mathematics": {
        "concept": (
            "Discrete mathematics covers structures that are fundamentally countable or finite: "
            "logic, set theory, combinatorics, proof techniques, and recursion. "
            "Proof theory studies formal systems for deriving mathematical truths. "
            "Together these form the foundation of theoretical computer science and formal verification."
        ),
        "formulas": [
            # Logic
            "Tautology: always true (e.g. P ∨ ¬P)",
            "Contrapositive: (P → Q) ≡ (¬Q → ¬P)",
            "De Morgan's laws: ¬(P ∧ Q) ≡ ¬P ∨ ¬Q;  ¬(P ∨ Q) ≡ ¬P ∧ ¬Q",
            "Modus ponens: P, P→Q ⊢ Q",
            "Modus tollens: ¬Q, P→Q ⊢ ¬P",
            # Set theory
            "Set operations: A∪B, A∩B, A\\B, Aᶜ, A×B",
            "|A∪B| = |A| + |B| - |A∩B|  (inclusion-exclusion)",
            "Power set: |P(A)| = 2^|A|",
            "Cartesian product: |A×B| = |A|·|B|",
            # Combinatorics
            "Permutations: P(n,k) = n!/(n-k)!  ordered selections",
            "Combinations: C(n,k) = n!/k!(n-k)!  unordered selections",
            "Binomial theorem: (a+b)ⁿ = Σ C(n,k) aⁿ⁻ᵏ bᵏ",
            "Stars and bars: distribute n identical items into k bins: C(n+k-1, k-1)",
            "Pigeonhole principle: if n+1 pigeons in n holes, some hole has ≥2 pigeons",
            # Proof techniques
            "Direct proof: assume hypotheses, derive conclusion by logical steps",
            "Proof by contradiction: assume ¬conclusion, derive a contradiction",
            "Proof by contrapositive: prove ¬Q → ¬P instead of P → Q",
            "Mathematical induction: (i) base case; (ii) inductive step P(k)→P(k+1)",
            "Strong induction: assume P(1),…,P(k) to prove P(k+1)",
            "Proof by cases: verify all possible cases exhaustively",
            # Recursion & relations
            "Recurrence solving: find homogeneous + particular solution, then apply initial conditions",
            "Master theorem: T(n)=aT(n/b)+f(n) — compares f(n) to n^(log_b a)",
        ],
        "examples": [
            "Prove √2 is irrational by contradiction",
            "Prove by induction that Σᵢ₌₁ⁿ i = n(n+1)/2",
            "How many ways can 5 books be arranged on a shelf?",
            "Use inclusion-exclusion to count integers ≤ 100 divisible by 2 or 3",
            "Prove the Pigeonhole principle formally",
        ],
        "resources": [
            "Discrete Mathematics and Its Applications — Kenneth Rosen (standard textbook)",
            "How to Prove It — Daniel Velleman (excellent for proof writing)",
            "MIT OCW — 6.042J Mathematics for Computer Science (free, comprehensive)",
            "Study tip: for proofs, always write 'assume…' and 'then…' explicitly to build logical habit",
        ],
    },

    # -------------------------------------------------------------------------
    # ABSTRACT ALGEBRA
    # -------------------------------------------------------------------------
    "abstract algebra": {
        "concept": (
            "Abstract algebra studies algebraic structures — groups, rings, and fields — "
            "defined by axioms rather than specific numbers. It unifies diverse areas of "
            "mathematics and underlies modern cryptography (elliptic curves, RSA), "
            "coding theory, and Galois theory (why the quintic has no general formula)."
        ),
        "formulas": [
            # Groups
            "Group axioms: closure, associativity, identity (e: ae=ea=a), inverses (aa⁻¹=e)",
            "Abelian (commutative) group: additionally ab = ba",
            "Order of element g: smallest n>0 such that gⁿ = e",
            "Lagrange's theorem: |H| divides |G| for any subgroup H ≤ G",
            "Cosets: left coset gH = {gh : h ∈ H}",
            "Normal subgroup: N ◁ G iff gNg⁻¹ = N for all g∈G",
            "Quotient group: G/N with operation (aN)(bN) = (ab)N",
            "First Isomorphism Theorem: G/ker(φ) ≅ im(φ)  for homomorphism φ:G→H",
            "Cyclic group: generated by one element; ℤₙ, (ℤ,+), (U(n),·)",
            # Rings & Fields
            "Ring axioms: (R,+) abelian group, (R,·) monoid, distributivity",
            "Integral domain: commutative ring with no zero divisors",
            "Field: integral domain where every nonzero element has a multiplicative inverse",
            "Field extension: [F(α):F] = degree of minimal polynomial of α over F",
            "Fermat's Little Theorem (abstract): in Z/pZ, aᵖ = a for all a",
        ],
        "examples": [
            "Prove that (ℤ₆, +) is a group",
            "Find all subgroups of ℤ₁₂",
            "State and prove Lagrange's theorem",
            "Show that Z[√-5] is not a unique factorisation domain",
            "Classify all groups of order 4",
        ],
        "resources": [
            "Abstract Algebra — Dummit & Foote (comprehensive graduate reference)",
            "A First Course in Abstract Algebra — Fraleigh (accessible undergraduate text)",
            "Visual Group Theory (YouTube) — Nathan Carter",
            "Study tip: build up from small concrete groups (Z₂, Z₃, S₃) before tackling abstractions",
        ],
    },
}


def get_knowledge(topic: str) -> dict:
    """
    Retrieve the knowledge base entry for a given topic.

    Args:
        topic: One of the supported topic strings.

    Returns:
        A dict with keys: concept, formulas, examples, resources.
        Falls back to algebra if topic is unknown.
    """
    return KNOWLEDGE_BASE.get(topic, KNOWLEDGE_BASE["algebra"])


def format_knowledge_for_prompt(topic: str) -> str:
    """
    Format retrieved knowledge into a concise string for injection
    into the LLM system prompt.

    Args:
        topic: Math topic string.

    Returns:
        A formatted multi-line string ready to embed in a prompt.
    """
    kb = get_knowledge(topic)

    formulas_text = "\n".join(f"  • {f}" for f in kb["formulas"])
    resources_text = "\n".join(f"  • {r}" for r in kb["resources"])

    return (
        f"TOPIC: {topic.title()}\n\n"
        f"CONCEPT OVERVIEW:\n{kb['concept']}\n\n"
        f"RELEVANT FORMULAS:\n{formulas_text}\n\n"
        f"STUDY RESOURCES:\n{resources_text}"
    )
