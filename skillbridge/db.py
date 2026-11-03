"""SQLite persistence. Every learner action is stored, tied to a local profile."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path

from .content import ROOT

DEFAULT_PATH = ROOT / "data" / "skillbridge.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS mastery (
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    mastery REAL NOT NULL,
    updates INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, skill)
);
CREATE TABLE IF NOT EXISTS mastery_history (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    mastery REAL NOT NULL,
    source TEXT NOT NULL,             -- diagnostic | episode
    episode_id INTEGER,
    ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS diagnostics (
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    answers TEXT NOT NULL,            -- JSON {item_id: choice index | null}
    result TEXT NOT NULL,             -- JSON {skill: {correct, mastery}}
    completed_at REAL NOT NULL,
    PRIMARY KEY (profile_id, domain)
);
CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    skills TEXT NOT NULL,             -- JSON list
    difficulty REAL NOT NULL,
    surface_form TEXT NOT NULL,
    status TEXT NOT NULL,             -- active | solved | failed | abandoned
    attempts INTEGER NOT NULL DEFAULT 0,
    hints INTEGER NOT NULL DEFAULT 0,
    score REAL,
    transfer_skills TEXT NOT NULL DEFAULT '[]',
    selection TEXT NOT NULL,          -- JSON: why the engine chose this scenario
    worked_example INTEGER NOT NULL DEFAULT 0,
    started_at REAL NOT NULL,
    ended_at REAL,
    active_seconds REAL,
    mastery_changes TEXT,             -- JSON {skill: [old, new]}
    coach TEXT                        -- JSON cached coach feedback
);
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY,
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL,
    attempt_no INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    failed_skills TEXT NOT NULL,      -- JSON list
    payload TEXT NOT NULL,            -- JSON: submitted code or diagnosis
    result TEXT NOT NULL,             -- JSON: verified evaluator result
    ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL,
    episode_id INTEGER,
    type TEXT NOT NULL,               -- start | edit | run | measure | hint | worked_example | submit | give_up | abandon | complete | coach | diagnostic
    payload TEXT NOT NULL,
    ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS selection_log (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    episode_id INTEGER,
    scenario_id TEXT,
    skill TEXT,
    priority REAL,
    target_difficulty REAL,
    mode TEXT,
    reasons TEXT NOT NULL,
    skills_considered TEXT NOT NULL,
    ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_actions_episode ON actions(episode_id);
CREATE INDEX IF NOT EXISTS idx_episodes_profile ON episodes(profile_id, domain);
CREATE INDEX IF NOT EXISTS idx_submissions_profile ON submissions(profile_id);
"""


def now() -> float:
    return time.time()


def dumps(x) -> str:
    return json.dumps(x, separators=(",", ":"))


class Database:
    def __init__(self, path: str | os.PathLike | None = None):
        self.path = str(path or os.environ.get("SKILLBRIDGE_DB") or DEFAULT_PATH)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._memory_conn = None
        self.conn.executescript(SCHEMA)

    @property
    def conn(self) -> sqlite3.Connection:
        if self.path == ":memory:":
            if self._memory_conn is None:
                self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
                self._memory_conn.row_factory = sqlite3.Row
                self._memory_conn.execute("PRAGMA foreign_keys = ON")
            return self._memory_conn
        c = getattr(self._local, "conn", None)
        if c is None:
            c = sqlite3.connect(self.path, timeout=10)
            c.row_factory = sqlite3.Row
            c.execute("PRAGMA journal_mode = WAL")
            c.execute("PRAGMA foreign_keys = ON")
            self._local.conn = c
        return c

    def close(self) -> None:
        for c in (self._memory_conn, getattr(self._local, "conn", None)):
            if c is not None:
                c.close()
        self._memory_conn = None
        self._local.conn = None

    def q(self, sql: str, args=()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, args).fetchall()

    def one(self, sql: str, args=()):
        return self.conn.execute(sql, args).fetchone()

    def run(self, sql: str, args=()) -> int:
        cur = self.conn.execute(sql, args)
        self.conn.commit()
        return cur.lastrowid

    def log_action(self, profile_id: int, episode_id: int | None, type_: str, payload: dict | None = None, ts: float | None = None) -> int:
        return self.run("INSERT INTO actions(profile_id, episode_id, type, payload, ts) VALUES (?,?,?,?,?)",
                        (profile_id, episode_id, type_, dumps(payload or {}), ts or now()))
