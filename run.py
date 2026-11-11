#!/usr/bin/env python3
"""SkillBridge: one command to run everything.

    python3 run.py             start the app at http://127.0.0.1:8000 (seeds demo learners on first run)
    python3 run.py test        run the unit and integration tests
    python3 run.py simulate    simulate synthetic learners and save plots (needs matplotlib)
    python3 run.py demo        (re)create the two demo learners and print how they diverge

Options for the server: --port 8000 --host 127.0.0.1 --no-browser
"""
import argparse
import sys
import threading
import unittest
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

if sys.version_info < (3, 10):
    sys.exit("SkillBridge needs Python 3.10 or newer.")


def main() -> None:
    ap = argparse.ArgumentParser(description="SkillBridge adaptive skills practice")
    ap.add_argument("command", nargs="?", default="serve", choices=["serve", "test", "simulate", "demo"])
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--learners", type=int, default=120, help="simulate: number of synthetic learners")
    args = ap.parse_args()

    if args.command == "test":
        suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"), top_level_dir=str(ROOT))
        sys.exit(0 if unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful() else 1)

    if args.command == "simulate":
        from sim import simulate
        simulate.main(["--learners", str(args.learners)])
        return

    from skillbridge.service import Service
    from skillbridge import demo

    svc = Service()
    if args.command == "demo":
        for name, info in demo.reset_demo(svc).items():
            print(f"{name}: {info['first']} -> {info['next']} ({info['next_skill']})")
            print("   " + info["reasons"][0])
        return

    if not svc.list_profiles():
        print("First run: creating demo learners Priya Nair and Marcus Reed...")
        demo.reset_demo(svc)
    from skillbridge.server import serve
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(f"http://{args.host}:{args.port}")).start()
    serve(args.host, args.port, svc)


if __name__ == "__main__":
    main()
