"""
run_federated_simulation.py — Runs the Phase 4 federated-learning SIMULATION (src/federated/)
against real processed data and prints a federated-vs-centralized comparison.

SIMULATED — one process, one machine, no real institutions. See src/federated/ package
docstring and src/federated/simulation.py's module docstring for the specific scope-down
decisions (no Ray) and why they don't compromise what this demonstrates.

Run from backend/: `python scripts/run_federated_simulation.py [task_name]`
Defaults to the "skills" task (IBM HR attrition) — the flagship attrition-risk use case this
whole federated spike exists to eventually support in the CEO/head-of-state demo.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.federated.simulation import run_federated_simulation  # noqa: E402


def main():
    task_name = sys.argv[1] if len(sys.argv) > 1 else "skills"
    print(f"{'=' * 70}\nFEDERATED LEARNING SIMULATION — {task_name}\n"
          f"SIMULATED: one process, one machine, no real institutions.\n{'=' * 70}\n")

    result = run_federated_simulation(task_name, num_institutions=3, num_rounds=5, local_epochs=1)

    print(f"\nSimulated institutions: {result['institution_ids']}")
    print(f"Rounds: {result['num_rounds']}\n")
    print(f"{'Round':<8}{'Val Loss':<14}{'Val Metric'}")
    for r in result["round_history"]:
        print(f"{r['round']:<8}{r['val_loss']:<14.4f}{r['val_metric']:.4f}")

    print(f"\n{'-' * 70}")
    print(f"Final federated  : val_loss={result['final_federated_val_loss']:.4f}  "
          f"val_metric={result['final_federated_val_metric']:.4f}")
    print(f"Centralized base : val_loss={result['centralized_val_loss']:.4f}  "
          f"val_metric={result['centralized_val_metric']:.4f}")
    print(f"{'-' * 70}")
    print(f"\n{result['simulation_note']}")


if __name__ == "__main__":
    main()
