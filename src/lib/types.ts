export type DietaryPreference =
  | 'no_restrictions'
  | 'paleo'
  | 'vegetarian'
  | 'gluten_free'
  | 'dairy_free';

export type PrepTime = 5 | 15 | 30 | 45 | 60;

export type MealsPerDay = 3 | 4 | 5 | 6;

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealConsistency = 'consistent' | 'varied';

export type MealConsistencyPrefs = Record<MealType, MealConsistency>;

export const DEFAULT_MEAL_CONSISTENCY_PREFS: MealConsistencyPrefs = {
  breakfast: 'varied',
  lunch: 'varied',
  dinner: 'varied',
  snack: 'varied',
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  weight: number | null;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_calories: number;
  dietary_prefs: DietaryPreference[];
  meals_per_day: MealsPerDay;
  prep_time: PrepTime;
  meal_consistency_prefs: MealConsistencyPrefs;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
  category: 'produce' | 'protein' | 'dairy' | 'grains' | 'pantry' | 'frozen' | 'other';
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  name: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  prep_time_minutes: number;
  ingredients: Ingredient[];
  instructions: string[];
  macros: Macros;
}

export interface DayPlan {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  meals: Meal[];
  daily_totals: Macros;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  title: string | null;
  days: DayPlan[];
  grocery_list: Ingredient[];
  is_favorite: boolean;
  created_at: string;
}

export type MealPreferenceType = 'liked' | 'disliked';

export interface MealPreference {
  id: string;
  user_id: string;
  meal_name: string;
  preference: MealPreferenceType;
  created_at: string;
}

export interface OnboardingData {
  name: string;
  weight: number | null;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_calories: number;
  dietary_prefs: DietaryPreference[];
  meals_per_day: MealsPerDay;
  prep_time: PrepTime;
  meal_consistency_prefs: MealConsistencyPrefs;
}

export const DIETARY_PREFERENCE_LABELS: Record<DietaryPreference, string> = {
  no_restrictions: 'No Restrictions',
  paleo: 'Paleo',
  vegetarian: 'Vegetarian',
  gluten_free: 'Gluten-Free',
  dairy_free: 'Dairy-Free',
};

export const PREP_TIME_OPTIONS: { value: PrepTime; label: string }[] = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '60 minutes' },
];

export const MEALS_PER_DAY_OPTIONS: MealsPerDay[] = [3, 4, 5, 6];

export interface ValidatedMeal {
  id: string;
  user_id: string;
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
  updated_at: string;
}
