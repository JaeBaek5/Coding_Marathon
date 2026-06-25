"""
POC LLM 역할 규칙 — 모델은 역할별로만 호출한다.

역할          | env 키 (우선순위)                    | 용도
--------------|--------------------------------------|----------------------------------
reason        | LLM_ROLE_REASON_MODEL → OPENROUTER_MODEL | 추천 이유 1~2문장 (텍스트 전용)
vision_menu   | LLM_ROLE_VISION_MODEL → OPENROUTER_VISION_MODEL | 메뉴판 이미지 → JSON (멀티모달 필수)

금지:
- reason 역할에 vision 모델 사용 금지
- vision_menu 역할에 text-only 모델 사용 금지 (호출 전 검증은 best-effort)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

RoleName = Literal["reason", "vision_menu"]


@dataclass(frozen=True)
class RoleSpec:
    name: RoleName
    label: str
    description: str
    model: str
    max_tokens: int
    timeout_sec: int
    temperature: float
    requires_vision: bool


ROLE_DEFAULTS: dict[RoleName, dict] = {
    "reason": {
        "label": "추천 이유",
        "description": "랭킹된 식당마다 한국어 1~2문장 추천 이유 생성. 제공된 JSON 사실만 사용.",
        "model": "google/gemini-2.5-flash-lite",
        "max_tokens": 200,
        "timeout_sec": 30,
        "temperature": 0.3,
        "requires_vision": False,
        "env_keys": ("LLM_ROLE_REASON_MODEL", "OPENROUTER_MODEL"),
    },
    "vision_menu": {
        "label": "메뉴판 Vision",
        "description": "메뉴판 사진 URL → [{name, price}] JSON. 메뉴판 없으면 호출 안 함.",
        "model": "google/gemini-2.5-flash",
        "max_tokens": 512,
        "timeout_sec": 45,
        "temperature": 0.1,
        "requires_vision": True,
        "env_keys": ("LLM_ROLE_VISION_MODEL", "OPENROUTER_VISION_MODEL", "MODEL"),
    },
}

# 알려진 text-only 모델 — vision_menu에 쓰이면 경고
TEXT_ONLY_HINTS = ("flash-lite", "north-mini", "gpt-3.5", "deepseek-r1-distill")


def _env_int(keys: tuple[str, ...], default: int) -> int:
    for key in keys:
        raw = os.getenv(key, "").strip()
        if raw:
            return int(raw)
    return default


def _env_model(role: RoleName) -> str:
    spec = ROLE_DEFAULTS[role]
    for key in spec["env_keys"]:
        raw = os.getenv(key, "").strip()
        if raw:
            return raw
    return spec["model"]


def load_role_specs() -> dict[RoleName, RoleSpec]:
    return {
        "reason": RoleSpec(
            name="reason",
            label=ROLE_DEFAULTS["reason"]["label"],
            description=ROLE_DEFAULTS["reason"]["description"],
            model=_env_model("reason"),
            max_tokens=_env_int(("OPENROUTER_MAX_TOKENS_LLM",), ROLE_DEFAULTS["reason"]["max_tokens"]),
            timeout_sec=ROLE_DEFAULTS["reason"]["timeout_sec"],
            temperature=ROLE_DEFAULTS["reason"]["temperature"],
            requires_vision=False,
        ),
        "vision_menu": RoleSpec(
            name="vision_menu",
            label=ROLE_DEFAULTS["vision_menu"]["label"],
            description=ROLE_DEFAULTS["vision_menu"]["description"],
            model=_env_model("vision_menu"),
            max_tokens=_env_int(("OPENROUTER_MAX_TOKENS_VISION",), ROLE_DEFAULTS["vision_menu"]["max_tokens"]),
            timeout_sec=ROLE_DEFAULTS["vision_menu"]["timeout_sec"],
            temperature=ROLE_DEFAULTS["vision_menu"]["temperature"],
            requires_vision=True,
        ),
    }


def validate_role_specs(specs: dict[RoleName, RoleSpec]) -> list[str]:
    """역할-모델 불일치 시 경고 메시지 목록 반환."""
    warnings: list[str] = []
    reason_model = specs["reason"].model.lower()
    vision_model = specs["vision_menu"].model.lower()

    if reason_model == vision_model:
        warnings.append(
            f"reason·vision_menu가 같은 모델({specs['reason'].model})입니다. "
            "역할별로 다른 모델을 권장합니다."
        )

    if any(h in vision_model for h in TEXT_ONLY_HINTS):
        warnings.append(
            f"vision_menu 모델({specs['vision_menu'].model})이 text-only일 수 있습니다. "
            "멀티모달 모델(예: google/gemini-2.5-flash)을 쓰세요."
        )

    return warnings


def role_summary_line(spec: RoleSpec) -> str:
    return f"{spec.label} [{spec.name}] → {spec.model} (max {spec.max_tokens}tok)"
