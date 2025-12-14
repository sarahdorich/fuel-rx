-- Add ingredients column to validated_meals_by_user for user-created meals
-- Each ingredient contains name, amount, unit, and its own macros (calories, protein, carbs, fat)
-- The meal's total macros are the sum of all ingredient macros

-- Add ingredients column as JSONB to store array of ingredients with macros
ALTER TABLE validated_meals_by_user
ADD COLUMN ingredients JSONB DEFAULT NULL;

-- Add is_user_created column to distinguish user-created meals from validated AI-generated meals
ALTER TABLE validated_meals_by_user
ADD COLUMN is_user_created BOOLEAN DEFAULT FALSE;

-- Create index for querying user-created meals
CREATE INDEX idx_validated_meals_user_created ON validated_meals_by_user(user_id, is_user_created);

-- Add comment explaining the ingredients structure
COMMENT ON COLUMN validated_meals_by_user.ingredients IS 'JSON array of ingredients, each with: name (string), amount (string), unit (string), calories (integer), protein (integer), carbs (integer), fat (integer)';
