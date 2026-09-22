"""Engine-agnostic question specs.

Decision engines render these into their own SDK types. Adding an engine does
not require changing this module.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChoiceSpec:
    """A single-label choice. ``criteria`` maps each label to a description."""

    id: str
    instructions: str
    criteria: dict[str, str]


@dataclass(frozen=True)
class NoulSpec:
    """A yes/no question. ``true`` and ``false`` describe the two outcomes."""

    id: str
    instructions: str
    true: str
    false: str


CONTENT_TYPE = ChoiceSpec(
    id="content_type",
    instructions=(
        "Classify this page into exactly one category: original writing, "
        "reposted content, or an advertisement."
    ),
    criteria={
        "original": (
            "原创: first-hand writing with the author's own reporting, "
            "experience, or analysis."
        ),
        "repost": (
            "搬运: copied, aggregated, or lightly rewritten from another "
            "source, with little original reporting."
        ),
        "ad": (
            "广告: promotional content. Includes 软广 (reads like an article "
            "or review but promotes a brand, product, or service) and 硬广 "
            "(explicit sales pitch, price, coupon, or purchase call-to-action)."
        ),
    },
)

AI_GENERATED = NoulSpec(
    id="ai_generated",
    instructions="Was this text written by an AI language model rather than a human?",
    true="The text was written by an AI language model.",
    false="The text was written by a human.",
)
