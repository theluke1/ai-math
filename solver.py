"""
solver.py

Calls the OpenAI API to generate a structured educational response for a math problem.

The solver:
  1. Receives the problem, its classified topic, and knowledge base context.
  2. Builds a detailed system prompt that instructs the LLM to act as a math tutor.
  3. Parses the structured JSON response into a clean Python dict.

Connects to:
  - topic_classifier.py  → provides the topic string
  - knowledge_base.py    → provides the formatted formula/context string
  - app.py               → calls solve() and displays the result sections
"""

import json
import os
from openai import OpenAI

from knowledge_base import format_knowledge_for_prompt


# ---------------------------------------------------------------------------
# Client setup — reads OPENAI_API_KEY from environment
# ---------------------------------------------------------------------------

def _get_client() -> OpenAI:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GROQ_API_KEY is not set. "
            "Get a free key at console.groq.com and add it to your .env file."
        )
    return OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
    )


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_TEMPLATE = """You are an expert mathematics tutor. Your job is to help students
understand math problems deeply — not just give them answers, but teach them how to think.

You have been provided with reference material for the detected topic below.
Use this material to ground your explanation in correct terminology and formulas.

--- REFERENCE MATERIAL ---
{knowledge_context}
--- END REFERENCE MATERIAL ---

When responding, you MUST return ONLY valid JSON in exactly this structure:
{{
  "topic": "string — the confirmed topic name",
  "concept_explanation": "string — 2-4 sentences explaining the relevant concept in plain English",
  "relevant_formulas": ["string", "string", ...],
  "hint": "string — one helpful hint that guides the student toward the solution WITHOUT giving it away",
  "step_by_step_solution": "string — a full, clearly numbered step-by-step solution with working shown",
  "what_to_study_next": "string — 1-2 sentences recommending what to learn after mastering this",
  "plot_expression": "string or null — if the problem involves a plottable function, return the Python-evaluable expression as a string (e.g. 'x**2 + 3*x - 5'). Use numpy-compatible syntax. Return null if no plot is appropriate."
}}

Rules:
- Be clear and educational. Imagine you are tutoring a university student.
- Show all working in step_by_step_solution. Number each step.
- The hint should be genuinely useful but leave the work to the student.
- For plot_expression: only return an expression when it is a single-variable function of x.
  For integrals, return the integrand (what is being integrated).
  Return null for matrix problems, word problems without functions, or proof-based questions.
- Do NOT include any text outside the JSON object.
"""

USER_PROMPT_TEMPLATE = """Math problem: {problem}

Detected topic: {topic}

Please provide your full educational response as JSON."""


# ---------------------------------------------------------------------------
# Main solver function
# ---------------------------------------------------------------------------

def solve(problem: str, topic: str, model: str = "gpt-4o-mini") -> dict:
    """
    Send the math problem to the LLM and return a structured response dict.

    Args:
        problem: The user's original math problem string.
        topic:   The classified topic from topic_classifier.py.
        model:   OpenAI model to use. Defaults to gpt-4o-mini (fast + cheap).

    Returns:
        A dict with keys:
          topic, concept_explanation, relevant_formulas, hint,
          step_by_step_solution, what_to_study_next, plot_expression

    Raises:
        ValueError: If the LLM returns malformed JSON.
        EnvironmentError: If the API key is missing.
    """
    client = _get_client()
    knowledge_context = format_knowledge_for_prompt(topic)

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        knowledge_context=knowledge_context
    )
    user_prompt = USER_PROMPT_TEMPLATE.format(
        problem=problem,
        topic=topic,
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,   # Low temperature = consistent, accurate math responses
    )

    raw = response.choices[0].message.content

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM returned invalid JSON: {e}\n\nRaw response:\n{raw}")

    # Ensure all expected keys are present, filling missing ones gracefully
    defaults = {
        "topic": topic,
        "concept_explanation": "",
        "relevant_formulas": [],
        "hint": "",
        "step_by_step_solution": "",
        "what_to_study_next": "",
        "plot_expression": None,
    }
    for key, default in defaults.items():
        result.setdefault(key, default)

    return result
