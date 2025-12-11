// Unit conversion constants and utilities for converting ingredient amounts to grams
// This is needed to calculate macros from USDA data which is based on 100g servings

// Conversion factors to grams
const UNIT_TO_GRAMS: Record<string, number> = {
  // Weight units
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,

  // Volume units (approximate conversions for water-like density)
  // These are rough approximations - actual conversion depends on ingredient density
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  'fl oz': 29.5735,
  'fluid ounce': 29.5735,
  'fluid ounces': 29.5735,
};

// Density adjustments for common ingredient categories
// Multiplied with volume conversion to get more accurate gram weights
const DENSITY_MULTIPLIERS: Record<string, number> = {
  // Liquids (baseline density ~1)
  water: 1,
  milk: 1.03,
  'olive oil': 0.92,
  oil: 0.92,
  honey: 1.42,
  'maple syrup': 1.37,

  // Flour and powders (less dense)
  flour: 0.53,
  'almond flour': 0.48,
  'coconut flour': 0.45,
  'protein powder': 0.4,
  'cocoa powder': 0.45,
  sugar: 0.85,
  'brown sugar': 0.83,

  // Grains and rice (variable)
  rice: 0.75,
  oats: 0.35,
  'rolled oats': 0.35,
  quinoa: 0.73,

  // Vegetables (leafy are less dense)
  spinach: 0.25,
  lettuce: 0.2,
  kale: 0.25,
  'mixed greens': 0.22,

  // Nuts and seeds
  almonds: 0.6,
  walnuts: 0.55,
  'peanut butter': 1.05,
  'almond butter': 1.05,

  // Dairy
  'greek yogurt': 1.05,
  yogurt: 1.03,
  'cottage cheese': 0.95,
  cheese: 0.9,
  butter: 0.91,
};

// Standard item weights for "count" units (eggs, fruits, etc.)
const ITEM_WEIGHTS_GRAMS: Record<string, number> = {
  egg: 50,
  eggs: 50,
  'large egg': 50,
  'large eggs': 50,
  banana: 118,
  bananas: 118,
  apple: 182,
  apples: 182,
  orange: 131,
  oranges: 131,
  avocado: 150,
  avocados: 150,
  'chicken breast': 174,
  'chicken breasts': 174,
  'salmon fillet': 170,
  'salmon fillets': 170,
  'sweet potato': 130,
  'sweet potatoes': 130,
  potato: 150,
  potatoes: 150,
  tomato: 123,
  tomatoes: 123,
  onion: 110,
  onions: 110,
  garlic: 3, // single clove
  'garlic clove': 3,
  'garlic cloves': 3,
  clove: 3,
  cloves: 3,
  lemon: 58,
  lemons: 58,
  lime: 44,
  limes: 44,
  slice: 30, // generic slice (bread, etc)
  slices: 30,
  piece: 100, // generic piece
  pieces: 100,
};

export interface ConversionResult {
  grams: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Converts an ingredient amount to grams
 * @param amount - The numeric amount (e.g., "2", "1.5")
 * @param unit - The unit of measurement (e.g., "cups", "oz", "large")
 * @param ingredientName - The name of the ingredient for density/item weight lookups
 * @returns ConversionResult with grams and confidence level
 */
export function convertToGrams(
  amount: string,
  unit: string,
  ingredientName: string
): ConversionResult {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) {
    return { grams: 100, confidence: 'low' }; // Default fallback
  }

  const normalizedUnit = unit.toLowerCase().trim();
  const normalizedIngredient = ingredientName.toLowerCase().trim();

  // Check if it's a countable item (eggs, bananas, etc.)
  if (isCountableItem(normalizedUnit, normalizedIngredient)) {
    const itemWeight = getItemWeight(normalizedIngredient);
    if (itemWeight) {
      return { grams: numericAmount * itemWeight, confidence: 'high' };
    }
  }

  // Check if we have a direct unit conversion
  const baseConversion = UNIT_TO_GRAMS[normalizedUnit];
  if (baseConversion) {
    // For volume units, apply density multiplier if available
    if (isVolumeUnit(normalizedUnit)) {
      const densityMultiplier = getDensityMultiplier(normalizedIngredient);
      return {
        grams: numericAmount * baseConversion * densityMultiplier,
        confidence: densityMultiplier !== 1 ? 'high' : 'medium',
      };
    }
    // Weight units are direct conversion
    return { grams: numericAmount * baseConversion, confidence: 'high' };
  }

  // Fallback: assume it's a count of standard items
  const itemWeight = getItemWeight(normalizedIngredient);
  if (itemWeight) {
    return { grams: numericAmount * itemWeight, confidence: 'medium' };
  }

  // Last resort: assume 100g per unit
  return { grams: numericAmount * 100, confidence: 'low' };
}

function isCountableItem(unit: string, ingredient: string): boolean {
  const countableUnits = [
    'large', 'medium', 'small', 'whole', 'piece', 'pieces',
    'slice', 'slices', 'clove', 'cloves', 'fillet', 'fillets',
    'breast', 'breasts', 'thigh', 'thighs', ''
  ];
  return countableUnits.includes(unit) || unit === '' || !isNaN(parseFloat(unit));
}

function isVolumeUnit(unit: string): boolean {
  const volumeUnits = [
    'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters',
    'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons',
    'tsp', 'teaspoon', 'teaspoons', 'fl oz', 'fluid ounce', 'fluid ounces'
  ];
  return volumeUnits.includes(unit);
}

function getItemWeight(ingredient: string): number | null {
  // Direct match
  if (ITEM_WEIGHTS_GRAMS[ingredient]) {
    return ITEM_WEIGHTS_GRAMS[ingredient];
  }

  // Partial match
  for (const [key, weight] of Object.entries(ITEM_WEIGHTS_GRAMS)) {
    if (ingredient.includes(key) || key.includes(ingredient)) {
      return weight;
    }
  }

  return null;
}

function getDensityMultiplier(ingredient: string): number {
  // Direct match
  if (DENSITY_MULTIPLIERS[ingredient]) {
    return DENSITY_MULTIPLIERS[ingredient];
  }

  // Partial match
  for (const [key, multiplier] of Object.entries(DENSITY_MULTIPLIERS)) {
    if (ingredient.includes(key) || key.includes(ingredient)) {
      return multiplier;
    }
  }

  // Default to 1 (water-like density)
  return 1;
}

/**
 * Formats a gram amount back to a user-friendly unit
 * @param grams - Amount in grams
 * @param originalUnit - The original unit to convert back to
 * @returns Formatted string with amount and unit
 */
export function formatFromGrams(grams: number, originalUnit: string): string {
  const normalizedUnit = originalUnit.toLowerCase().trim();
  const conversion = UNIT_TO_GRAMS[normalizedUnit];

  if (conversion) {
    const amount = grams / conversion;
    // Round to reasonable precision
    const rounded = Math.round(amount * 10) / 10;
    return `${rounded}`;
  }

  // For countable items, return rounded whole numbers
  return `${Math.round(grams / 100)}`;
}
