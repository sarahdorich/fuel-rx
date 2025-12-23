-- Migration: Remove redundant name columns from ingredient_nutrition
-- The ingredient name now lives in the ingredients dimension table
-- ingredient_nutrition only needs to store nutrition data per serving size

-- Drop the old unique index that references name_normalized
DROP INDEX IF EXISTS idx_ingredient_nutrition_name;

-- Remove the name columns (they're now redundant)
ALTER TABLE ingredient_nutrition
DROP COLUMN IF EXISTS name,
DROP COLUMN IF EXISTS name_normalized;
