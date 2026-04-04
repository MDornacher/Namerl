"""Tests for data processing pipeline."""

from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd
import pytest

from data_processing import process_data


@pytest.fixture
def sample_original_csv(tmp_path):
    """Create a sample original CSV for testing."""
    csv_content = """C-JAHR-0;C-GESCHLECHT-0;F-VORNAME_NORMALISIERT;F-ANZAHL_LGEB
2020;1;Max;100
2020;1;Lukas;80
2020;2;Anna;90
2020;2;Sophie;85
2021;1;Max;110
2021;1;Lukas;85
2021;2;Anna;95
2021;2;Sophie;90
2022;1;Max;105
2022;1;Lukas;90
2022;2;Anna;100
2022;2;Sophie;95
2023;1;Max;115
2023;1;Lukas;95
2023;2;Anna;105
2023;2;Sophie;100
2024;1;Max;120
2024;1;Lukas;100
2024;2;Anna;110
2024;2;Sophie;105
2019;1;Max;95
2019;1;Lukas;75
2019;2;Anna;85
2019;2;Sophie;80
2018;1;Max;90
2018;1;Lukas;70
2018;2;Anna;80
2018;2;Sophie;75"""

    csv_path = tmp_path / "test_original.csv"
    csv_path.write_text(csv_content)
    return csv_path


@pytest.fixture
def sample_csv_with_shared_names(tmp_path):
    """CSV where some names appear in both genders."""
    csv_content = """C-JAHR-0;C-GESCHLECHT-0;F-VORNAME_NORMALISIERT;F-ANZAHL_LGEB
2023;1;Alex;50
2023;1;Max;100
2023;2;Alex;30
2023;2;Anna;80
2024;1;Alex;60
2024;1;Max;110
2024;2;Alex;40
2024;2;Anna;90"""

    csv_path = tmp_path / "test_shared.csv"
    csv_path.write_text(csv_content)
    return csv_path


def test_process_data_returns_both_genders(sample_original_csv):
    result = process_data(sample_original_csv)

    assert "boys" in result
    assert "girls" in result
    assert isinstance(result["boys"], pd.DataFrame)
    assert isinstance(result["girls"], pd.DataFrame)


def test_process_data_output_structure(sample_original_csv):
    result = process_data(sample_original_csv)

    expected_columns = [
        "name",
        "percentage_total",
        "absolute_total",
        "absolute_recent",
        "percentage_recent",
        "yearly_data",
    ]

    assert list(result["boys"].columns) == expected_columns
    assert list(result["girls"].columns) == expected_columns

    for _, row in result["boys"].iterrows():
        assert isinstance(row["yearly_data"], dict)


def test_process_data_correct_aggregation(sample_original_csv):
    result = process_data(sample_original_csv)
    boys = result["boys"]

    max_row = boys[boys["name"] == "Max"].iloc[0]
    expected_total = 90 + 95 + 100 + 110 + 105 + 115 + 120  # 2018-2024
    assert max_row["absolute_total"] == expected_total


def test_process_data_recent_period_correct(sample_original_csv):
    result = process_data(sample_original_csv, recent_years_window=5)
    boys = result["boys"]

    max_row = boys[boys["name"] == "Max"].iloc[0]
    expected_recent = 100 + 110 + 105 + 115 + 120  # 2020-2024
    assert max_row["absolute_recent"] == expected_recent


def test_process_data_sorted_by_popularity(sample_original_csv):
    boys = process_data(sample_original_csv)["boys"]
    assert boys["absolute_total"].is_monotonic_decreasing


def test_process_data_percentages_add_to_100(sample_original_csv):
    boys = process_data(sample_original_csv)["boys"]
    total_pct = boys["percentage_total"].sum()
    assert abs(total_pct - 100.0) < 0.01


def test_process_data_missing_input_file():
    with TemporaryDirectory() as tmpdir:
        non_existent = Path(tmpdir) / "does_not_exist.csv"
        with pytest.raises(FileNotFoundError, match="Input CSV not found"):
            process_data(non_existent)


def test_process_data_separates_genders(sample_original_csv):
    result = process_data(sample_original_csv)
    assert set(result["boys"]["name"]) == {"Max", "Lukas"}
    assert set(result["girls"]["name"]) == {"Anna", "Sophie"}


def test_mixed_contains_shared_names(sample_csv_with_shared_names):
    result = process_data(sample_csv_with_shared_names)
    assert "mixed" in result
    assert set(result["mixed"]["name"]) == {"Alex"}


def test_mixed_combines_totals(sample_csv_with_shared_names):
    result = process_data(sample_csv_with_shared_names)
    alex = result["mixed"][result["mixed"]["name"] == "Alex"].iloc[0]

    # Boys: 50 + 60 = 110, Girls: 30 + 40 = 70 → combined 180
    assert alex["absolute_total"] == 180


def test_mixed_combines_yearly(sample_csv_with_shared_names):
    result = process_data(sample_csv_with_shared_names)
    alex = result["mixed"][result["mixed"]["name"] == "Alex"].iloc[0]

    # 2023: boys 50 + girls 30 = 80, 2024: boys 60 + girls 40 = 100
    assert alex["yearly_data"] == {"2023": 80, "2024": 100}


def test_mixed_not_present_when_no_overlap(sample_original_csv):
    """No shared names between boys and girls → no mixed key."""
    result = process_data(sample_original_csv)
    assert "mixed" not in result


def test_shared_names_remain_in_gender_tabs(sample_csv_with_shared_names):
    result = process_data(sample_csv_with_shared_names)
    assert "Alex" in result["boys"]["name"].values
    assert "Alex" in result["girls"]["name"].values
