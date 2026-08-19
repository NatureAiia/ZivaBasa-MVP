# Human Capital — data dictionary

**Source file:** `data/raw/HCP/HR DATA.txt` (tab-separated, 3,310 rows, 36 columns) — the
classic HRDataset_v14 shape. Landed unmodified at `data/raw/human_capital.csv` (converted
from tab- to comma-separated only; no values changed) as the canonical raw file for the
`human_capital` task head.

**Not used:** `data/raw/HCP/tbl_Employee.csv` / `tbl_Action.csv` / `tbl_Perf.csv` — a
normalized relational alternative (1,562 employees) with a real performance-history table,
but `DepID` (1–10) and `ActionID` (10/30/90/91) are undecoded numeric codes with no lookup
table in the repo, so department names and action meanings (hire/term/promotion?) can't be
reconstructed reliably. Kept in `data/raw/HCP/` for reference in case a code legend turns up.

This is real HR data (not a Kaggle proxy standing in for something else), so the mapping
below is direct — but two taxonomy fields genuinely don't exist in this dataset and are
marked `NOT AVAILABLE` rather than fabricated, same "closest analogue, honestly labeled"
convention `config.py` already uses for the employment/productivity tasks.

## Column mapping

| Target raw feature | CSV column(s) | Notes |
|---|---|---|
| join key | `EmpID` | int, unique per row (3,310 rows = 3,310 employees, no repeats observed) |
| role categories | `Department`, `Position`, `PositionID`, `DeptID` | `Department` has 6 human-readable values (Production, Sales, IT/IS, Software Engineering, Admin Offices, Executive Office); `Position` is the job title (~30 distinct); `PositionID`/`DeptID` are the numeric codes behind them |
| employee tenure | `DateofHire`, `DateofTermination` | tenure_years = (`DateofTermination` or today) − `DateofHire`; 2,351/3,310 have no `DateofTermination` (still active) |
| training hours | — | **NOT AVAILABLE.** No training-hours field anywhere in this file. `SpecialProjectsCount` is the closest adjacent signal (count of special projects, not training) — not a substitute, not used as one |
| staff complement | `Department` | headcount_by_department derived via `groupby("Department").size()`; no branch-level field, only department |
| turnover records | `Termd`, `EmploymentStatus`, `TermReason`, `DateofTermination` | `Termd` is a 0/1 flag; `EmploymentStatus` has 5 values (Active, Voluntarily Terminated, Terminated for Cause, Leave of Absence, Future Start); `TermReason` is free text (11 missing = still employed) |
| revenue per employee inputs | `PayRate` (partial) | `PayRate` is an hourly rate, usable as a cost input; `revenue_attributed` is **NOT AVAILABLE** — no revenue/output field exists, so a true revenue-per-employee ratio cannot be built from this file alone |
| mobility / performance | `PerformanceScore`, `PerfScoreID`, `EngagementSurvey`, `EmpSatisfaction`, `LastPerformanceReview_Date`, `DaysLateLast30` | `PerformanceScore` has 4 values (PIP, Needs Improvement, Fully Meets, Exceeds); `EngagementSurvey` is a 1–5 float; `EmpSatisfaction` is 1–5 int; `promotion_count` is **NOT AVAILABLE** — no promotion/grade-change history field exists |

## Columns present but outside the current taxonomy

`MarriedID`, `MaritalStatusID`, `GenderID`, `Sex`, `MaritalDesc`, `CitizenDesc`,
`HispanicLatino`, `RaceDesc`, `DOB`, `State`, `Zip`, `ManagerName`, `ManagerID`,
`RecruitmentSource`, `FromDiversityJobFairID`, `Original DS` — demographic/recruiting
fields not called for by the Human Capital / Employment taxonomy. Kept in the raw file,
not selected into `raw_cols` for any task head (same `select_raw()` explicit-allowlist
behavior already used for the other three sources — nothing gets in unless named).

## Confirmed-missing fields (do not assume present downstream)

- `training_hours_ytd`
- `revenue_attributed`
- `promotion_count`

Any feature-engineering function that references these must either drop them from
`HUMAN_CAPITAL_EXPECTED_COLUMNS` (done — see `config.py`) or source them from a different
file; they must never be silently defaulted to 0/NaN and treated as real zeros, since that
would fabricate signal (this is the bug-9.1 failure mode: a missing column shouldn't produce
a plausible-looking but fictitious value).

## Join strategy

**Row-aligned (employee-level).** `EmpID` is a genuine per-employee join key within this
file. It does **not** overlap with `skill_match`'s `staff_id` (that dataset is a separate
synthetic banking fixture — see `scripts/generate_skill_match_fixture.py`), so cross-dataset
alignment with `skill_match` is still schema-level only, same limitation as the other three
sources. This does not yet close Known Limitation #1; it only means `human_capital`'s own
rows are genuinely one-employee-one-row, not aggregated.
