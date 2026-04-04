"""Data processing pipeline for Austrian baby names.

Downloads and processes CSV file provided by Statistik Austria, generating JSON files
for the static companion site.

Usage:
    python data_processing.py [--source URL_OR_PATH] [--output-dir DIR]
"""

import argparse
import json
from pathlib import Path

import pandas as pd
from loguru import logger

DATA_URL = "https://data.statistik.gv.at/data/OGDEXT_VORNAMEN_1.csv"
RECENT_YEARS_WINDOW = 5


def process_data(
    source: str | Path = DATA_URL,
    recent_years_window: int = RECENT_YEARS_WINDOW,
) -> dict[str, pd.DataFrame]:
    """Process the raw CSV into per-gender DataFrames with statistics.

    Args:
        source: URL or local file path to the raw CSV.
        recent_years_window: Number of recent years for trend stats.

    Each DataFrame has columns: name, percentage_total, absolute_total,
    absolute_recent, percentage_recent, yearly_data (dict).
    Sorted by absolute_total descending.

    Returns dict with keys "boys", "girls", and "mixed".

    """
    source_str = str(source)
    is_url = source_str.startswith(("http://", "https://"))

    if not is_url and not Path(source_str).exists():
        msg = f"Input CSV not found: {source}"
        raise FileNotFoundError(msg)

    logger.info(f"Reading data from {source_str}")
    df = pd.read_csv(source_str, delimiter=";", encoding="utf-8")
    logger.info(f"Loaded {len(df):,} records")

    max_year = df["C-JAHR-0"].max()
    min_year = df["C-JAHR-0"].min()
    recent_start = max_year - (recent_years_window - 1)
    logger.info(
        f"Data spans {min_year}\u2013{max_year}, recent: {recent_start}\u2013{max_year}"
    )

    df_recent = df[df["C-JAHR-0"] >= recent_start]

    results = {}
    for gender_code, gender_name in [(1, "boys"), (2, "girls")]:
        logger.info(f"Processing {gender_name}")
        results[gender_name] = _aggregate_gender(
            df[df["C-GESCHLECHT-0"] == gender_code],
            df_recent[df_recent["C-GESCHLECHT-0"] == gender_code],
        )
        logger.info(f"{gender_name}: {len(results[gender_name]):,} names")

    # Neutral: names appearing in both boys and girls
    common_names = set(results["boys"]["name"]) & set(results["girls"]["name"])
    if common_names:
        logger.info(f"Building mixed list ({len(common_names)} shared names)")
        results["mixed"] = _build_mixed(results["boys"], results["girls"], common_names)
        logger.info(f"mixed: {len(results['mixed']):,} names")

    return results


def _aggregate_gender(df_g: pd.DataFrame, df_g_recent: pd.DataFrame) -> pd.DataFrame:
    """Aggregate a single gender's data into the output format."""
    # Total counts per name
    totals = df_g.groupby("F-VORNAME_NORMALISIERT")["F-ANZAHL_LGEB"].sum().reset_index()
    totals.columns = ["name", "absolute_total"]
    grand_total = totals["absolute_total"].sum()
    totals["percentage_total"] = (totals["absolute_total"] / grand_total * 100).round(4)

    # Recent counts per name
    recents = (
        df_g_recent.groupby("F-VORNAME_NORMALISIERT")["F-ANZAHL_LGEB"]
        .sum()
        .reset_index()
    )
    recents.columns = ["name", "absolute_recent"]
    grand_recent = recents["absolute_recent"].sum()
    recents["percentage_recent"] = (
        recents["absolute_recent"] / grand_recent * 100
    ).round(4)

    # Yearly timeseries per name
    yearly = (
        df_g.groupby(["F-VORNAME_NORMALISIERT", "C-JAHR-0"])["F-ANZAHL_LGEB"]
        .sum()
        .reset_index()
    )
    yearly.columns = ["name", "year", "count"]
    yearly_dicts = (
        yearly.groupby("name")
        .apply(  # type: ignore[call-overload]
            lambda g: {str(int(r["year"])): int(r["count"]) for _, r in g.iterrows()},
            include_groups=False,
        )
        .reset_index()
    )
    yearly_dicts.columns = ["name", "yearly_data"]

    # Merge and clean up
    result = totals.merge(recents, on="name", how="outer").merge(
        yearly_dicts, on="name", how="left"
    )
    result["absolute_recent"] = result["absolute_recent"].fillna(0).astype(int)
    result["percentage_recent"] = result["percentage_recent"].fillna(0).round(4)
    result["yearly_data"] = result["yearly_data"].apply(
        lambda x: x if isinstance(x, dict) else {}
    )

    return (
        result[
            [
                "name",
                "percentage_total",
                "absolute_total",
                "absolute_recent",
                "percentage_recent",
                "yearly_data",
            ]
        ]
        .sort_values("absolute_total", ascending=False)
        .reset_index(drop=True)
    )


def _build_mixed(
    boys: pd.DataFrame, girls: pd.DataFrame, common_names: set[str]
) -> pd.DataFrame:
    """Combine boys + girls stats for names that appear in both."""
    b = boys[boys["name"].isin(common_names)].set_index("name")
    g = girls[girls["name"].isin(common_names)].set_index("name")

    combined = pd.DataFrame(index=b.index)
    combined["absolute_total"] = b["absolute_total"] + g["absolute_total"]
    combined["absolute_recent"] = b["absolute_recent"] + g["absolute_recent"]

    grand_total = combined["absolute_total"].sum()
    grand_recent = combined["absolute_recent"].sum()
    combined["percentage_total"] = (
        combined["absolute_total"] / grand_total * 100
    ).round(4)
    combined["percentage_recent"] = (
        combined["absolute_recent"] / grand_recent * 100
    ).round(4)

    # Merge yearly dicts: sum counts per year
    def merge_yearly(name: str) -> dict[str, int]:
        yb: dict[str, int] = dict(b.loc[name, "yearly_data"]) if name in b.index else {}  # type: ignore[arg-type]
        yg: dict[str, int] = dict(g.loc[name, "yearly_data"]) if name in g.index else {}  # type: ignore[arg-type]
        all_years = set(yb) | set(yg)
        return {y: yb.get(y, 0) + yg.get(y, 0) for y in sorted(all_years)}

    combined["yearly_data"] = [merge_yearly(n) for n in combined.index]

    combined = combined.reset_index().rename(columns={"index": "name"})
    return (
        combined[
            [
                "name",
                "percentage_total",
                "absolute_total",
                "absolute_recent",
                "percentage_recent",
                "yearly_data",
            ]
        ]
        .sort_values("absolute_total", ascending=False)
        .reset_index(drop=True)
    )


def export_json(df: pd.DataFrame, output_path: Path) -> None:
    """Write a processed DataFrame as compact JSON for the static site.

    Format: {"columns": [...], "data": [[name, pct, abs, ...], ...]}
    """
    output = {
        "columns": list(df.columns),
        "data": df.to_numpy().tolist(),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")

    file_size_kb = output_path.stat().st_size / 1024
    logger.info(f"Wrote {output_path} ({file_size_kb:.0f} KB, {len(df):,} names)")


def main() -> None:
    """Run the data processing pipeline."""
    parser = argparse.ArgumentParser(
        description="Process Austrian baby names data from Statistik Austria"
    )
    parser.add_argument(
        "--source",
        type=str,
        default=DATA_URL,
        help="URL or local path to raw CSV (default: data.gv.at URL)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("docs/data"),
        help="Directory for JSON output (default: ./docs/data)",
    )
    args = parser.parse_args()

    data = process_data(args.source)
    for gender, df in data.items():
        export_json(df, args.output_dir / f"{gender}.json")

    logger.success("Done!")


if __name__ == "__main__":
    main()
