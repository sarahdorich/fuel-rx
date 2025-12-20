-- Migration: Add ingredient nutrition user overrides and validated field
-- This migration adds:
-- 1. A table for user-submitted ingredient nutrition overrides (for expert validation)
-- 2. A validated field to ingredient_nutrition table

-- ============================================
-- 1. Add validated field to ingredient_nutrition
-- ============================================

ALTER TABLE ingredient_nutrition
ADD COLUMN IF NOT EXISTS validated BOOLEAN DEFAULT FALSE;

-- Add index for querying validated ingredients
CREATE INDEX IF NOT EXISTS idx_ingredient_nutrition_validated
  ON ingredient_nutrition(validated) WHERE validated = true;

-- ============================================
-- 2. Create ingredient_nutrition_user_override table
-- ============================================

CREATE TABLE ingredient_nutrition_user_override (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User who submitted the override
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ingredient identification (matches ingredient_nutrition format)
  ingredient_name TEXT NOT NULL,
  ingredient_name_normalized TEXT NOT NULL, -- lowercase, trimmed for matching

  -- Serving info for this override
  serving_size DECIMAL NOT NULL,
  serving_unit TEXT NOT NULL,

  -- Original LLM-provided values (for comparison)
  original_calories INTEGER,
  original_protein DECIMAL,
  original_carbs DECIMAL,
  original_fat DECIMAL,

  -- User-corrected values
  override_calories INTEGER NOT NULL,
  override_protein DECIMAL NOT NULL,
  override_carbs DECIMAL NOT NULL,
  override_fat DECIMAL NOT NULL,

  -- Context: which meal plan and meal this came from
  meal_plan_id UUID REFERENCES meal_plans(id) ON DELETE SET NULL,
  meal_name TEXT,

  -- Validation status
  validation_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint for upsert (one override per user per ingredient per serving)
CREATE UNIQUE INDEX idx_ingredient_override_unique
  ON ingredient_nutrition_user_override(user_id, ingredient_name_normalized, serving_size, serving_unit);

-- Create indexes for efficient queries
CREATE INDEX idx_ingredient_override_user ON ingredient_nutrition_user_override(user_id);
CREATE INDEX idx_ingredient_override_name ON ingredient_nutrition_user_override(ingredient_name_normalized);
CREATE INDEX idx_ingredient_override_status ON ingredient_nutrition_user_override(validation_status);
CREATE INDEX idx_ingredient_override_meal_plan ON ingredient_nutrition_user_override(meal_plan_id);

-- ============================================
-- 3. Create function to update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_ingredient_override_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ingredient_override_updated_at
  BEFORE UPDATE ON ingredient_nutrition_user_override
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredient_override_updated_at();

-- ============================================
-- 4. RLS Policies
-- ============================================

ALTER TABLE ingredient_nutrition_user_override ENABLE ROW LEVEL SECURITY;

-- Users can view their own overrides
CREATE POLICY "Users can view their own ingredient overrides"
  ON ingredient_nutrition_user_override FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own overrides
CREATE POLICY "Users can insert their own ingredient overrides"
  ON ingredient_nutrition_user_override FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending overrides
CREATE POLICY "Users can update their own pending ingredient overrides"
  ON ingredient_nutrition_user_override FOR UPDATE
  USING (auth.uid() = user_id AND validation_status = 'pending');

-- Users can delete their own pending overrides
CREATE POLICY "Users can delete their own pending ingredient overrides"
  ON ingredient_nutrition_user_override FOR DELETE
  USING (auth.uid() = user_id AND validation_status = 'pending');

-- ============================================
-- 5. Grant permissions
-- ============================================

GRANT ALL ON ingredient_nutrition_user_override TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ingredient_nutrition_user_override TO authenticated;

-- ============================================
-- 6. Function to apply validated override to main table
-- ============================================

-- This function can be called by an admin/expert when validating an override
-- It will upsert the validated data into ingredient_nutrition
CREATE OR REPLACE FUNCTION apply_validated_ingredient_override(override_id UUID)
RETURNS VOID AS $$
DECLARE
  override_record ingredient_nutrition_user_override%ROWTYPE;
BEGIN
  -- Get the override record
  SELECT * INTO override_record
  FROM ingredient_nutrition_user_override
  WHERE id = override_id AND validation_status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Override not found or not approved';
  END IF;

  -- Upsert into ingredient_nutrition
  INSERT INTO ingredient_nutrition (
    name, name_normalized, serving_size, serving_unit,
    calories, protein, carbs, fat,
    source, confidence_score, validated
  ) VALUES (
    override_record.ingredient_name,
    override_record.ingredient_name_normalized,
    override_record.serving_size,
    override_record.serving_unit,
    override_record.override_calories,
    override_record.override_protein,
    override_record.override_carbs,
    override_record.override_fat,
    'user_corrected',
    1.0, -- High confidence since it's validated
    TRUE
  )
  ON CONFLICT (name_normalized, serving_size, serving_unit)
  DO UPDATE SET
    calories = EXCLUDED.calories,
    protein = EXCLUDED.protein,
    carbs = EXCLUDED.carbs,
    fat = EXCLUDED.fat,
    source = 'user_corrected',
    confidence_score = 1.0,
    validated = TRUE,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
