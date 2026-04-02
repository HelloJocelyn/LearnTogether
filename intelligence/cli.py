from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from .core.config import Settings
from .core.orchestrator import Orchestrator


def _orch() -> Orchestrator:
  return Orchestrator(Settings.from_env())


def cmd_input(args: argparse.Namespace) -> int:
  raw: str
  if args.file:
    raw = Path(args.file).read_text(encoding="utf-8")
  else:
    raw = sys.stdin.read()
  raw = raw.strip()
  if not raw:
    print("No input text.", file=sys.stderr)
    return 1
  orch = _orch()
  intake, kid = orch.ingest(raw, source=args.source)
  print(f"Stored knowledge id={kid}")
  print(f"topic: {intake.topic}")
  print(f"source: {intake.source}")
  return 0


def cmd_plan(args: argparse.Namespace) -> int:
  orch = _orch()
  d = date.fromisoformat(args.date) if args.date else date.today()
  plan = orch.plan_today(today=d)
  print(f"Date: {plan.date}")
  for i, t in enumerate(plan.tasks, 1):
    print(f"{i}. {t.title} ({t.minutes} min) — {t.topic}")
  print(plan.note)
  return 0


def cmd_reflect(args: argparse.Namespace) -> int:
  if args.file:
    text = Path(args.file).read_text(encoding="utf-8")
  elif args.text:
    text = args.text
  else:
    print("Provide reflection text or --file.", file=sys.stderr)
    return 1
  orch = _orch()
  r = orch.reflect(text.strip())
  print(r.text)
  return 0


def main() -> None:
  p = argparse.ArgumentParser(description="Study intelligence CLI")
  sub = p.add_subparsers(dest="cmd", required=True)

  p_in = sub.add_parser("input", help="Ingest study text from stdin or --file")
  p_in.add_argument("--file", "-f", help="Read from file instead of stdin")
  p_in.add_argument("--source", default="cli", help="Source label")
  p_in.set_defaults(func=cmd_input)

  p_plan = sub.add_parser("plan", help="Show today's plan (max 2 tasks by default)")
  p_plan.add_argument("--date", help="ISO date YYYY-MM-DD (default: today)")
  p_plan.set_defaults(func=cmd_plan)

  p_ref = sub.add_parser("reflect", help="Reflection from what felt easy today")
  p_ref.add_argument("text", nargs="?", default=None, help="Or use --file")
  p_ref.add_argument("--file", "-f", help="Read reflection prompt from file")
  p_ref.set_defaults(func=cmd_reflect)

  args = p.parse_args()
  sys.exit(args.func(args))


if __name__ == "__main__":
  main()
