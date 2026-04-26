"""
topic_classifier.py

Classifies a math problem into one of the supported topics using keyword matching.
Topics are checked in priority order — more specific topics are listed first
so they win over broader ones when a problem could match multiple categories.

Supported topics:
  differential equations  ·  real analysis  ·  complex analysis
  abstract algebra        ·  number theory  ·  graph theory
  discrete mathematics    ·  linear algebra ·  statistics
  calculus                ·  geometry       ·  algebra  (default)

Connects to:
  knowledge_base.py → used to retrieve the right formulas/explanations
  solver.py         → topic is passed into the LLM system prompt
"""

import re

# Topics are evaluated in this order — put most specific first to avoid
# broad topics (like "algebra") swallowing problems that belong elsewhere.
TOPIC_KEYWORDS: list[tuple[str, list[str]]] = [
    # --- Differential Equations (before calculus — shares derivative keywords) ---
    ("differential equations", [
        "differential equation", "dy/dx", "d²y", "d^2y", "ode", "pde",
        "initial value problem", "boundary value", "boundary condition",
        "separable equation", "homogeneous ode", "particular solution", "general solution",
        "laplace transform", "first order ode", "second order linear",
        "heat equation", "wave equation", "laplace equation", "poisson equation",
        "fourier series", "separation of variables", "integrating factor",
        "variation of parameters", "euler's method", "characteristic equation",
    ]),

    # --- Real Analysis (before calculus — shares limit/integral keywords) ---
    ("real analysis", [
        "epsilon delta", "ε-δ", "epsilon-delta", "cauchy sequence",
        "uniform continuity", "uniform convergence", "pointwise convergence",
        "bolzano-weierstrass", "completeness", "least upper bound",
        "supremum", "infimum", "limsup", "liminf",
        "riemann integrable", "measure zero", "open set", "closed set",
        "compact", "heine-borel", "monotone convergence", "dominated convergence",
        "intermediate value theorem", "mean value theorem proof",
        "fundamental theorem of calculus proof",
    ]),

    # --- Complex Analysis ---
    ("complex analysis", [
        "complex number", "complex plane", "imaginary unit", "real part", "imaginary part",
        "modulus", "argument of z", "complex conjugate", "polar form",
        "analytic function", "holomorphic", "cauchy-riemann",
        "cauchy's theorem", "cauchy integral", "contour integral", "residue",
        "laurent series", "singularity", "pole", "essential singularity",
        "residue theorem", "conformal mapping", "mobius transformation",
        "euler's formula", "de moivre",
    ]),

    # --- Abstract Algebra ---
    ("abstract algebra", [
        "group theory", "subgroup", "normal subgroup", "coset", "quotient group",
        "homomorphism", "isomorphism", "kernel", "image of homomorphism",
        "cyclic group", "symmetric group", "permutation group", "dihedral group",
        "ring theory", "ideal", "quotient ring", "ring homomorphism",
        "field theory", "field extension", "galois theory", "galois group",
        "lagrange's theorem", "lagrange theorem", "sylow", "abelian group", "group axioms",
        "classify groups", "group of order", "prime order group", "prime order",
        "integral domain", "unique factorisation",
    ]),

    # --- Number Theory ---
    ("number theory", [
        "prime number", "prime factorisation", "prime factorization",
        "divisibility", "gcd", "lcm", "greatest common divisor",
        "euclidean algorithm", "bezout", "modular arithmetic", "congruence",
        "fermat's little theorem", "euler's theorem", "totient", "phi function",
        "chinese remainder theorem", "diophantine", "quadratic residue",
        "legendre symbol", "primitive root", "wilson's theorem",
        "infinitely many primes", "fundamental theorem of arithmetic",
    ]),

    # --- Graph Theory ---
    ("graph theory", [
        "graph", "vertex", "vertices", "edge", "node", "adjacency",
        "degree of vertex", "handshaking lemma", "eulerian", "hamiltonian",
        "chromatic number", "graph colouring", "planar graph", "euler's formula",
        "bipartite", "tree", "spanning tree", "minimum spanning tree",
        "dijkstra", "breadth-first", "depth-first", "connected component",
        "strongly connected", "topological sort", "directed graph", "digraph",
        "complete graph", "cycle graph", "path graph",
    ]),

    # --- Discrete Mathematics / Logic / Proof Theory ---
    ("discrete mathematics", [
        "proof by induction", "strong induction", "mathematical induction",
        "proof by contradiction", "proof by contrapositive", "direct proof",
        "vacuous proof", "pigeonhole principle", "combinatorics",
        "permutation", "combination", "binomial coefficient",
        "inclusion-exclusion", "generating function", "recurrence relation",
        "master theorem", "set theory", "power set", "cartesian product",
        "propositional logic", "predicate logic", "tautology", "contradiction",
        "de morgan", "modus ponens", "modus tollens", "quantifier",
        "prove that", "show that", "disprove", "counterexample", "irrational",
        "stars and bars", "formal language", "automata",
    ]),

    # --- Statistics & Probability ---
    ("statistics", [
        "probability", "random variable", "expected value", "variance",
        "standard deviation", "normal distribution", "binomial distribution",
        "poisson distribution", "exponential distribution", "uniform distribution",
        "hypothesis test", "p-value", "confidence interval", "t-test", "z-test",
        "anova", "chi-square", "regression", "correlation", "bayes",
        "conditional probability", "independence", "central limit theorem",
        "law of large numbers", "sample mean", "sample variance",
        "probability density", "cumulative distribution",
    ]),

    # --- Linear Algebra ---
    ("linear algebra", [
        "matrix", "matrices", "vector space", "eigenvalue", "eigenvector",
        "determinant", "inverse matrix", "transpose", "rank", "nullspace",
        "span", "basis", "linear transformation", "dot product",
        "cross product", "orthogonal", "projection", "diagonalise",
        "row reduce", "gaussian elimination", "lu decomposition",
        "gram-schmidt", "singular value decomposition", "svd",
        "system of equations", "augmented matrix", "row echelon",
    ]),

    # --- Calculus (single & multivariable) ---
    ("calculus", [
        "derivative", "differentiate", "integral", "integrate", "limit",
        "continuity", "chain rule", "product rule", "quotient rule",
        "fundamental theorem", "area under", "riemann sum", "antiderivative",
        "partial derivative", "gradient", "divergence", "curl",
        "double integral", "triple integral", "jacobian", "stokes",
        "green's theorem", "divergence theorem", "line integral",
        "surface integral", "taylor series", "maclaurin", "l'hopital",
        "inflection point", "concave", "d/dx", "∫", "lim",
        "critical point", "saddle point", "lagrange multiplier",
    ]),

    # --- Geometry & Trigonometry ---
    ("geometry", [
        "triangle", "circle", "polygon", "angle", "perimeter", "area of",
        "volume of", "surface area", "pythagoras", "pythagorean theorem",
        "sine", "cosine", "tangent", "sin", "cos", "tan",
        "trigonometric identity", "law of sines", "law of cosines",
        "unit circle", "radian", "degree", "arc length", "sector",
        "congruent", "similar", "parallel", "perpendicular",
        "coordinate geometry", "distance formula", "midpoint",
        "polar coordinates", "ellipse", "parabola equation",
    ]),

    # --- Algebra (broad, goes last as the default catch-all for equations) ---
    ("algebra", [
        "solve", "factor", "expand", "simplify", "equation", "polynomial",
        "quadratic", "linear equation", "inequality", "expression",
        "roots", "zeros", "vertex", "exponent", "logarithm",
        "log", "ln", "absolute value", "rational expression",
        "domain", "range", "intercept", "function",
    ]),
]

# Fallback when nothing matches
DEFAULT_TOPIC = "algebra"


# Cache compiled patterns so we don't rebuild them on every call.
_PATTERN_CACHE: dict[str, re.Pattern] = {}


def _compile(keyword: str) -> re.Pattern:
    """
    Build a pattern that matches ``keyword`` only when it is not immediately
    surrounded by ASCII letters. This is a looser, more tolerant version of
    \b that still works for keywords containing non-ASCII math symbols.
    """
    esc = re.escape(keyword)
    return re.compile(r'(?<![a-z])' + esc + r's?(?![a-z])')


def _match(keyword: str, text_lower: str) -> bool:
    pat = _PATTERN_CACHE.get(keyword)
    if pat is None:
        pat = _compile(keyword)
        _PATTERN_CACHE[keyword] = pat
    return pat.search(text_lower) is not None


def classify_topic(problem: str) -> str:
    """
    Identify the math topic from the problem text.

    Args:
        problem: The raw user-entered math problem string.

    Returns:
        The matched topic string, or 'algebra' as the default fallback.
    """
    problem_lower = problem.lower()

    for topic, keywords in TOPIC_KEYWORDS:
        for keyword in keywords:
            if _match(keyword, problem_lower):
                return topic

    return DEFAULT_TOPIC


def get_topic_display_name(topic: str) -> str:
    """Return a nicely formatted display name for the topic."""
    return topic.title()


def get_all_topics() -> list[str]:
    """Return a list of all supported topic strings."""
    return [topic for topic, _ in TOPIC_KEYWORDS]
