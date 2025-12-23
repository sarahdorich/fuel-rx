-- Migration: Add Ingredients Dimension Table
-- Separates ingredient identity from nutrition data per serving size
-- This allows:
-- 1. Single source of truth for ingredient identity
-- 2. Multiple serving sizes per ingredient in ingredient_nutrition
-- 3. ingredient_preferences to reference the ingredient, not a specific serving

-- ============================================
-- 1. Create ingredients dimension table
-- ============================================

CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  category TEXT CHECK (category IN ('protein', 'vegetable', 'fruit', 'grain', 'fat', 'dairy', 'pantry', 'other')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_ingredients_name_normalized ON ingredients(name_normalized);
CREATE INDEX idx_ingredients_category ON ingredients(category);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ingredients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredients_updated_at();

-- RLS - ingredients are global/shared
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ingredients"
  ON ingredients FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert ingredients"
  ON ingredients FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update ingredients"
  ON ingredients FOR UPDATE
  USING (true);

-- Grant permissions
GRANT ALL ON ingredients TO postgres, service_role;
GRANT SELECT ON ingredients TO authenticated;

-- ============================================
-- 2. Populate ingredients from existing ingredient_nutrition data
-- ============================================

-- Insert unique ingredients from existing nutrition data
INSERT INTO ingredients (name, name_normalized, category)
SELECT DISTINCT ON (name_normalized)
  name,
  name_normalized,
  CASE
    WHEN name_normalized IN ('chicken breast', 'ground beef 90% lean', 'ground beef 85% lean', 'salmon', 'ground turkey', 'eggs', 'egg whites', 'shrimp', 'tilapia', 'tuna', 'tofu', 'black beans', 'chickpeas') THEN 'protein'
    WHEN name_normalized IN ('greek yogurt', 'cottage cheese', 'milk (2%)', 'milk (whole)', 'almond milk unsweetened', 'cheddar cheese', 'mozzarella cheese', 'parmesan cheese', 'feta cheese') THEN 'dairy'
    WHEN name_normalized IN ('brown rice', 'white rice', 'quinoa', 'oats', 'sweet potato', 'russet potato', 'whole wheat bread', 'whole wheat pasta') THEN 'grain'
    WHEN name_normalized IN ('broccoli', 'spinach', 'kale', 'bell peppers', 'zucchini', 'asparagus', 'green beans', 'carrots', 'cauliflower', 'brussels sprouts', 'tomatoes', 'cucumber', 'onion', 'garlic', 'mushrooms') THEN 'vegetable'
    WHEN name_normalized IN ('banana', 'apple', 'blueberries', 'strawberries', 'mixed berries', 'orange', 'grapes') THEN 'fruit'
    WHEN name_normalized IN ('olive oil', 'coconut oil', 'butter', 'almonds', 'walnuts', 'peanut butter', 'almond butter', 'chia seeds', 'flax seeds', 'avocado') THEN 'fat'
    ELSE 'other'
  END
FROM ingredient_nutrition
ORDER BY name_normalized, created_at;

-- ============================================
-- 3. Add ingredient_id FK to ingredient_nutrition
-- ============================================

-- Add the new column
ALTER TABLE ingredient_nutrition
ADD COLUMN ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE;

-- Populate ingredient_id based on name_normalized match
UPDATE ingredient_nutrition n
SET ingredient_id = i.id
FROM ingredients i
WHERE n.name_normalized = i.name_normalized;

-- For any orphaned nutrition records, create ingredients for them
INSERT INTO ingredients (name, name_normalized, category)
SELECT DISTINCT ON (n.name_normalized)
  n.name,
  n.name_normalized,
  'other'
FROM ingredient_nutrition n
WHERE n.ingredient_id IS NULL
ON CONFLICT (name_normalized) DO NOTHING;

-- Update again to catch any we just inserted
UPDATE ingredient_nutrition n
SET ingredient_id = i.id
FROM ingredients i
WHERE n.name_normalized = i.name_normalized
AND n.ingredient_id IS NULL;

-- Now make ingredient_id NOT NULL
ALTER TABLE ingredient_nutrition
ALTER COLUMN ingredient_id SET NOT NULL;

-- Create index for the FK
CREATE INDEX idx_ingredient_nutrition_ingredient_id ON ingredient_nutrition(ingredient_id);

-- Update unique constraint: now unique per ingredient + serving size + unit
-- First drop the old constraint
DROP INDEX IF EXISTS idx_ingredient_nutrition_unique;

-- Create new unique constraint on ingredient_id + serving_size + serving_unit
CREATE UNIQUE INDEX idx_ingredient_nutrition_unique
  ON ingredient_nutrition(ingredient_id, serving_size, serving_unit);

-- ============================================
-- 4. Update ingredient_preferences to reference ingredients table
-- ============================================

-- Drop the existing FK constraint
ALTER TABLE ingredient_preferences
DROP CONSTRAINT IF EXISTS ingredient_preferences_ingredient_id_fkey;

-- The column is already named ingredient_id, but it currently points to ingredient_nutrition
-- We need to update it to point to ingredients instead

-- First, let's map existing preferences to the new ingredients table
-- Since ingredient_preferences.ingredient_id currently points to ingredient_nutrition,
-- we need to look up the ingredient_id through that table
UPDATE ingredient_preferences ip
SET ingredient_id = n.ingredient_id
FROM ingredient_nutrition n
WHERE ip.ingredient_id = n.id;

-- Add the new FK constraint pointing to ingredients
ALTER TABLE ingredient_preferences
ADD CONSTRAINT ingredient_preferences_ingredient_id_fkey
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;

-- ============================================
-- 5. Update views
-- ============================================

-- Drop the old view
DROP VIEW IF EXISTS ingredient_preferences_with_details;

-- Create updated view that joins through ingredients table
CREATE VIEW ingredient_preferences_with_details AS
SELECT
  ip.id,
  ip.user_id,
  ip.ingredient_id,
  ip.preference,
  ip.created_at,
  ip.updated_at,
  i.name AS ingredient_name,
  i.name_normalized,
  i.category,
  i.description
FROM ingredient_preferences ip
JOIN ingredients i ON ip.ingredient_id = i.id;

-- Grant access to the view
GRANT SELECT ON ingredient_preferences_with_details TO authenticated;

-- ============================================
-- 6. Create a view for nutrition with ingredient details
-- ============================================

CREATE VIEW ingredient_nutrition_with_details AS
SELECT
  n.id,
  n.ingredient_id,
  i.name AS ingredient_name,
  i.name_normalized,
  i.category,
  n.serving_size,
  n.serving_unit,
  n.calories,
  n.protein,
  n.carbs,
  n.fat,
  n.fiber,
  n.sugar,
  n.sodium,
  n.source,
  n.confidence_score,
  n.created_at,
  n.updated_at
FROM ingredient_nutrition n
JOIN ingredients i ON n.ingredient_id = i.id;

GRANT SELECT ON ingredient_nutrition_with_details TO authenticated;

-- ============================================
-- 7. Create helper function to get or create ingredient
-- ============================================

CREATE OR REPLACE FUNCTION get_or_create_ingredient(
  p_name TEXT,
  p_category TEXT DEFAULT 'other'
) RETURNS UUID AS $$
DECLARE
  v_normalized TEXT;
  v_id UUID;
BEGIN
  v_normalized := lower(trim(p_name));

  -- Try to find existing ingredient
  SELECT id INTO v_id
  FROM ingredients
  WHERE name_normalized = v_normalized;

  -- If not found, create it
  IF v_id IS NULL THEN
    INSERT INTO ingredients (name, name_normalized, category)
    VALUES (p_name, v_normalized, p_category)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
