from __future__ import annotations

from typing import Any

from ..config import Config
from .base import Skill, SkillContext
from .builtin import build_builtin_skills
from .promoted import RecipeSkill, is_promotable_recipe, load_recipes, save_recipe

__all__ = [
    "Skill",
    "SkillContext",
    "RecipeSkill",
    "SkillRegistry",
    "build_registry",
    "is_promotable_recipe",
    "load_recipes",
    "save_recipe",
]


class SkillRegistry:
    def __init__(self, skills: list[Any] | None = None) -> None:
        self.skills: list[Any] = list(skills or [])
        self._sort()

    def _sort(self) -> None:
        self.skills.sort(key=lambda s: getattr(s, "order", 100))

    def add(self, skill: Any) -> None:
        self.skills.append(skill)
        self._sort()

    def match(self, text: str) -> tuple[Any, dict[str, Any]] | None:
        for skill in self.skills:
            args = skill.match(text)
            if args is not None:
                return skill, args
        return None

    def names(self) -> list[str]:
        return [s.name for s in self.skills]

    def reload_promoted(self, skills_dir) -> None:
        self.skills = [s for s in self.skills if not isinstance(s, RecipeSkill)]
        self.skills.extend(load_recipes(skills_dir))
        self._sort()


def build_registry(cfg: Config) -> SkillRegistry:
    skills: list[Any] = list(build_builtin_skills(cfg))
    skills.extend(load_recipes(cfg.skills_dir))
    return SkillRegistry(skills)
