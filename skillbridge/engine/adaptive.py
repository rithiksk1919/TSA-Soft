"""Adaptive practice engine.

Deterministic, domain-independent selection of the next scenario. No LLM, no
randomness: identical learner state always produces the identical choice, and
every choice comes with a machine-readable reason.

The engine only knows about:
  * skills (ids, prerequisite edges)
  * scenarios (id, skill tags, difficulty, surface form, scaffold level)
  * the learner's history (completed episodes and graded submissions)
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Iterable

from .learner_model import (
    DEFAULT_MASTERY,
    attempt_score,
    clamp,
    expected_success,
    learning_rate,
    update_mastery,
)

# ---- tunable constants (documented in README) -------------------------------
ERROR_WEIGHT = 0.3            # priority += 0.3 * error rate over last 5 attempts
ERROR_WINDOW = 5
RECENCY_STEP = 0.02           # +0.02 per episode since the skill was last practiced
RECENCY_MAX = 0.10            # ...capped at 0.10 (never practiced = 0.10)
PREREQ_THRESHOLD = 0.5
TARGET_OFFSET = 0.1           # target difficulty = mastery + 0.1
REMEDIAL_DROP = 0.1           # after 2 failures in a row: target -= 0.1
REMEDIAL_FAILS = 2
HINT_WINDOW = 5               # hint dependency: hints on > half of last 5 scenarios
MASTERY_THRESHOLD = 0.8
NEAR_BAND = 0.4               # "near that difficulty": d >= mastery - NEAR_BAND


# ---- data model ---------------------------------------------------------------
@dataclass(frozen=True)
class Skill:
    id: str
    name: str
    domain: str
    prereqs: tuple[str, ...] = ()


@dataclass(frozen=True)
class Scenario:
    id: str
    domain: str
    skills: tuple[str, ...]
    difficulty: float
    surface_form: str
    scaffold: int = 0          # 0 = none, 1 = some visible tests, 2 = guided
    title: str = ""


@dataclass
class Episode:
    """A completed run through one scenario."""
    scenario_id: str
    skills: tuple[str, ...]
    difficulty: float
    surface_form: str
    solved: bool
    attempts: int
    hints: int
    transfer_skills: tuple[str, ...] = ()   # skills for which this was a never-seen, new-surface-form scenario


@dataclass
class Submission:
    """One graded attempt. failed_skills = skills implicated by failing checks."""
    skills: tuple[str, ...]
    failed_skills: tuple[str, ...]
    passed: bool


@dataclass
class LearnerState:
    mastery: dict[str, float] = field(default_factory=dict)
    updates: dict[str, int] = field(default_factory=dict)     # number of model updates per skill
    episodes: list[Episode] = field(default_factory=list)      # completed, oldest first
    submissions: list[Submission] = field(default_factory=list)  # oldest first

    def m(self, skill: str) -> float:
        return self.mastery.get(skill, DEFAULT_MASTERY)


@dataclass
class SkillStatus:
    skill: str
    mastery: float
    priority: float
    error_rate: float
    recency_bonus: float
    blocked_by: list[str]
    mastered: bool
    transfer_pending: bool
    consecutive_failures: int
    available: int             # unseen scenarios left in this skill


@dataclass
class Recommendation:
    scenario_id: str | None
    skill: str | None
    priority: float
    target_difficulty: float
    mode: str                  # normal | remedial | scaffolded | transfer | review | none
    worked_example: bool
    hint_dependency: bool
    reasons: list[str]
    skills_considered: list[dict]

    def to_dict(self) -> dict:
        return asdict(self)


# ---- history helpers -----------------------------------------------------------
def episodes_for(skill: str, episodes: Iterable[Episode]) -> list[Episode]:
    return [e for e in episodes if skill in e.skills]


def error_rate(skill: str, submissions: list[Submission], window: int = ERROR_WINDOW) -> float:
    """Share of the last `window` graded attempts on this skill that failed *because of this skill*."""
    relevant = [s for s in submissions if skill in s.skills][-window:]
    if not relevant:
        return 0.0
    return sum(1 for s in relevant if skill in s.failed_skills) / len(relevant)


def recency_bonus(skill: str, episodes: list[Episode]) -> float:
    """Small bonus for skills not practiced recently (counted in episodes, not wall time)."""
    for back, ep in enumerate(reversed(episodes)):
        if skill in ep.skills:
            return min(RECENCY_MAX, RECENCY_STEP * back)
    return RECENCY_MAX


def priority(skill: str, state: LearnerState) -> float:
    return (1.0 - state.m(skill)) + ERROR_WEIGHT * error_rate(skill, state.submissions) + recency_bonus(skill, state.episodes)


def blocked_by(skill: Skill, state: LearnerState) -> list[str]:
    return [p for p in skill.prereqs if state.m(p) < PREREQ_THRESHOLD]


def consecutive_failures(skill: str, episodes: list[Episode]) -> int:
    n = 0
    for ep in reversed(episodes_for(skill, episodes)):
        if ep.solved:
            break
        n += 1
    return n


def hint_dependency(episodes: list[Episode], window: int = HINT_WINDOW) -> tuple[bool, int, int]:
    """Flag when hints were used on more than half of the last `window` scenarios.

    Returns (flagged, hinted_count, window_size). "More than half of the last 5"
    means at least 3, so the flag cannot trip before 3 scenarios exist.
    """
    recent = episodes[-window:]
    hinted = sum(1 for e in recent if e.hints > 0)
    return hinted * 2 > window, hinted, len(recent)


def seen_scenarios(episodes: Iterable[Episode]) -> set[str]:
    return {e.scenario_id for e in episodes}


def transfer_skills_for(scenario: Scenario, episodes: list[Episode]) -> tuple[str, ...]:
    """Skills for which `scenario` would be a transfer item right now:
    never seen before, and its surface form differs from every surface form the
    learner has already practiced for that skill (and they have practiced it)."""
    if scenario.id in seen_scenarios(episodes):
        return ()
    out = []
    for sk in scenario.skills:
        prior = episodes_for(sk, episodes)
        if prior and scenario.surface_form not in {e.surface_form for e in prior}:
            out.append(sk)
    return tuple(out)


def is_mastered(skill: str, state: LearnerState) -> bool:
    """Mastered = mastery >= 0.8
       AND the last two (distinct) scenarios near that difficulty were solved
       AND one of them was a never-seen, different-surface-form scenario solved with no hints."""
    m = state.m(skill)
    if m < MASTERY_THRESHOLD:
        return False
    near: list[Episode] = []
    for ep in reversed(episodes_for(skill, state.episodes)):
        if ep.difficulty >= m - NEAR_BAND and all(ep.scenario_id != n.scenario_id for n in near):
            near.append(ep)
            if len(near) == 2:
                break
    if len(near) < 2 or not all(e.solved for e in near):
        return False
    return any(skill in e.transfer_skills and e.hints == 0 for e in near)


def transfer_pending(skill: str, state: LearnerState) -> bool:
    return state.m(skill) >= MASTERY_THRESHOLD and not is_mastered(skill, state)


# ---- model update ----------------------------------------------------------------
def apply_episode(state: LearnerState, episode: Episode, submissions: list[Submission]) -> dict[str, tuple[float, float]]:
    """Record a finished episode and update every tagged skill. Returns {skill: (old, new)}."""
    o = attempt_score(episode.solved, episode.attempts, episode.hints)
    changes = {}
    for sk in episode.skills:
        old = state.m(sk)
        new = update_mastery(old, o, episode.difficulty, state.updates.get(sk, 0))
        state.mastery[sk] = new
        state.updates[sk] = state.updates.get(sk, 0) + 1
        changes[sk] = (old, new)
    state.submissions.extend(submissions)
    state.episodes.append(episode)
    return changes


def _dist(d: float, target: float) -> float:
    """Distance rounded so exact ties are broken by scenario id, not float noise."""
    return round(abs(d - target), 6)


# ---- selection ---------------------------------------------------------------------
def skill_statuses(skills: list[Skill], catalog: list[Scenario], state: LearnerState) -> list[SkillStatus]:
    seen = seen_scenarios(state.episodes)
    out = []
    for sk in skills:
        out.append(SkillStatus(
            skill=sk.id,
            mastery=round(state.m(sk.id), 4),
            priority=round(priority(sk.id, state), 4),
            error_rate=round(error_rate(sk.id, state.submissions), 4),
            recency_bonus=round(recency_bonus(sk.id, state.episodes), 4),
            blocked_by=blocked_by(sk, state),
            mastered=is_mastered(sk.id, state),
            transfer_pending=transfer_pending(sk.id, state),
            consecutive_failures=consecutive_failures(sk.id, state.episodes),
            available=sum(1 for s in catalog if sk.id in s.skills and s.id not in seen),
        ))
    return out


def recommend(skills: list[Skill], catalog: list[Scenario], state: LearnerState,
              only_skill: str | None = None) -> Recommendation:
    """Pick the next scenario.

    1. Score every skill: priority = (1 - m) + 0.3 * error_rate + recency bonus.
    2. Skip skills whose prerequisite mastery is < 0.5, skills already mastered,
       and skills with no unseen scenarios (fallbacks below if nothing is left).
    3. Take the highest-priority skill (ties: catalog order).
    4. Target difficulty = m + 0.1; after 2 failures in a row on the skill,
       lower it by 0.1 and show a worked example first.
    5. Among unseen scenarios in that skill choose the one closest to the target.
       If a transfer check is pending, prefer new surface forms. If hint
       dependency is flagged, prefer more scaffolded scenarios.
    """
    statuses = skill_statuses(skills, catalog, state)
    by_id = {s.skill: s for s in statuses}
    seen = seen_scenarios(state.episodes)
    hint_flag, hinted, window = hint_dependency(state.episodes)
    considered = [asdict(s) for s in statuses]
    reasons: list[str] = []

    pool = [s for s in statuses if only_skill is None or s.skill == only_skill]
    eligible = [s for s in pool if not s.blocked_by and not s.mastered and s.available > 0]
    review = False
    if not eligible:
        eligible = [s for s in pool if not s.blocked_by and s.available > 0]
    if not eligible:
        # every unblocked skill is exhausted: revisit already-seen scenarios
        eligible = [s for s in pool if not s.blocked_by] or pool
        review = True
    if not eligible:
        return Recommendation(None, None, 0.0, 0.0, "none", False, hint_flag, ["No skills in this domain."], considered)

    order = {sk.id: i for i, sk in enumerate(skills)}
    chosen = max(eligible, key=lambda s: (s.priority, -order[s.skill]))
    reasons.append(
        f"Skill '{chosen.skill}' has the highest priority {chosen.priority:.2f} "
        f"= (1 - mastery {chosen.mastery:.2f}) + 0.3 x error rate {chosen.error_rate:.2f} "
        f"+ recency bonus {chosen.recency_bonus:.2f}."
    )
    skipped = [s for s in pool if s.blocked_by]
    for s in skipped:
        reasons.append(f"Skipped '{s.skill}': prerequisite {', '.join(s.blocked_by)} below {PREREQ_THRESHOLD}.")

    target = TARGET_OFFSET + chosen.mastery
    mode = "normal"
    worked = False
    if chosen.consecutive_failures >= REMEDIAL_FAILS:
        target -= REMEDIAL_DROP
        worked = True
        mode = "remedial"
        reasons.append(f"{chosen.consecutive_failures} failures in a row on this skill: target lowered by {REMEDIAL_DROP} and a worked example is shown first.")
    target = clamp(target, 0.05, 0.95)

    if review:
        candidates = [s for s in catalog if chosen.skill in s.skills]
        mode = "review"
        reasons.append("No unseen scenarios left for eligible skills: reviewing a previously attempted one.")
    else:
        candidates = [s for s in catalog if chosen.skill in s.skills and s.id not in seen]

    if chosen.transfer_pending and not review:
        prior_forms = {e.surface_form for e in episodes_for(chosen.skill, state.episodes)}
        novel = [s for s in candidates if s.surface_form not in prior_forms]
        if novel:
            candidates = novel
            mode = "transfer"
            reasons.append("Mastery >= 0.8 but not yet confirmed: choosing a never-seen scenario with a new surface form (transfer check). Solve it with no hints to confirm mastery.")

    if review:
        last_seen = {e.scenario_id: i for i, e in enumerate(state.episodes)}
        solved_ids = {e.scenario_id for e in state.episodes if e.solved}
        key = lambda s: (s.id in solved_ids, last_seen.get(s.id, -1), _dist(s.difficulty, target), s.id)
    elif hint_flag:
        key = lambda s: (-s.scaffold, _dist(s.difficulty, target), s.id)
        if mode == "normal":
            mode = "scaffolded"
        reasons.append(f"Hint dependency: hints used on {hinted} of the last {window} scenarios, so a more scaffolded scenario is preferred.")
    else:
        key = lambda s: (_dist(s.difficulty, target), s.id)

    if not candidates:
        return Recommendation(None, chosen.skill, chosen.priority, round(target, 4), "none", worked, hint_flag,
                              reasons + ["No scenarios available for this skill."], considered)
    pick = min(candidates, key=key)
    reasons.append(f"Target difficulty {target:.2f}; picked '{pick.id}' (difficulty {pick.difficulty:.2f}, surface form '{pick.surface_form}').")
    return Recommendation(pick.id, chosen.skill, chosen.priority, round(target, 4), mode, worked, hint_flag, reasons, considered)
