"""Simulate synthetic learners through the real adaptive engine.

Each synthetic learner has a hidden true skill level theta per skill and a
built-in weakness profile. They take the diagnostic, then practise scenarios
chosen by the engine. Success on each submission is drawn from the learner's
true level, so the engine only ever sees what a real learner would produce:
attempts, hints, and which checks failed.

Outputs (sim/output/):
  estimated_vs_true.png        final estimated mastery vs hidden true skill
  tracking_error.png           mean |estimate - truth| as practice accumulates
  skill_choice_by_weakness.png which skills the engine targeted, per weakness group
  first_scenarios.png          the first scenarios chosen, per weakness group
  summary.json                 the numbers behind the plots

Run:  python3 run.py simulate     (or python3 sim/simulate.py --learners 120)
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from skillbridge import content  # noqa: E402
from skillbridge.engine import (Episode, LearnerState, Submission, apply_episode,  # noqa: E402
                                recommend, transfer_skills_for, is_mastered)

OUT = Path(__file__).resolve().parent / "output"
MAX_ATTEMPTS = 5

# weakness profiles: which skills start low (true theta 0.08-0.28); others are 0.5-0.9
GROUPS = {
    "python": {
        "weak loops & bounds": ["py_loops", "py_off_by_one"],
        "weak types": ["py_types"],
        "weak returns & scope": ["py_returns", "py_scope"],
        "weak conditionals": ["py_conditionals"],
        "all strong": [],
        "all weak": ["py_conditionals", "py_loops", "py_off_by_one", "py_returns", "py_scope", "py_types"],
    },
    "circuits": {
        "weak Ohm's law": ["ck_ohms", "ck_value"],
        "weak parallel": ["ck_parallel"],
        "weak fault finding": ["ck_open", "ck_short"],
        "all strong": [],
    },
}


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


class SyntheticLearner:
    def __init__(self, rng: random.Random, skills: list[str], weak: list[str], group: str):
        self.rng, self.group = rng, group
        self.theta = {s: (rng.uniform(0.08, 0.28) if s in weak else rng.uniform(0.5, 0.9)) for s in skills}
        self.hint_tendency = rng.uniform(0.05, 0.6)
        self.learn_rate = rng.uniform(0.02, 0.05)

    def diagnostic(self, items: list[dict], scoring: dict) -> dict[str, float]:
        out = {}
        for q in items:
            th = self.theta[q["skill"]]
            if self.rng.random() < 0.1:
                out[q["skill"]] = scoring["unsure"]
            else:
                out[q["skill"]] = scoring["correct"] if self.rng.random() < sigmoid(8 * (th - 0.4)) else scoring["incorrect"]
        return out

    def attempt(self, sc) -> tuple[bool, int, int, list[Submission]]:
        """Play one scenario; return (solved, attempts, hints, graded submissions)."""
        weakest = min(sc.skills, key=lambda s: self.theta[s])
        logit = 7 * (self.theta[weakest] - sc.difficulty) + 0.4 * sc.scaffold
        hints, subs = 0, []
        for k in range(1, MAX_ATTEMPTS + 1):
            p = sigmoid(logit)
            if p < 0.5 and hints < 3 and self.rng.random() < self.hint_tendency:
                hints += 1
                logit += 0.7
                p = sigmoid(logit)
            ok = self.rng.random() < p
            if ok:
                subs.append(Submission(sc.skills, (), True))
                return True, k, hints, subs
            # a failure implicates the skills the learner is actually weak in for this difficulty
            culprits = tuple(s for s in sc.skills if self.theta[s] < sc.difficulty + 0.05) or (weakest,)
            subs.append(Submission(sc.skills, culprits, False))
            logit += 0.45      # feedback from the failed test helps a little
        return False, MAX_ATTEMPTS, hints, subs

    def learn(self, sc, solved: bool) -> None:
        for s in sc.skills:
            gain = self.learn_rate * (1.0 if solved else 0.5)
            self.theta[s] = min(1.0, self.theta[s] + gain * (1 - self.theta[s]))


def run(n_learners: int, steps: int, seed: int) -> dict:
    cat = content.load()
    rng = random.Random(seed)
    results = {}
    for domain, groups in GROUPS.items():
        skills = [s["id"] for s in cat.skills_in(domain)]
        eskills, ecat = cat.engine_skills(domain), cat.engine_catalog(domain)
        by_id = {s.id: s for s in ecat}
        names = list(groups)
        learners = []
        for i in range(n_learners):
            g = names[i % len(names)]
            L = SyntheticLearner(random.Random(rng.random()), skills, groups[g], g)
            st = LearnerState()
            for s, m in L.diagnostic(cat.diagnostics[domain], cat.diagnostics["scoring"]).items():
                st.mastery[s], st.updates[s] = m, 0
            err_curve = [sum(abs(st.m(s) - L.theta[s]) for s in skills) / len(skills)]
            seq_skill, seq_scen = [], []
            for _ in range(steps):
                rec = recommend(eskills, ecat, st)
                if rec.scenario_id is None:
                    break
                sc = by_id[rec.scenario_id]
                transfer = transfer_skills_for(sc, st.episodes)
                solved, attempts, hints, subs = L.attempt(sc)
                apply_episode(st, Episode(sc.id, sc.skills, sc.difficulty, sc.surface_form, solved, attempts, hints, transfer), subs)
                L.learn(sc, solved)
                seq_skill.append(rec.skill)
                seq_scen.append(sc.id)
                err_curve.append(sum(abs(st.m(s) - L.theta[s]) for s in skills) / len(skills))
            learners.append({"group": g, "theta": dict(L.theta), "mastery": dict(st.mastery), "err": err_curve,
                             "skills": seq_skill, "scenarios": seq_scen,
                             "mastered": [s for s in skills if is_mastered(s, st)]})
        results[domain] = {"skills": skills, "names": {s["id"]: s["name"] for s in cat.skills_in(domain)},
                           "groups": names, "learners": learners}
    return results


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    vy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return cov / (vx * vy) if vx and vy else float("nan")


def summarize(res: dict, first_k: int) -> dict:
    out = {}
    for domain, r in res.items():
        L = r["learners"]
        xs = [l["theta"][s] for l in L for s in r["skills"]]
        ys = [l["mastery"][s] for l in L for s in r["skills"]]
        initial = [l["err"][0] for l in L]
        final = [l["err"][-1] for l in L]
        per_group = {}
        for g in r["groups"]:
            gl = [l for l in L if l["group"] == g]
            share = Counter(s for l in gl for s in l["skills"][:first_k])
            tot = sum(share.values()) or 1
            firsts = Counter(tuple(l["scenarios"][:3]) for l in gl).most_common(1)[0]
            per_group[g] = {"n": len(gl), "skill_share_first_k": {s: round(share[s] / tot, 3) for s in r["skills"]},
                            "most_common_first_3": list(firsts[0]), "mean_mastered": round(sum(len(l["mastered"]) for l in gl) / len(gl), 2)}
        # how different are the sequences across groups? (share of learner pairs with identical first-k skill sequences)
        same_within, same_across, nw, na = 0, 0, 0, 0
        for i in range(len(L)):
            for j in range(i + 1, len(L)):
                same = L[i]["skills"][:first_k] == L[j]["skills"][:first_k]
                if L[i]["group"] == L[j]["group"]:
                    same_within += same; nw += 1
                else:
                    same_across += same; na += 1
        out[domain] = {"learners": len(L), "pearson_r_final": round(pearson(xs, ys), 3),
                       "mae_initial": round(sum(initial) / len(initial), 3), "mae_final": round(sum(final) / len(final), 3),
                       "identical_first_k_within_group": round(same_within / max(nw, 1), 3),
                       "identical_first_k_across_groups": round(same_across / max(na, 1), 3),
                       "first_k": first_k, "groups": per_group}
    return out


def plot(res: dict, summary: dict) -> list[str]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    # validated categorical order (see web/js/charts.js); sequential = one hue
    PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"]
    INK, MUTED, GRID = "#121212", "#6b6b6b", "#e5e5e5"
    plt.rcParams.update({"font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK, "xtick.color": MUTED,
                         "ytick.color": MUTED, "axes.spines.top": False, "axes.spines.right": False,
                         "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "figure.dpi": 130})
    OUT.mkdir(parents=True, exist_ok=True)
    files = []
    domains = list(res)

    # 1. estimated vs true
    fig, axes = plt.subplots(1, len(domains), figsize=(5.2 * len(domains), 4.8))
    for ax, d in zip(axes, domains):
        r = res[d]
        for i, s in enumerate(r["skills"]):
            xs = [l["theta"][s] for l in r["learners"]]
            ys = [l["mastery"][s] for l in r["learners"]]
            ax.scatter(xs, ys, s=14, alpha=0.55, color=PAL[i], edgecolors="white", linewidths=0.6, label=r["names"][s])
        ax.plot([0, 1], [0, 1], color=MUTED, lw=1, ls="--")
        ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        ax.set_xlabel("hidden true skill (end of run)"); ax.set_ylabel("engine's estimated mastery")
        ax.set_title(f"{d.title()}: r = {summary[d]['pearson_r_final']:.2f}", loc="left", color=INK)
        ax.legend(fontsize=7.5, frameon=False, loc="upper left")
    fig.suptitle("Estimated mastery tracks hidden true skill", x=0.02, ha="left", fontsize=12, color=INK)
    fig.tight_layout(); p = OUT / "estimated_vs_true.png"; fig.savefig(p); plt.close(fig); files.append(p.name)

    # 2. tracking error over time
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    for i, d in enumerate(domains):
        curves = [l["err"] for l in res[d]["learners"]]
        n = min(len(c) for c in curves)
        mean = [sum(c[k] for c in curves) / len(curves) for k in range(n)]
        sd = [math.sqrt(sum((c[k] - mean[k]) ** 2 for c in curves) / len(curves)) for k in range(n)]
        ax.plot(range(n), mean, color=PAL[i], lw=2, label=d.title())
        ax.fill_between(range(n), [m - s for m, s in zip(mean, sd)], [m + s for m, s in zip(mean, sd)], color=PAL[i], alpha=0.12, lw=0)
        ax.annotate(f"{mean[-1]:.2f}", (n - 1, mean[-1]), xytext=(4, 0), textcoords="offset points", color=INK, fontsize=9, va="center")
    ax.set_xlabel("scenarios completed (0 = after diagnostic)"); ax.set_ylabel("mean |estimate − truth| per skill")
    ax.set_title("Estimation error shrinks with practice (mean ± 1 sd)", loc="left", color=INK)
    ax.legend(frameon=False); ax.set_ylim(bottom=0)
    fig.tight_layout(); p = OUT / "tracking_error.png"; fig.savefig(p); plt.close(fig); files.append(p.name)

    # 3. which skills the engine targeted, per weakness group (sequential single hue)
    fig, axes = plt.subplots(1, len(domains), figsize=(6.2 * len(domains), 4.4), gridspec_kw={"width_ratios": [len(res[d]["skills"]) for d in domains]})
    for ax, d in zip(axes, domains):
        r, sm = res[d], summary[d]
        mat = [[sm["groups"][g]["skill_share_first_k"][s] for s in r["skills"]] for g in r["groups"]]
        im = ax.imshow(mat, cmap="Blues", vmin=0, vmax=max(max(row) for row in mat), aspect="auto")
        ax.set_xticks(range(len(r["skills"]))); ax.set_xticklabels([r["names"][s] for s in r["skills"]], rotation=35, ha="right", fontsize=8.5)
        ax.set_yticks(range(len(r["groups"]))); ax.set_yticklabels(r["groups"], fontsize=9)
        ax.grid(False)
        for gi, row in enumerate(mat):
            for si, v in enumerate(row):
                ax.text(si, gi, f"{v:.0%}" if v else "", ha="center", va="center", fontsize=7.5, color="white" if v > 0.5 * max(max(x) for x in mat) else INK)
        ax.set_title(f"{d.title()}: share of the first {sm['first_k']} picks", loc="left", color=INK, fontsize=10.5)
        fig.colorbar(im, ax=ax, fraction=0.04, pad=0.02)
    fig.suptitle("Different weaknesses → the engine targets different skills", x=0.02, ha="left", fontsize=12, color=INK)
    fig.tight_layout(); p = OUT / "skill_choice_by_weakness.png"; fig.savefig(p); plt.close(fig); files.append(p.name)

    # 4. example scenario sequences (first 8) for one learner per group
    fig, axes = plt.subplots(1, len(domains), figsize=(6.4 * len(domains), 4.2))
    for ax, d in zip(axes, domains):
        r = res[d]
        idx = {s: i for i, s in enumerate(r["skills"])}
        for gi, g in enumerate(r["groups"]):
            l = next(x for x in r["learners"] if x["group"] == g)
            ys = [idx[s] for s in l["skills"][:8]]
            ax.plot(range(1, len(ys) + 1), [y + (gi - len(r["groups"]) / 2) * 0.07 for y in ys], marker="o", ms=5, lw=1.6,
                    color=PAL[gi % len(PAL)], label=g, markeredgecolor="white", markeredgewidth=1)
        ax.set_yticks(range(len(r["skills"]))); ax.set_yticklabels([r["names"][s] for s in r["skills"]], fontsize=8.5)
        ax.set_xlabel("scenario number"); ax.set_title(f"{d.title()}: skill targeted by each pick (one learner per group)", loc="left", color=INK, fontsize=10.5)
        ax.legend(fontsize=7.5, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.18), ncol=3)
    fig.tight_layout(); p = OUT / "first_scenarios.png"; fig.savefig(p); plt.close(fig); files.append(p.name)
    return files


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--learners", type=int, default=120)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--first-k", type=int, default=8)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--no-plots", action="store_true")
    a = ap.parse_args(argv)
    res = run(a.learners, a.steps, a.seed)
    summary = summarize(res, a.first_k)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    for d, s in summary.items():
        print(f"[{d}] {s['learners']} learners  r(final estimate, truth) = {s['pearson_r_final']}  "
              f"MAE {s['mae_initial']} -> {s['mae_final']}  identical first-{s['first_k']} skill sequences: "
              f"within group {s['identical_first_k_within_group']:.0%}, across groups {s['identical_first_k_across_groups']:.0%}")
        for g, gs in s["groups"].items():
            top = max(gs["skill_share_first_k"], key=gs["skill_share_first_k"].get)
            print(f"    {g:22} most-targeted skill: {res[d]['names'][top]:22} first 3: {gs['most_common_first_3']}  mastered avg {gs['mean_mastered']}")
    if not a.no_plots:
        try:
            files = plot(res, summary)
            print("plots saved to", OUT, ":", ", ".join(files))
        except ImportError:
            print("matplotlib is not installed: wrote summary.json only. Install it with: pip install matplotlib")
    return summary


if __name__ == "__main__":
    main()
