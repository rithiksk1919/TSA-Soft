"""Deterministic evaluator for the Python debugging module.

The learner's code is executed in a separate Python process:
  * `python -I -S` (isolated: no site-packages, no PYTHON* env vars, no cwd on sys.path)
  * empty environment, fresh temporary working directory
  * wall-clock timeout for the whole process, plus a per-test alarm inside it
  * an OS sandbox when available: `sandbox-exec` (macOS) or `unshare -rn` (Linux)
    that denies all network access and file writes outside the temp directory
  * an in-process audit hook as a second layer (see sandbox_harness.py)

This is meant for a local practice app; it is not a hardened multi-tenant sandbox.
"""
from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

HARNESS = Path(__file__).with_name("sandbox_harness.py")
PROCESS_TIMEOUT = 10.0
PER_TEST_TIMEOUT = 1.0
MAX_CODE_CHARS = 20_000


def _macos_profile(workdir: str) -> str:
    return ("(version 1)(allow default)(deny network*)"
            "(deny file-write*)"
            f'(allow file-write* (subpath "{workdir}") (literal "/dev/null"))')


@lru_cache(maxsize=1)
def sandbox_kind() -> str:
    """Which OS-level sandbox works on this machine: 'sandbox-exec', 'unshare', or 'none'."""
    probe = [sys.executable, "-I", "-S", "-c", "print('ok')"]
    if sys.platform == "darwin" and shutil.which("sandbox-exec"):
        try:
            r = subprocess.run(["sandbox-exec", "-p", _macos_profile("/tmp"), *probe], capture_output=True, timeout=10)
            if r.returncode == 0:
                return "sandbox-exec"
        except (OSError, subprocess.TimeoutExpired):
            pass
    if sys.platform.startswith("linux") and shutil.which("unshare"):
        try:
            r = subprocess.run(["unshare", "-rn", *probe], capture_output=True, timeout=10)
            if r.returncode == 0:
                return "unshare"
        except (OSError, subprocess.TimeoutExpired):
            pass
    return "none"


def _execute(job: dict) -> dict:
    if len(job["code"]) > MAX_CODE_CHARS:
        return {"infra_error": "Code is too long."}
    job = dict(job, nonce="@@SB" + secrets.token_hex(8) + "@@")
    with tempfile.TemporaryDirectory(prefix="sb-run-") as workdir:
        workdir = os.path.realpath(workdir)
        cmd = [sys.executable, "-I", "-S", str(HARNESS)]
        kind = sandbox_kind()
        if kind == "sandbox-exec":
            cmd = ["sandbox-exec", "-p", _macos_profile(workdir), *cmd]
        elif kind == "unshare":
            cmd = ["unshare", "-rn", *cmd]
        try:
            proc = subprocess.run(cmd, input=json.dumps(job), capture_output=True, text=True,
                                  timeout=PROCESS_TIMEOUT, cwd=workdir, env={"PYTHONHASHSEED": "0", "PYTHONIOENCODING": "utf-8"})
        except subprocess.TimeoutExpired:
            return {"process_timeout": True}
    marker = job["nonce"]
    for line in reversed(proc.stdout.splitlines()):
        if line.startswith(marker):
            return json.loads(line[len(marker):])
    # The harness died before reporting (e.g. CPU limit or memory exhaustion)
    return {"crashed": True, "stderr": proc.stderr[-500:]}


def run_snippet(code: str, snippet: str) -> dict:
    """Free-form 'Run' button: execute the code plus a scratch snippet, return stdout/error."""
    res = _execute({"mode": "run", "code": code, "snippet": snippet, "per_test_timeout": 2.0, "cpu_seconds": 5})
    if res.get("syntax_error"):
        return {"stdout": "", "error": res["syntax_error"]}
    if res.get("process_timeout") or res.get("crashed"):
        return {"stdout": "", "error": {"type": "Timeout", "message": "the program did not finish", "line": None}}
    return res


def evaluate(code: str, config: dict, scenario_skills: list[str]) -> dict:
    """Grade code against the scenario's hidden tests.

    Returns {passed, n_passed, total, failed_skills, tests: [public per-test info], error}
    Hidden tests reveal only their description and the error type; visible tests
    also reveal the input, the expected value and what the code returned.
    """
    tests = config["tests"]
    raw = _execute({"mode": "tests", "code": code, "entry": config.get("entry"),
                    "tests": [{k: t[k] for k in ("args", "code", "expected") if k in t} for t in tests],
                    "per_test_timeout": config.get("per_test_timeout", PER_TEST_TIMEOUT), "cpu_seconds": 8})
    if "tests" not in raw:
        if raw.get("syntax_error"):
            err = raw["syntax_error"]
        elif raw.get("process_timeout") or raw.get("crashed"):
            err = {"type": "Timeout", "message": "the program did not finish", "line": None}
        else:
            err = {"type": "Error", "message": raw.get("infra_error", "could not run code"), "line": None}
        return {"passed": False, "n_passed": 0, "total": len(tests), "failed_skills": list(scenario_skills),
                "tests": [{"name": t["name"], "passed": False, "visible": bool(t.get("visible"))} for t in tests],
                "error": err}
    public, failed_skills = [], []
    for t, r in zip(tests, raw["tests"]):
        item = {"name": t["name"], "passed": r["passed"], "visible": bool(t.get("visible"))}
        if r.get("error"):
            item["error"] = r["error"]
        if t.get("visible"):
            item["input"] = t.get("show", t.get("code") or f"{config.get('entry')}{tuple(t.get('args', []))!r}".replace(",)", ")"))
            item["expected"] = t["expected"]
            item["got"] = r.get("got")
            item["stdout"] = r.get("stdout", "")
        if not r["passed"]:
            for sk in t.get("skills") or scenario_skills:
                if sk not in failed_skills:
                    failed_skills.append(sk)
        public.append(item)
    n_passed = sum(1 for p in public if p["passed"])
    return {"passed": n_passed == len(tests), "n_passed": n_passed, "total": len(tests),
            "failed_skills": failed_skills, "tests": public, "error": None}
