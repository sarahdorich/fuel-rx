import type { DayPlan, Meal, Ingredient, Macros, UserProfile } from './types';
import { getOrFetchIngredient, calculateMacrosForAmount, CachedIngredient } from './usda';
import { convertToGrams } from './unit-conversions';

const TOLERANCE_PERCENT = 5;
const MAX_ADJUSTMENT_ITERATIONS = 5;

interface ValidatedMeal extends Meal {
  validatedMacros: Macros;
  ingredientDetails: Array<{
    name: string;
    amount: string;
    unit: string;
    gramsUsed: number;
    macros: Macros;
    usda_validated: boolean;
  }>;
}

interface ValidatedDayPlan extends Omit<DayPlan, 'meals'> {
  meals: ValidatedMeal[];
  validated_daily_totals: Macros;
}

export interface ValidatedMealPlan {
  days: ValidatedDayPlan[];
  grocery_list: Ingredient[];
  validation_summary: {
    ingredients_validated: number;
    ingredients_fallback: number;
    adjustments_made: boolean;
  };
}

/**
 * Main validation function - validates and adjusts a meal plan to meet macro targets
 */
export async function validateAndAdjustMealPlan(
  plan: { days: DayPlan[]; grocery_list: Ingredient[] },
  profile: UserProfile
): Promise<ValidatedMealPlan> {
  const targetMacros: Macros = {
    calories: profile.target_calories,
    protein: profile.target_protein,
    carbs: profile.target_carbs,
    fat: profile.target_fat,
  };

  let ingredientsValidated = 0;
  let ingredientsFallback = 0;
  let adjustmentsMade = false;

  // Process each day
  const validatedDays: ValidatedDayPlan[] = await Promise.all(
    plan.days.map(async (day) => {
      // Process each meal in the day
      const validatedMeals = await Promise.all(
        day.meals.map(async (meal) => {
          const ingredientDetails = await Promise.all(
            meal.ingredients.map(async (ingredient) => {
              // Get USDA data for this ingredient
              const usdaData = await getOrFetchIngredient(ingredient.name);

              // Convert amount to grams
              const conversion = convertToGrams(
                ingredient.amount,
                ingredient.unit,
                ingredient.name
              );

              let macros: Macros;
              let usda_validated = false;

              if (usdaData) {
                // Calculate macros using USDA data
                macros = calculateMacrosForAmount(usdaData, conversion.grams);
                usda_validated = true;
                ingredientsValidated++;
              } else {
                // Fallback: estimate based on ingredient category
                macros = estimateMacrosForIngredient(ingredient, conversion.grams);
                ingredientsFallback++;
                console.warn(`Using fallback macros for: ${ingredient.name}`);
              }

              return {
                name: ingredient.name,
                amount: ingredient.amount,
                unit: ingredient.unit,
                gramsUsed: conversion.grams,
                macros,
                usda_validated,
              };
            })
          );

          // Calculate validated meal macros by summing ingredient macros
          const validatedMacros = ingredientDetails.reduce(
            (sum, ing) => ({
              calories: sum.calories + ing.macros.calories,
              protein: sum.protein + ing.macros.protein,
              carbs: sum.carbs + ing.macros.carbs,
              fat: sum.fat + ing.macros.fat,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );

          return {
            ...meal,
            validatedMacros,
            ingredientDetails,
          } as ValidatedMeal;
        })
      );

      // Calculate daily totals from validated meals
      const validated_daily_totals = validatedMeals.reduce(
        (sum, meal) => ({
          calories: sum.calories + meal.validatedMacros.calories,
          protein: sum.protein + meal.validatedMacros.protein,
          carbs: sum.carbs + meal.validatedMacros.carbs,
          fat: sum.fat + meal.validatedMacros.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      return {
        ...day,
        meals: validatedMeals,
        validated_daily_totals,
      };
    })
  );

  // Check if adjustments are needed and apply them
  const adjustedDays = await adjustPortionsIfNeeded(validatedDays, targetMacros);
  if (adjustedDays !== validatedDays) {
    adjustmentsMade = true;
  }

  // Regenerate grocery list based on adjusted portions
  const adjustedGroceryList = consolidateGroceryList(adjustedDays);

  // Update the meal macros to use validated values
  const finalDays = adjustedDays.map(day => ({
    ...day,
    meals: day.meals.map(meal => ({
      ...meal,
      macros: meal.validatedMacros,
    })),
    daily_totals: day.validated_daily_totals,
  }));

  return {
    days: finalDays,
    grocery_list: adjustedGroceryList,
    validation_summary: {
      ingredients_validated: ingredientsValidated,
      ingredients_fallback: ingredientsFallback,
      adjustments_made: adjustmentsMade,
    },
  };
}

/**
 * Estimate macros for ingredients where USDA lookup failed
 * Uses category-based estimates as a fallback
 */
function estimateMacrosForIngredient(ingredient: Ingredient, grams: number): Macros {
  // Category-based estimates per 100g
  const categoryEstimates: Record<string, Macros> = {
    protein: { calories: 165, protein: 25, carbs: 0, fat: 7 },
    produce: { calories: 35, protein: 2, carbs: 7, fat: 0.3 },
    dairy: { calories: 100, protein: 8, carbs: 5, fat: 6 },
    grains: { calories: 130, protein: 4, carbs: 27, fat: 1 },
    pantry: { calories: 100, protein: 3, carbs: 20, fat: 2 },
    frozen: { calories: 80, protein: 4, carbs: 15, fat: 1 },
    other: { calories: 100, protein: 5, carbs: 15, fat: 3 },
  };

  const baseEstimate = categoryEstimates[ingredient.category] || categoryEstimates.other;
  const factor = grams / 100;

  return {
    calories: Math.round(baseEstimate.calories * factor),
    protein: Math.round(baseEstimate.protein * factor * 10) / 10,
    carbs: Math.round(baseEstimate.carbs * factor * 10) / 10,
    fat: Math.round(baseEstimate.fat * factor * 10) / 10,
  };
}

/**
 * Check if daily totals are within tolerance and adjust portions if not
 */
async function adjustPortionsIfNeeded(
  days: ValidatedDayPlan[],
  targetMacros: Macros
): Promise<ValidatedDayPlan[]> {
  const adjustedDays = [...days];

  for (let dayIndex = 0; dayIndex < adjustedDays.length; dayIndex++) {
    const day = adjustedDays[dayIndex];
    let currentTotals = day.validated_daily_totals;

    // Check if we need to adjust
    const needsAdjustment = !isWithinTolerance(currentTotals, targetMacros);

    if (!needsAdjustment) {
      continue;
    }

    // Iteratively adjust portions
    let iterations = 0;
    let adjustedDay = { ...day };

    while (!isWithinTolerance(currentTotals, targetMacros) && iterations < MAX_ADJUSTMENT_ITERATIONS) {
      // Calculate adjustment factors for each macro
      const caloriesFactor = targetMacros.calories / Math.max(currentTotals.calories, 1);
      const proteinFactor = targetMacros.protein / Math.max(currentTotals.protein, 1);

      // Use a weighted average factor, prioritizing calories and protein
      const adjustmentFactor = (caloriesFactor * 0.5 + proteinFactor * 0.5);

      // Apply adjustment to all meals proportionally
      adjustedDay = {
        ...adjustedDay,
        meals: adjustedDay.meals.map(meal => {
          const adjustedIngredientDetails = meal.ingredientDetails.map(ing => {
            const newGrams = ing.gramsUsed * adjustmentFactor;
            const factor = newGrams / ing.gramsUsed;
            return {
              ...ing,
              gramsUsed: newGrams,
              amount: (parseFloat(ing.amount) * factor).toFixed(1),
              macros: {
                calories: Math.round(ing.macros.calories * factor),
                protein: Math.round(ing.macros.protein * factor * 10) / 10,
                carbs: Math.round(ing.macros.carbs * factor * 10) / 10,
                fat: Math.round(ing.macros.fat * factor * 10) / 10,
              },
            };
          });

          const newMealMacros = adjustedIngredientDetails.reduce(
            (sum, ing) => ({
              calories: sum.calories + ing.macros.calories,
              protein: sum.protein + ing.macros.protein,
              carbs: sum.carbs + ing.macros.carbs,
              fat: sum.fat + ing.macros.fat,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );

          return {
            ...meal,
            ingredientDetails: adjustedIngredientDetails,
            validatedMacros: newMealMacros,
            ingredients: adjustedIngredientDetails.map(ing => ({
              name: ing.name,
              amount: ing.amount,
              unit: ing.unit,
              category: meal.ingredients.find(i => i.name === ing.name)?.category || 'other',
            })) as Ingredient[],
          };
        }),
      };

      // Recalculate daily totals
      currentTotals = adjustedDay.meals.reduce(
        (sum, meal) => ({
          calories: sum.calories + meal.validatedMacros.calories,
          protein: sum.protein + meal.validatedMacros.protein,
          carbs: sum.carbs + meal.validatedMacros.carbs,
          fat: sum.fat + meal.validatedMacros.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      adjustedDay.validated_daily_totals = currentTotals;
      iterations++;
    }

    adjustedDays[dayIndex] = adjustedDay;
  }

  return adjustedDays;
}

/**
 * Check if actual macros are within tolerance of target macros
 */
function isWithinTolerance(actual: Macros, target: Macros): boolean {
  const checkTolerance = (actualVal: number, targetVal: number): boolean => {
    if (targetVal === 0) return actualVal === 0;
    const variance = Math.abs((actualVal - targetVal) / targetVal) * 100;
    return variance <= TOLERANCE_PERCENT;
  };

  return (
    checkTolerance(actual.calories, target.calories) &&
    checkTolerance(actual.protein, target.protein) &&
    checkTolerance(actual.carbs, target.carbs) &&
    checkTolerance(actual.fat, target.fat)
  );
}

/**
 * Consolidate grocery list from all meals with adjusted portions
 */
function consolidateGroceryList(days: ValidatedDayPlan[]): Ingredient[] {
  const groceryMap = new Map<string, {
    name: string;
    totalAmount: number;
    unit: string;
    category: Ingredient['category'];
    occurrences: number;
  }>();

  for (const day of days) {
    for (const meal of day.meals) {
      for (const ingredient of meal.ingredientDetails) {
        const key = `${ingredient.name.toLowerCase()}-${ingredient.unit.toLowerCase()}`;
        const existing = groceryMap.get(key);

        if (existing) {
          existing.totalAmount += parseFloat(ingredient.amount);
          existing.occurrences++;
        } else {
          const originalIngredient = meal.ingredients.find(
            i => i.name.toLowerCase() === ingredient.name.toLowerCase()
          );
          groceryMap.set(key, {
            name: ingredient.name,
            totalAmount: parseFloat(ingredient.amount),
            unit: ingredient.unit,
            category: originalIngredient?.category || 'other',
            occurrences: 1,
          });
        }
      }
    }
  }

  // Convert map to array and format amounts
  return Array.from(groceryMap.values()).map(item => {
    // Round to reasonable precision
    let formattedAmount: string;
    if (item.totalAmount >= 10) {
      formattedAmount = Math.round(item.totalAmount).toString();
    } else if (item.totalAmount >= 1) {
      formattedAmount = (Math.round(item.totalAmount * 10) / 10).toString();
    } else {
      formattedAmount = (Math.round(item.totalAmount * 100) / 100).toString();
    }

    // Add (xN) suffix if item appears multiple times (for consistent meals)
    const displayName = item.occurrences >= 7
      ? `${item.name} (x7)`
      : item.name;

    return {
      name: displayName,
      amount: formattedAmount,
      unit: item.unit,
      category: item.category,
    };
  }).sort((a, b) => {
    // Sort by category, then by name
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });
}
