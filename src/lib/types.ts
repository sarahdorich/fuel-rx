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
  social_feed_enabled: boolean;
  display_name: string | null;
  profile_photo_url: string | null;
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
  profile_photo_url: string | null;
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

export interface ValidatedMealIngredient {
  name: string;
  amount: string;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type CustomMealPrepTime = '5_or_less' | '15' | '30' | 'more_than_30';

export const CUSTOM_MEAL_PREP_TIME_OPTIONS: { value: CustomMealPrepTime; label: string }[] = [
  { value: '5_or_less', label: '5 minutes or less' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: 'more_than_30', label: 'More than 30 minutes' },
];

export interface ValidatedMeal {
  id: string;
  user_id: string;
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: ValidatedMealIngredient[] | null;
  is_user_created: boolean;
  image_url: string | null;
  share_with_community: boolean;
  prep_time: CustomMealPrepTime | null;
  created_at: string;
  updated_at: string;
}

// Social Feed Types

export type SocialFeedSourceType = 'custom_meal' | 'favorited_meal';

export interface SocialFeedPost {
  id: string;
  user_id: string;
  source_type: SocialFeedSourceType;
  source_meal_id: string | null;
  source_meal_plan_id: string | null;
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image_url: string | null;
  prep_time: CustomMealPrepTime | null;
  ingredients: ValidatedMealIngredient[] | null;
  instructions: string[] | null;
  meal_type: MealType | null;
  created_at: string;
  // Joined fields from queries
  author?: {
    id: string;
    display_name: string | null;
    name: string | null;
  };
  is_saved?: boolean;
}

export interface UserFollow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface SavedCommunityMeal {
  id: string;
  user_id: string;
  source_post_id: string;
  original_author_id: string;
  created_at: string;
}

export interface SocialUser {
  id: string;
  display_name: string | null;
  name: string | null;
  social_feed_enabled: boolean;
  is_following?: boolean;
  follower_count?: number;
  following_count?: number;
  post_count?: number;
}
