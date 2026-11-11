"""Runs inside the sandbox subprocess. Never imported by the web server.

Reads a job (JSON) from stdin, executes the learner's code against test cases
or a scratch snippet, and writes one JSON result line prefixed with a nonce.

Defence in depth (the parent also applies an OS sandbox where available):
  * resource limits (CPU time, memory, file size)
  * an audit hook that blocks sockets, subprocesses, file writes, ctypes
  * a per-test wall-clock alarm so one infinite loop does not hide other results
"""
import json
import math
import os
import signal
import sys
import io
import copy
import contextlib

BLOCKED_IMPORTS = ("socket", "_socket", "ssl", "_ssl", "http", "urllib", "ftplib", "smtplib",
                   "subprocess", "_posixsubprocess", "multiprocessing", "ctypes", "_ctypes",
                   "asyncio", "selectors", "select", "webbrowser")
BLOCKED_EVENTS_PREFIX = ("socket.", "subprocess.", "os.exec", "os.spawn", "os.fork", "os.posix_spawn",
                         "os.system", "os.kill", "os.killpg", "ctypes.", "os.remove", "os.unlink",
                         "os.rename", "os.rmdir", "os.mkdir", "os.chmod", "os.chown", "shutil.",
                         "os.truncate", "os.symlink", "os.link", "os.putenv", "os.unsetenv",
                         "os.chdir", "pty.", "fcntl.", "resource.setrlimit")
WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC


class SandboxViolation(Exception):
    pass


class TestTimeout(Exception):
    pass


def limit_resources(cpu_seconds):
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
        try:
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
        except (ValueError, OSError):
            pass   # not supported on macOS
    except ImportError:
        pass


def install_audit_hook():
    def hook(event, args):
        if event == "import":
            name = args[0] or ""
            if name.split(".")[0] in BLOCKED_IMPORTS:
                raise SandboxViolation(f"import of '{name}' is not allowed in this exercise")
        elif event == "open":
            mode = args[1] if len(args) > 1 else None
            flags = args[2] if len(args) > 2 else 0
            if (isinstance(mode, str) and any(c in mode for c in "wax+")) or (isinstance(flags, int) and flags & WRITE_FLAGS):
                raise SandboxViolation("writing files is not allowed in this exercise")
        elif event.startswith(BLOCKED_EVENTS_PREFIX):
            raise SandboxViolation(f"'{event}' is not allowed in this exercise")
    sys.addaudithook(hook)


def on_alarm(signum, frame):
    raise TestTimeout()


def normalize(value):
    """Make results JSON-comparable (tuples -> lists, sets -> sorted lists)."""
    if isinstance(value, tuple):
        return [normalize(v) for v in value]
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, (set, frozenset)):
        return sorted(normalize(v) for v in value)
    if isinstance(value, dict):
        return {str(k): normalize(v) for k, v in value.items()}
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return repr(value)


def equal(got, expected):
    if isinstance(expected, bool) or isinstance(got, bool):
        return type(got) is type(expected) and got == expected
    if isinstance(expected, float) or isinstance(got, float):
        return isinstance(got, (int, float)) and isinstance(expected, (int, float)) and math.isclose(got, expected, rel_tol=1e-6, abs_tol=1e-9)
    if isinstance(expected, list):
        return isinstance(got, list) and len(got) == len(expected) and all(equal(g, e) for g, e in zip(got, expected))
    if isinstance(expected, dict):
        return isinstance(got, dict) and set(got) == set(expected) and all(equal(got[k], expected[k]) for k in expected)
    return type(got) is type(expected) and got == expected


def learner_line(tb):
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename in ("solution.py", "<run>"):
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def describe_error(exc):
    if isinstance(exc, TestTimeout):
        return {"type": "Timeout", "message": "took too long (is there a loop that never ends?)", "line": None}
    return {"type": type(exc).__name__, "message": str(exc)[:300], "line": learner_line(exc.__traceback__)}


def run_tests(job, compiled):
    results = []
    per_test = float(job.get("per_test_timeout", 1.0))
    for test in job["tests"]:
        ns = {"__name__": "solution"}
        out = io.StringIO()
        entry = {"passed": False, "got": None, "error": None, "stdout": ""}
        signal.setitimer(signal.ITIMER_REAL, per_test)
        try:
            with contextlib.redirect_stdout(out):
                exec(compiled, ns)
                if "code" in test:
                    exec(compile(test["code"], "<test>", "exec"), ns)
                    got = ns.get("result")
                else:
                    fn = ns.get(job["entry"])
                    if not callable(fn):
                        raise NameError(f"function '{job['entry']}' is not defined")
                    got = fn(*copy.deepcopy(test.get("args", [])))
            signal.setitimer(signal.ITIMER_REAL, 0)
            got = normalize(got)
            entry["got"] = got
            entry["passed"] = equal(got, test["expected"])
        except BaseException as exc:   # learner code may raise anything, including SystemExit
            signal.setitimer(signal.ITIMER_REAL, 0)
            entry["error"] = describe_error(exc)
        entry["stdout"] = out.getvalue()[:1000]
        results.append(entry)
    return results


def run_snippet(job, code):
    out = io.StringIO()
    error = None
    signal.setitimer(signal.ITIMER_REAL, float(job.get("per_test_timeout", 2.0)))
    try:
        with contextlib.redirect_stdout(out):
            exec(compile(code + "\n\n" + job.get("snippet", ""), "<run>", "exec"), {"__name__": "__main__"})
    except BaseException as exc:
        error = describe_error(exc)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    return {"stdout": out.getvalue()[:5000], "error": error}


def main():
    job = json.loads(sys.stdin.read())
    nonce = job["nonce"]
    real_stdout = sys.stdout
    limit_resources(int(job.get("cpu_seconds", 5)))
    signal.signal(signal.SIGALRM, on_alarm)
    install_audit_hook()
    code = job["code"]
    try:
        compiled = compile(code, "solution.py", "exec")
    except SyntaxError as exc:
        result = {"syntax_error": {"type": "SyntaxError", "message": exc.msg, "line": exc.lineno}}
    else:
        if job["mode"] == "run":
            result = run_snippet(job, code)
        else:
            result = {"tests": run_tests(job, compiled)}
    real_stdout.write("\n" + nonce + json.dumps(result) + "\n")
    real_stdout.flush()


if __name__ == "__main__":
    main()
