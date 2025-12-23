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

// Prep style preferences
export type PrepStyle = 'traditional_batch' | 'night_before' | 'day_of' | 'mixed';

export type MealComplexity = 'quick_assembly' | 'minimal_prep' | 'full_recipe';

export const PREP_STYLE_LABELS: Record<PrepStyle, { title: string; description: string }> = {
  traditional_batch: {
    title: 'Traditional Batch Prep',
    description: 'Prep all meals on Sunday (or one day per week)',
  },
  night_before: {
    title: 'Night Before',
    description: "Prep tomorrow's meals the night before",
  },
  day_of: {
    title: 'Day-Of Fresh Cooking',
    description: 'Cook each meal fresh when you eat it',
  },
  mixed: {
    title: 'Mixed/Flexible',
    description: 'Combination: batch some proteins, simple breakfasts/lunches, fresh dinners',
  },
};

export const MEAL_COMPLEXITY_LABELS: Record<MealComplexity, { title: string; time: string; example: string }> = {
  quick_assembly: {
    title: 'Quick Assembly',
    time: '2-10 min',
    example: '2 eggs, avocado, tomatoes',
  },
  minimal_prep: {
    title: 'Minimal Prep',
    time: '10-20 min',
    example: 'Veggie omelet, overnight oats',
  },
  full_recipe: {
    title: 'Full Recipe',
    time: '20-45 min',
    example: 'Breakfast burrito bowl, frittata',
  },
};

export const DEFAULT_PREP_STYLE: PrepStyle = 'mixed';

export interface MealComplexityPrefs {
  breakfast: MealComplexity;
  lunch: MealComplexity;
  dinner: MealComplexity;
}

export const DEFAULT_MEAL_COMPLEXITY_PREFS: MealComplexityPrefs = {
  breakfast: 'minimal_prep',
  lunch: 'minimal_prep',
  dinner: 'full_recipe',
};

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
  ingredient_variety_prefs: IngredientVarietyPrefs;
  // Prep style preferences
  prep_style: PrepStyle;
  breakfast_complexity: MealComplexity;
  lunch_complexity: MealComplexity;
  dinner_complexity: MealComplexity;
  // Household servings preferences
  household_servings: HouseholdServingsPrefs;
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
  // Optional nutrition data (populated by LLM, can be overridden by user)
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

// Extended ingredient with required nutrition data
export interface IngredientWithNutrition extends Omit<Ingredient, 'calories' | 'protein' | 'carbs' | 'fat'> {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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

// Meal with ingredient-level nutrition data
export interface MealWithIngredientNutrition {
  name: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  prep_time_minutes: number;
  ingredients: IngredientWithNutrition[];
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
  ingredient_variety_prefs: IngredientVarietyPrefs;
  // Prep style preferences
  prep_style: PrepStyle;
  breakfast_complexity: MealComplexity;
  lunch_complexity: MealComplexity;
  dinner_complexity: MealComplexity;
  // Household servings preferences
  household_servings: HouseholdServingsPrefs;
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
  meal_prep_instructions: string | null;
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
  meal_prep_instructions: string | null;
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

// ============================================
// Two-Stage Generation & Prep Mode Types
// ============================================

// Ingredient categories for core ingredient selection
export type IngredientCategory = 'proteins' | 'vegetables' | 'fruits' | 'grains' | 'fats' | 'pantry';

// User preferences for how many ingredients per category
export interface IngredientVarietyPrefs {
  proteins: number;
  vegetables: number;
  fruits: number;
  grains: number;
  fats: number;
  pantry: number;
}

export const DEFAULT_INGREDIENT_VARIETY_PREFS: IngredientVarietyPrefs = {
  proteins: 3,
  vegetables: 5,
  fruits: 2,
  grains: 2,
  fats: 3,
  pantry: 3,
};

export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  proteins: 'Proteins',
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  grains: 'Grains & Starches',
  fats: 'Healthy Fats',
  pantry: 'Pantry Staples',
};

export const INGREDIENT_VARIETY_RANGES: Record<IngredientCategory, { min: number; max: number }> = {
  proteins: { min: 1, max: 5 },
  vegetables: { min: 2, max: 8 },
  fruits: { min: 1, max: 5 },
  grains: { min: 1, max: 4 },
  fats: { min: 1, max: 5 },
  pantry: { min: 1, max: 5 },
};

// Core ingredients selected in Stage 1
export interface CoreIngredients {
  proteins: string[];
  vegetables: string[];
  fruits: string[];
  grains: string[];
  fats: string[];
  pantry: string[];
}

// Individual ingredient stored in meal_plan_ingredients table
export interface MealPlanIngredient {
  id: string;
  meal_plan_id: string;
  category: IngredientCategory;
  ingredient_name: string;
  quantity: string | null;
  notes: string | null;
  created_at: string;
}

// Day reference for prep mode
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// Household servings preferences - how many additional people to feed per day/meal
export interface HouseholdServingCount {
  adults: number;   // Additional adults beyond the main user (each counts as 1x portion)
  children: number; // Children (each counts as ~0.6x portion)
}

export interface DayHouseholdServings {
  breakfast: HouseholdServingCount;
  lunch: HouseholdServingCount;
  dinner: HouseholdServingCount;
  snacks: HouseholdServingCount;
}

export type HouseholdServingsPrefs = Record<DayOfWeek, DayHouseholdServings>;

export const DEFAULT_HOUSEHOLD_SERVING_COUNT: HouseholdServingCount = {
  adults: 0,
  children: 0,
};

export const DEFAULT_DAY_HOUSEHOLD_SERVINGS: DayHouseholdServings = {
  breakfast: { adults: 0, children: 0 },
  lunch: { adults: 0, children: 0 },
  dinner: { adults: 0, children: 0 },
  snacks: { adults: 0, children: 0 },
};

export const DEFAULT_HOUSEHOLD_SERVINGS_PREFS: HouseholdServingsPrefs = {
  monday: { ...DEFAULT_DAY_HOUSEHOLD_SERVINGS },
  tuesday: { ...DEFAULT_DAY_HOUSEHOLD_SERVINGS },
  wednesday: { ...DEFAULT_DAY_HOUSEHOLD_SERVINGS },
  thursday: { ...DEFAULT_DAY_HOUSEHOLD_SERVINGS },
  friday: { ...DEFAULT_DAY_HOUSEHOLD_SERVINGS },
  saturday: { ...DEFAULT_DAY_HOUSEHOLD_SERVINGS },
  sunday: { ...DEFAULT_DAY_HOUSEHOLD_SERVINGS },
};

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export const DAYS_OF_WEEK: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Child portion multiplier (children typically eat 60% of adult portions)
export const CHILD_PORTION_MULTIPLIER = 0.6;

// Prep item in a prep session
export interface PrepItem {
  item: string;
  quantity: string;
  ingredients?: string[];
  method?: string;
  storage: string;
  feeds: Array<{ day: DayOfWeek; meal: MealType }>;
}

// Daily assembly instructions for a single day
export interface DailyAssemblyDay {
  breakfast?: { time: string; instructions: string };
  lunch?: { time: string; instructions: string };
  dinner?: { time: string; instructions: string };
  snack?: { time: string; instructions: string };
}

// Daily assembly for all days
export type DailyAssembly = Partial<Record<DayOfWeek, DailyAssemblyDay>>;

// Cooking temperature information for prep tasks
export interface CookingTemps {
  oven?: string;          // e.g., "400°F" or "200°C"
  stovetop?: string;      // e.g., "medium-high heat"
  internal_temp?: string; // e.g., "145°F for salmon"
  grill?: string;         // e.g., "medium-high, 400-450°F"
}

// Cooking time information for prep tasks
export interface CookingTimes {
  prep_time?: string;     // e.g., "5 min"
  cook_time?: string;     // e.g., "15-20 min"
  rest_time?: string;     // e.g., "5 min before serving"
  total_time?: string;    // e.g., "25-30 min"
}

// Prep task for the new collapsible prep view
export interface PrepTask {
  id: string;
  description: string;              // Brief task title
  detailed_steps: string[];         // Step-by-step instructions with specifics
  cooking_temps?: CookingTemps;     // Temperature information if applicable
  cooking_times?: CookingTimes;     // Time breakdowns
  tips?: string[];                  // Pro tips for the task
  storage?: string;                 // Storage instructions (e.g., "Refrigerate in airtight container for up to 5 days")
  estimated_minutes: number;
  meal_ids: string[];
  completed: boolean;
}

// Session type for prep scheduling
export type PrepSessionType = 'weekly_batch' | 'night_before' | 'day_of_morning' | 'day_of_dinner';

// Prep session stored in prep_sessions table
export interface PrepSession {
  id: string;
  meal_plan_id: string;
  session_name: string;
  session_order: number;
  estimated_minutes: number | null;
  prep_items: PrepItem[];
  feeds_meals: Array<{ day: DayOfWeek; meal: MealType }>;
  instructions: string | null;
  daily_assembly: DailyAssembly | null;
  // New fields for collapsible prep view
  session_type: PrepSessionType;
  session_day: DayOfWeek | null;
  session_time_of_day: 'morning' | 'afternoon' | 'night' | null;
  prep_for_date: string | null;
  prep_tasks: { tasks: PrepTask[] };
  display_order: number;
  created_at: string;
  updated_at?: string;
}

// Extended meal plan with two-stage generation data
export interface MealPlanWithPrepMode extends MealPlan {
  core_ingredients: CoreIngredients | null;
  prep_sessions?: PrepSession[];
}

// Response from Stage 1 LLM call
export interface Stage1Response {
  proteins: string[];
  vegetables: string[];
  fruits: string[];
  grains: string[];
  fats: string[];
  pantry: string[];
}

// Response from Stage 3 (Prep Mode) LLM call
export interface PrepModeResponse {
  prepSessions: Array<{
    sessionName: string;
    sessionOrder: number;
    estimatedMinutes: number;
    instructions: string;
    prepItems: PrepItem[];
  }>;
  dailyAssembly: DailyAssembly;
}

// ============================================
// Ingredient Nutrition Cache Types
// ============================================

export interface IngredientNutrition {
  id: string;
  name: string;
  name_normalized: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  source: 'llm_estimated' | 'usda' | 'user_corrected';
  usda_fdc_id?: string;
  confidence_score?: number;
  validated?: boolean;
  created_at: string;
  updated_at: string;
}

// User override for ingredient nutrition (pending expert validation)
export type IngredientOverrideValidationStatus = 'pending' | 'approved' | 'rejected';

export interface IngredientNutritionUserOverride {
  id: string;
  user_id: string;
  ingredient_name: string;
  ingredient_name_normalized: string;
  serving_size: number;
  serving_unit: string;
  original_calories?: number;
  original_protein?: number;
  original_carbs?: number;
  original_fat?: number;
  override_calories: number;
  override_protein: number;
  override_carbs: number;
  override_fat: number;
  meal_plan_id?: string;
  meal_name?: string;
  validation_status: IngredientOverrideValidationStatus;
  validated_by?: string;
  validated_at?: string;
  validation_notes?: string;
  created_at: string;
  updated_at: string;
}

// Core ingredient with quantity estimation for weekly calorie targets
export interface CoreIngredientWithQuantity {
  name: string;
  category: IngredientCategory;
  weeklyQuantity: string; // e.g., "4 lbs", "2 dozen"
  estimatedWeeklyCalories: number;
  estimatedWeeklyProtein: number;
  estimatedWeeklyCarbs: number;
  estimatedWeeklyFat: number;
}
