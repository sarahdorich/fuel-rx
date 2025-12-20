-- Migration: Ingredient Nutrition Cache
-- This migration adds a table to cache validated nutrition data for ingredients
-- to ensure consistency across meal plans and improve calorie accuracy.

-- ============================================
-- 1. Create ingredient_nutrition table
-- ============================================

CREATE TABLE ingredient_nutrition (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Ingredient identification
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL, -- lowercase, trimmed for matching

  -- Standard serving info
  serving_size DECIMAL NOT NULL, -- numeric amount
  serving_unit TEXT NOT NULL, -- 'oz', 'cup', 'whole', 'tbsp', etc.

  -- Macros per serving
  calories INTEGER NOT NULL,
  protein DECIMAL NOT NULL,
  carbs DECIMAL NOT NULL,
  fat DECIMAL NOT NULL,

  -- Optional additional nutrients (for future use)
  fiber DECIMAL,
  sugar DECIMAL,
  sodium INTEGER, -- mg

  -- Metadata
  source TEXT DEFAULT 'llm_estimated', -- 'llm_estimated', 'usda', 'user_corrected'
  usda_fdc_id TEXT, -- For future USDA API integration
  confidence_score DECIMAL, -- 0-1, how confident we are in the data

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index on normalized name + serving for deduplication
CREATE UNIQUE INDEX idx_ingredient_nutrition_unique
  ON ingredient_nutrition(name_normalized, serving_size, serving_unit);

-- Index for fast lookups
CREATE INDEX idx_ingredient_nutrition_name ON ingredient_nutrition(name_normalized);

-- ============================================
-- 2. Create function to update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_ingredient_nutrition_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ingredient_nutrition_updated_at
  BEFORE UPDATE ON ingredient_nutrition
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredient_nutrition_updated_at();

-- ============================================
-- 3. RLS Policies
-- ============================================

-- This table is shared across all users (global cache)
-- All authenticated users can read, but only service role can write
ALTER TABLE ingredient_nutrition ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Anyone can view ingredient nutrition"
  ON ingredient_nutrition FOR SELECT
  USING (true);

-- Only service role can insert/update (done server-side)
CREATE POLICY "Service role can insert ingredient nutrition"
  ON ingredient_nutrition FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update ingredient nutrition"
  ON ingredient_nutrition FOR UPDATE
  USING (true);

-- ============================================
-- 4. Grant permissions
-- ============================================

GRANT ALL ON ingredient_nutrition TO postgres, service_role;
GRANT SELECT ON ingredient_nutrition TO authenticated;

-- ============================================
-- 5. Seed with common ingredients
-- ============================================

-- Proteins (per oz unless noted)
INSERT INTO ingredient_nutrition (name, name_normalized, serving_size, serving_unit, calories, protein, carbs, fat, source, confidence_score) VALUES
  ('Chicken breast', 'chicken breast', 4, 'oz', 140, 26, 0, 3, 'usda', 0.95),
  ('Ground beef 90% lean', 'ground beef 90% lean', 4, 'oz', 200, 23, 0, 11, 'usda', 0.95),
  ('Ground beef 85% lean', 'ground beef 85% lean', 4, 'oz', 240, 21, 0, 17, 'usda', 0.95),
  ('Salmon', 'salmon', 4, 'oz', 180, 25, 0, 8, 'usda', 0.95),
  ('Ground turkey', 'ground turkey', 4, 'oz', 170, 21, 0, 9, 'usda', 0.95),
  ('Eggs', 'eggs', 1, 'whole', 70, 6, 0.5, 5, 'usda', 0.95),
  ('Egg whites', 'egg whites', 3, 'tbsp', 25, 5, 0, 0, 'usda', 0.95),
  ('Greek yogurt', 'greek yogurt', 1, 'cup', 130, 17, 8, 0, 'usda', 0.95),
  ('Cottage cheese', 'cottage cheese', 1, 'cup', 220, 28, 8, 5, 'usda', 0.95),
  ('Shrimp', 'shrimp', 4, 'oz', 120, 23, 1, 2, 'usda', 0.95),
  ('Tilapia', 'tilapia', 4, 'oz', 110, 23, 0, 2, 'usda', 0.95),
  ('Tuna', 'tuna', 4, 'oz', 120, 28, 0, 1, 'usda', 0.95),
  ('Tofu', 'tofu', 4, 'oz', 80, 9, 2, 5, 'usda', 0.95),
  ('Black beans', 'black beans', 0.5, 'cup', 110, 7, 20, 0.5, 'usda', 0.95),
  ('Chickpeas', 'chickpeas', 0.5, 'cup', 135, 7, 22, 2, 'usda', 0.95);

-- Grains/Starches (cooked portions)
INSERT INTO ingredient_nutrition (name, name_normalized, serving_size, serving_unit, calories, protein, carbs, fat, source, confidence_score) VALUES
  ('Brown rice', 'brown rice', 1, 'cup', 215, 5, 45, 2, 'usda', 0.95),
  ('White rice', 'white rice', 1, 'cup', 205, 4, 45, 0.5, 'usda', 0.95),
  ('Quinoa', 'quinoa', 1, 'cup', 220, 8, 39, 4, 'usda', 0.95),
  ('Oats', 'oats', 0.5, 'cup', 150, 5, 27, 3, 'usda', 0.95),
  ('Sweet potato', 'sweet potato', 1, 'medium', 105, 2, 24, 0, 'usda', 0.95),
  ('Russet potato', 'russet potato', 1, 'medium', 165, 4, 37, 0, 'usda', 0.95),
  ('Whole wheat bread', 'whole wheat bread', 1, 'slice', 80, 4, 15, 1, 'usda', 0.95),
  ('Whole wheat pasta', 'whole wheat pasta', 1, 'cup', 175, 7, 37, 1, 'usda', 0.95);

-- Vegetables
INSERT INTO ingredient_nutrition (name, name_normalized, serving_size, serving_unit, calories, protein, carbs, fat, source, confidence_score) VALUES
  ('Broccoli', 'broccoli', 1, 'cup', 55, 4, 11, 0.5, 'usda', 0.95),
  ('Spinach', 'spinach', 1, 'cup', 7, 1, 1, 0, 'usda', 0.95),
  ('Kale', 'kale', 1, 'cup', 35, 2, 7, 0.5, 'usda', 0.95),
  ('Bell peppers', 'bell peppers', 1, 'medium', 30, 1, 7, 0, 'usda', 0.95),
  ('Zucchini', 'zucchini', 1, 'medium', 30, 2, 6, 0.5, 'usda', 0.95),
  ('Asparagus', 'asparagus', 1, 'cup', 27, 3, 5, 0, 'usda', 0.95),
  ('Green beans', 'green beans', 1, 'cup', 35, 2, 8, 0, 'usda', 0.95),
  ('Carrots', 'carrots', 1, 'medium', 25, 0.5, 6, 0, 'usda', 0.95),
  ('Cauliflower', 'cauliflower', 1, 'cup', 25, 2, 5, 0, 'usda', 0.95),
  ('Brussels sprouts', 'brussels sprouts', 1, 'cup', 55, 4, 11, 0.5, 'usda', 0.95),
  ('Tomatoes', 'tomatoes', 1, 'medium', 22, 1, 5, 0, 'usda', 0.95),
  ('Cucumber', 'cucumber', 1, 'medium', 16, 0.5, 4, 0, 'usda', 0.95),
  ('Onion', 'onion', 1, 'medium', 45, 1, 11, 0, 'usda', 0.95),
  ('Garlic', 'garlic', 1, 'clove', 5, 0, 1, 0, 'usda', 0.95),
  ('Mushrooms', 'mushrooms', 1, 'cup', 20, 3, 3, 0, 'usda', 0.95);

-- Fruits
INSERT INTO ingredient_nutrition (name, name_normalized, serving_size, serving_unit, calories, protein, carbs, fat, source, confidence_score) VALUES
  ('Banana', 'banana', 1, 'medium', 105, 1, 27, 0.5, 'usda', 0.95),
  ('Apple', 'apple', 1, 'medium', 95, 0.5, 25, 0, 'usda', 0.95),
  ('Blueberries', 'blueberries', 1, 'cup', 85, 1, 21, 0.5, 'usda', 0.95),
  ('Strawberries', 'strawberries', 1, 'cup', 50, 1, 12, 0.5, 'usda', 0.95),
  ('Mixed berries', 'mixed berries', 1, 'cup', 70, 1, 17, 0.5, 'usda', 0.95),
  ('Orange', 'orange', 1, 'medium', 62, 1, 15, 0, 'usda', 0.95),
  ('Grapes', 'grapes', 1, 'cup', 62, 0.5, 16, 0, 'usda', 0.95),
  ('Avocado', 'avocado', 0.5, 'whole', 160, 2, 9, 15, 'usda', 0.95);

-- Fats
INSERT INTO ingredient_nutrition (name, name_normalized, serving_size, serving_unit, calories, protein, carbs, fat, source, confidence_score) VALUES
  ('Olive oil', 'olive oil', 1, 'tbsp', 120, 0, 0, 14, 'usda', 0.95),
  ('Coconut oil', 'coconut oil', 1, 'tbsp', 120, 0, 0, 14, 'usda', 0.95),
  ('Butter', 'butter', 1, 'tbsp', 100, 0, 0, 11, 'usda', 0.95),
  ('Almonds', 'almonds', 1, 'oz', 165, 6, 6, 14, 'usda', 0.95),
  ('Walnuts', 'walnuts', 1, 'oz', 185, 4, 4, 18, 'usda', 0.95),
  ('Peanut butter', 'peanut butter', 2, 'tbsp', 190, 8, 6, 16, 'usda', 0.95),
  ('Almond butter', 'almond butter', 2, 'tbsp', 195, 7, 6, 18, 'usda', 0.95),
  ('Chia seeds', 'chia seeds', 1, 'tbsp', 60, 2, 5, 4, 'usda', 0.95),
  ('Flax seeds', 'flax seeds', 1, 'tbsp', 55, 2, 3, 4, 'usda', 0.95);

-- Dairy
INSERT INTO ingredient_nutrition (name, name_normalized, serving_size, serving_unit, calories, protein, carbs, fat, source, confidence_score) VALUES
  ('Milk (2%)', 'milk (2%)', 1, 'cup', 120, 8, 12, 5, 'usda', 0.95),
  ('Milk (whole)', 'milk (whole)', 1, 'cup', 150, 8, 12, 8, 'usda', 0.95),
  ('Almond milk unsweetened', 'almond milk unsweetened', 1, 'cup', 30, 1, 1, 2.5, 'usda', 0.95),
  ('Cheddar cheese', 'cheddar cheese', 1, 'oz', 115, 7, 0.5, 9, 'usda', 0.95),
  ('Mozzarella cheese', 'mozzarella cheese', 1, 'oz', 85, 6, 1, 6, 'usda', 0.95),
  ('Parmesan cheese', 'parmesan cheese', 1, 'tbsp', 22, 2, 0, 1.5, 'usda', 0.95),
  ('Feta cheese', 'feta cheese', 1, 'oz', 75, 4, 1, 6, 'usda', 0.95);
