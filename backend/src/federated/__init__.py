"""
federated/ — Phase 4 federated-learning SIMULATION (Next-Gen Architecture reconciliation plan).

Read this before touching any file in this package: everything here runs in ONE Python process
on ONE machine. There are no real institutions, no real network boundary, no real privacy
guarantee being enforced by anything outside this code. It demonstrates the *mechanism*
(per-institution local training on a disjoint data partition + central weight aggregation,
using Flower's real client/strategy API) that real federated learning relies on — it is not
itself a production federated deployment, and must never be described as one. See
`simulation.py`'s module docstring for the specific scope-down decisions and why.
"""
