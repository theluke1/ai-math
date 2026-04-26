"""
visualizer.py

Generates matplotlib figures for math problems that involve a plottable expression.

The LLM in solver.py returns a `plot_expression` field when it detects that
a graph would be useful. This module receives that expression and returns
a matplotlib Figure object (or None if plotting is not appropriate or fails).

Connects to:
  - solver.py  → provides the plot_expression string
  - app.py     → receives the Figure and renders it with st.pyplot()
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib
from typing import Optional

# Use non-interactive backend — required for Streamlit
matplotlib.use("Agg")


# ---------------------------------------------------------------------------
# Colour palette (matches a clean, modern look)
# ---------------------------------------------------------------------------
PLOT_COLOR    = "#4F8EF7"   # Blue for the function curve
FILL_COLOR    = "#4F8EF7"   # Matching fill for area-under-curve
GRID_COLOR    = "#E5E7EB"   # Light gray grid
BG_COLOR      = "#FFFFFF"   # White background
AXIS_COLOR    = "#374151"   # Dark gray axes


def _safe_eval_expression(expr: str, x: np.ndarray) -> Optional[np.ndarray]:
    """
    Safely evaluate a numpy expression string over x values.

    Only numpy functions are available in the eval namespace.
    Returns None if evaluation fails (bad expression, domain error, etc.).
    """
    namespace = {
        "x": x,
        "np": np,
        # Expose common numpy functions directly so expressions like
        # "sin(x)" work without "np." prefix
        "sin": np.sin,  "cos": np.cos,   "tan": np.tan,
        "exp": np.exp,  "log": np.log,   "log2": np.log2,
        "log10": np.log10, "sqrt": np.sqrt, "abs": np.abs,
        "pi": np.pi,    "e": np.e,
        "arcsin": np.arcsin, "arccos": np.arccos, "arctan": np.arctan,
        "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
    }
    try:
        y = eval(expr, {"__builtins__": {}}, namespace)  # noqa: S307
        y = np.asarray(y, dtype=float)
        # Replace infinities and very large values with NaN so they don't distort the plot
        y[~np.isfinite(y)] = np.nan
        return y
    except Exception:
        return None


def generate_plot(
    expression: str,
    x_min: float = -10.0,
    x_max: float = 10.0,
    n_points: int = 500,
    title: str = "",
    shade_area: bool = False,
    shade_a: float = 0.0,
    shade_b: float = 1.0,
) -> Optional[plt.Figure]:
    """
    Generate a matplotlib Figure for a given expression f(x).

    Args:
        expression:  Python/numpy-compatible expression string, e.g. "x**2 + 3*x - 5".
        x_min:       Left bound of the x-axis.
        x_max:       Right bound of the x-axis.
        n_points:    Number of sample points (higher = smoother curve).
        title:       Optional plot title shown above the graph.
        shade_area:  If True, shade the area under the curve between shade_a and shade_b.
        shade_a:     Left bound for area shading.
        shade_b:     Right bound for area shading.

    Returns:
        A matplotlib Figure, or None if the expression cannot be plotted.
    """
    if not expression:
        return None

    x = np.linspace(x_min, x_max, n_points)
    y = _safe_eval_expression(expression, x)

    if y is None or np.all(np.isnan(y)):
        return None

    # --- Build figure ---
    fig, ax = plt.subplots(figsize=(8, 4.5))
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)

    # Plot the main curve
    ax.plot(x, y, color=PLOT_COLOR, linewidth=2.2, label=f"f(x) = {expression}")

    # Optional shaded area (useful for integrals)
    if shade_area:
        x_fill = np.linspace(shade_a, shade_b, n_points)
        y_fill = _safe_eval_expression(expression, x_fill)
        if y_fill is not None:
            ax.fill_between(
                x_fill, y_fill, alpha=0.25, color=FILL_COLOR,
                label=f"Area [{shade_a}, {shade_b}]"
            )

    # Axes through origin
    ax.axhline(0, color=AXIS_COLOR, linewidth=0.8, linestyle="-")
    ax.axvline(0, color=AXIS_COLOR, linewidth=0.8, linestyle="-")

    # Grid
    ax.grid(True, color=GRID_COLOR, linewidth=0.8, linestyle="--")
    ax.set_axisbelow(True)

    # Labels
    ax.set_xlabel("x", fontsize=12, color=AXIS_COLOR)
    ax.set_ylabel("f(x)", fontsize=12, color=AXIS_COLOR)
    ax.tick_params(colors=AXIS_COLOR)
    for spine in ax.spines.values():
        spine.set_edgecolor(GRID_COLOR)

    # Clip extreme y values for readability (keep within 5× the IQR)
    y_finite = y[np.isfinite(y)]
    if len(y_finite) > 0:
        q1, q3 = np.percentile(y_finite, [10, 90])
        iqr = q3 - q1
        margin = max(iqr * 3, 5)
        ax.set_ylim(q1 - margin, q3 + margin)

    if title:
        ax.set_title(title, fontsize=13, color=AXIS_COLOR, pad=10)

    ax.legend(fontsize=10, framealpha=0.8)
    plt.tight_layout()

    return fig


def should_plot(plot_expression: Optional[str]) -> bool:
    """Return True if a plot_expression is present and non-empty."""
    if not plot_expression:
        return False
    expr = plot_expression.strip()
    if not expr:
        return False
    return expr.lower() != "null"
