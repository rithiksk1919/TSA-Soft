"""What did I get wrong? Lists the mistakes in the Action Log extension's saved actions
(data/action-log/*.jsonl). The logic lives in skillbridge/action_mistakes.py, which the school
hub's "Your mistakes" panel also uses.

usage: python scripts/mistakes.py [--since today|2h|30m|YYYY-MM-DD] [--dir data/action-log] [--json]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from skillbridge.action_mistakes import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
