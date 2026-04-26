"""
app.py  —  Math Learning Assistant (Streamlit UI)

Entry point for the application. Run with:
    streamlit run app.py

Architecture flow:
  User input → topic_classifier → knowledge_base → solver (LLM) → visualizer → display
"""

import streamlit as st

from utils import load_env_file, sanitize_input, is_valid_input, format_formulas_as_list
from topic_classifier import classify_topic, get_topic_display_name
from knowledge_base import get_knowledge
from solver import solve
from visualizer import generate_plot, should_plot


# ---------------------------------------------------------------------------
# Bootstrap — load .env before anything tries to read the API key
# ---------------------------------------------------------------------------
load_env_file(".env")


# ---------------------------------------------------------------------------
# Page configuration
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="AI Math Learning Assistant",
    page_icon="📐",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Custom CSS — clean, readable styling
# ---------------------------------------------------------------------------
st.markdown("""
<style>
/* Main header */
.main-title {
    font-size: 2.4rem;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 0.2rem;
}
.subtitle {
    font-size: 1.05rem;
    color: #64748b;
    margin-bottom: 1.8rem;
}

/* Section cards */
.section-card {
    background: #f8fafc;
    border-left: 4px solid #4F8EF7;
    border-radius: 6px;
    padding: 1rem 1.2rem;
    margin-bottom: 1rem;
}
.section-label {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #4F8EF7;
    margin-bottom: 0.3rem;
}
.section-body {
    color: #1e293b;
    font-size: 0.97rem;
    line-height: 1.6;
}

/* Topic badge */
.topic-badge {
    display: inline-block;
    background: #dbeafe;
    color: #1d4ed8;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    margin-bottom: 1.2rem;
}

/* Hint box */
.hint-box {
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    border-radius: 6px;
    padding: 1rem 1.2rem;
    margin-bottom: 1rem;
}

/* Study next box */
.study-box {
    background: #f0fdf4;
    border-left: 4px solid #22c55e;
    border-radius: 6px;
    padding: 1rem 1.2rem;
    margin-bottom: 1rem;
}
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("## ⚙️ Settings")

    model_choice = st.selectbox(
        "LLM Model",
        options=["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        index=0,
        help="llama-3.3-70b-versatile is best for complex problems. 8b-instant is faster.",
    )

    st.markdown("---")
    st.markdown("### 📚 Supported Topics")
    topics = [
        "🔢 Algebra",
        "∫ Calculus",
        "🔷 Linear Algebra",
        "📊 Statistics & Probability",
        "🌀 Differential Equations",
        "🕸️ Graph Theory",
        "🔬 Real Analysis",
        "📐 Geometry & Trigonometry",
        "🔵 Complex Analysis",
        "🔢 Number Theory",
        "📝 Discrete Math & Logic",
        "🧮 Abstract Algebra",
    ]
    for t in topics:
        st.markdown(f"- {t}")

    st.markdown("---")
    st.markdown("### 💡 Example Problems")
    examples = [
        "Solve 2x² + 3x - 5 = 0",
        "Find the derivative of x² sin(x)",
        "Compute ∫ x² dx",
        "Find the eigenvalues of [[2,1],[1,2]]",
        "Solve dy/dx = 2xy",
        "Find the chromatic number of K4",
        "Prove that √2 is irrational",
        "What is the central limit theorem?",
    ]
    for ex in examples:
        st.markdown(f"- _{ex}_")

    st.markdown("---")
    st.caption("Built with Streamlit · OpenAI · matplotlib")


# ---------------------------------------------------------------------------
# Main content
# ---------------------------------------------------------------------------
st.markdown('<div class="main-title">📐 AI Math Learning Assistant</div>', unsafe_allow_html=True)
st.markdown(
    '<div class="subtitle">Enter any math problem and get a clear explanation, '
    'a helpful hint, and a full step-by-step solution.</div>',
    unsafe_allow_html=True,
)

# Input area
problem_input = st.text_area(
    label="Enter your math problem",
    placeholder="e.g.  Solve 2x² + 3x - 5 = 0   or   Find the derivative of x² sin(x)",
    height=100,
    label_visibility="collapsed",
)

col_btn, col_clear = st.columns([1, 6])
with col_btn:
    solve_clicked = st.button("🔍 Solve", type="primary", use_container_width=True)
with col_clear:
    if st.button("Clear", use_container_width=False):
        st.rerun()


# ---------------------------------------------------------------------------
# Core pipeline — runs when the user clicks Solve
# ---------------------------------------------------------------------------
if solve_clicked:
    # 1. Validate input
    cleaned = sanitize_input(problem_input)
    valid, error_msg = is_valid_input(cleaned)
    if not valid:
        st.error(f"⚠️ {error_msg}")
        st.stop()

    # 2. Classify topic
    topic = classify_topic(cleaned)
    display_name = get_topic_display_name(topic)

    st.markdown(f'<div class="topic-badge">🏷️ Topic detected: {display_name}</div>', unsafe_allow_html=True)

    # 3. Call LLM solver (show spinner while waiting)
    with st.spinner("Solving your problem…"):
        try:
            result = solve(cleaned, topic, model=model_choice)
        except EnvironmentError as e:
            st.error(
                f"**API key not found.**\n\n"
                f"Add your Groq API key to a `.env` file:\n```\nGROQ_API_KEY=gsk-...\n```\n\n"
                f"Get a free key at https://console.groq.com\n\nDetails: {e}"
            )
            st.stop()
        except Exception as e:
            st.error(f"Something went wrong while calling the LLM:\n\n{e}")
            st.stop()

    # 4. Display results
    st.markdown("---")

    # -- Concept explanation --
    st.markdown(
        f'<div class="section-card">'
        f'<div class="section-label">💡 Concept</div>'
        f'<div class="section-body">{result["concept_explanation"]}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # -- Relevant formulas --
    formulas_md = format_formulas_as_list(result.get("relevant_formulas", []))
    st.markdown(
        f'<div class="section-card">'
        f'<div class="section-label">📋 Relevant Formulas</div>'
        f'<div class="section-body">{formulas_md}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # -- Hint --
    st.markdown(
        f'<div class="hint-box">'
        f'<div class="section-label" style="color:#d97706;">🔑 Hint</div>'
        f'<div class="section-body">{result["hint"]}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # -- Full solution (use expander to keep the page from becoming overwhelming) --
    with st.expander("📖 Full Step-by-Step Solution", expanded=True):
        st.markdown(result["step_by_step_solution"])

    # -- What to study next --
    st.markdown(
        f'<div class="study-box">'
        f'<div class="section-label" style="color:#16a34a;">🚀 What to Study Next</div>'
        f'<div class="section-body">{result["what_to_study_next"]}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # -- Knowledge base resources --
    kb = get_knowledge(topic)
    with st.expander("📚 Recommended Resources", expanded=False):
        for resource in kb["resources"]:
            st.markdown(f"- {resource}")

    # 5. Visualisation
    st.markdown("---")
    plot_expr = result.get("plot_expression")

    if should_plot(plot_expr):
        st.markdown("### 📈 Visualisation")

        # Detect if this looks like an integral problem for area shading
        import re as _re
        problem_lower = cleaned.lower()
        is_integral = any(w in problem_lower for w in ["integral", "integrate", "∫", "area under"])

        with st.spinner("Generating plot…"):
            if is_integral:
                # Try to pull "from a to b" bounds out of the problem text.
                shade_a, shade_b = 0.0, 3.0
                m = _re.search(
                    r"from\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)",
                    problem_lower,
                )
                if m:
                    shade_a, shade_b = float(m.group(1)), float(m.group(2))
                    if shade_a > shade_b:
                        shade_a, shade_b = shade_b, shade_a
                # Zoom the x-window around the integration interval so the
                # shaded area isn't lost in an auto-scaled y-range.
                span = shade_b - shade_a
                margin = max(abs(span) * 0.5, 1.0)
                fig = generate_plot(
                    plot_expr,
                    title=f"f(x) = {plot_expr}",
                    x_min=shade_a - margin,
                    x_max=shade_b + margin,
                    shade_area=True,
                    shade_a=shade_a,
                    shade_b=shade_b,
                )
            else:
                fig = generate_plot(plot_expr, title=f"f(x) = {plot_expr}")

        if fig is not None:
            st.pyplot(fig)
            st.caption(
                f"Graph of f(x) = `{plot_expr}` · "
                "Tip: you can use the settings panel to change the model if results seem off."
            )
        else:
            st.info("ℹ️ Could not generate a plot for this expression.")
    else:
        st.info("ℹ️ No visualisation available for this problem type.")

    # Footer
    st.markdown("---")
    st.caption("AI Math Learning Assistant · Powered by OpenAI · Built with Streamlit")
