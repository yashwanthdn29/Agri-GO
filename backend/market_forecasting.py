from datetime import date, timedelta
from math import isfinite
from typing import Sequence


MINIMUM_OBSERVATIONS = 30
MINIMUM_TRAINING_OBSERVATIONS = 10
FORECAST_HORIZON_DAYS = 7
MODEL_NAME = "Ordinary least-squares time-trend baseline"


def _fit_linear_trend(x_values: Sequence[float], y_values: Sequence[float]) -> tuple[float, float]:
    mean_x = sum(x_values) / len(x_values)
    mean_y = sum(y_values) / len(y_values)
    variance_x = sum((value - mean_x) ** 2 for value in x_values)
    if variance_x == 0:
        return 0.0, mean_y
    slope = sum(
        (x_value - mean_x) * (y_value - mean_y)
        for x_value, y_value in zip(x_values, y_values)
    ) / variance_x
    return slope, mean_y - slope * mean_x


def _mean_absolute_error(actual: Sequence[float], predicted: Sequence[float]) -> float:
    return sum(abs(observed - estimate) for observed, estimate in zip(actual, predicted)) / len(actual)


def forecast_market_prices(
    observations: Sequence[tuple[date, float]],
    *,
    horizon_days: int = FORECAST_HORIZON_DAYS,
) -> dict:
    series = sorted(
        (day, float(price))
        for day, price in observations
        if price is not None and isfinite(float(price)) and float(price) >= 0
    )
    result = {
        "source": "data.gov.in / AGMARKNET",
        "model": MODEL_NAME,
        "status": "insufficient_history",
        "observed_days": len(series),
        "required_days": MINIMUM_OBSERVATIONS,
        "training_days": 0,
        "validation_days": 0,
        "validation_mae": None,
        "persistence_baseline_mae": None,
        "points": [],
        "message": (
            f"Collect at least {MINIMUM_OBSERVATIONS} distinct reported market dates "
            "for this selection before evaluating a forecast."
        ),
    }
    if len(series) < MINIMUM_OBSERVATIONS:
        return result
    if horizon_days < 1 or horizon_days > 30:
        raise ValueError("horizon_days must be between 1 and 30.")

    origin = series[0][0]
    x_values = [(day - origin).days for day, _ in series]
    y_values = [price for _, price in series]
    split_index = max(MINIMUM_TRAINING_OBSERVATIONS, int(len(series) * 0.8))
    if split_index >= len(series):
        return result

    train_x = x_values[:split_index]
    train_y = y_values[:split_index]
    validation_x = x_values[split_index:]
    validation_y = y_values[split_index:]
    validation_slope, validation_intercept = _fit_linear_trend(train_x, train_y)
    validation_predictions = [
        validation_intercept + validation_slope * value for value in validation_x
    ]
    model_mae = _mean_absolute_error(validation_y, validation_predictions)
    persistence_mae = _mean_absolute_error(
        validation_y,
        [train_y[-1]] * len(validation_y),
    )

    result.update(
        {
            "training_days": len(train_y),
            "validation_days": len(validation_y),
            "validation_mae": round(model_mae, 2),
            "persistence_baseline_mae": round(persistence_mae, 2),
        }
    )
    if model_mae >= persistence_mae:
        result.update(
            {
                "status": "baseline_not_better",
                "message": (
                    "The time-trend model did not outperform a last-reported-price "
                    "baseline on the held-out dates. No forecast is shown."
                ),
            }
        )
        return result

    slope, intercept = _fit_linear_trend(x_values, y_values)
    last_day = series[-1][0]
    result.update(
        {
            "status": "available",
            "trend_per_day": round(slope, 4),
            "as_of_date": last_day.isoformat(),
            "points": [
                {
                    "date": (last_day + timedelta(days=offset)).isoformat(),
                    "modal_price": round(
                        max(0.0, intercept + slope * (x_values[-1] + offset)),
                        2,
                    ),
                }
                for offset in range(1, horizon_days + 1)
            ],
            "message": (
                "Research baseline trained on stored AGMARKNET observations and "
                "compared with a persistence baseline on later, held-out dates. "
                "This experimental trend is not a guaranteed mandi quote or a "
                "substitute for local agronomic or selling advice."
            ),
        }
    )
    return result
