from datetime import date
from pydantic import BaseModel, Field


class WeightIn(BaseModel):
    date: date
    weight_kg: float = Field(gt=20, lt=300)
    waist_cm: float | None = Field(default=None, gt=30, lt=200)


class CheckinIn(BaseModel):
    date: date
    transcript: str = Field(min_length=1, max_length=20000)


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class MealIn(BaseModel):
    date: date
    category: str = Field(pattern="^(breakfast|lunch|dinner|snack)$")
    description: str = Field(min_length=1, max_length=500)
    kcal: int | None = Field(default=None, ge=0, le=5000)
    protein_g: float | None = Field(default=None, ge=0, le=500)
    carbs_g: float | None = Field(default=None, ge=0, le=1000)
    fat_g: float | None = Field(default=None, ge=0, le=500)
    food_groups: str | None = Field(default=None, max_length=200)


class WorkoutIn(BaseModel):
    date: date
    kind: str = Field(pattern="^(x-trainer|run|walk|other)$")
    duration_min: int = Field(ge=1, le=600)
    kcal_burn: int | None = Field(default=None, ge=0, le=3000)
    avg_hr: int | None = Field(default=None, ge=40, le=230)
    notes: str | None = Field(default=None, max_length=500)


class DailyRow(BaseModel):
    date: str
    weight_kg: float | None = None
    waist_cm: float | None = None
    kcal_in_est: int | None = None
    kcal_out_est: int | None = None
    deficit_kcal: int | None = None
    notes: str | None = None
