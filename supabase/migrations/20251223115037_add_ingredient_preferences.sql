-- Migration: Add Ingredient Preferences
-- Allows users to like/dislike specific ingredients
-- Links to ingredient_nutrition table for consistency

-- ============================================
-- 1. Create ingredient_preferences table
-- ============================================

CREATE TABLE ingredient_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Foreign key to ingredient_nutrition for consistent ingredient data
  ingredient_id UUID NOT NULL REFERENCES ingredient_nutrition(id) ON DELETE CASCADE,

  -- Preference: liked or disliked
  preference TEXT NOT NULL CHECK (preference IN ('liked', 'disliked')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each user can only have one preference per ingredient
  UNIQUE(user_id, ingredient_id)
);

-- ============================================
-- 2. Create indexes for performance
-- ============================================

CREATE INDEX idx_ingredient_preferences_user_id ON ingredient_preferences(user_id);
CREATE INDEX idx_ingredient_preferences_preference ON ingredient_preferences(user_id, preference);
CREATE INDEX idx_ingredient_preferences_ingredient_id ON ingredient_preferences(ingredient_id);

-- ============================================
-- 3. Create updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_ingredient_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ingredient_preferences_updated_at
  BEFORE UPDATE ON ingredient_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredient_preferences_updated_at();

-- ============================================
-- 4. Enable RLS
-- ============================================

ALTER TABLE ingredient_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own ingredient preferences"
  ON ingredient_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own ingredient preferences"
  ON ingredient_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own ingredient preferences"
  ON ingredient_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own preferences
CREATE POLICY "Users can delete own ingredient preferences"
  ON ingredient_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 5. Grant permissions
-- ============================================

GRANT ALL ON ingredient_preferences TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ingredient_preferences TO authenticated;

-- ============================================
-- 6. Create a view for easier querying
-- ============================================

-- This view joins ingredient_preferences with ingredient_nutrition
-- for easy access to ingredient details alongside preferences
CREATE VIEW ingredient_preferences_with_details AS
SELECT
  ip.id,
  ip.user_id,
  ip.ingredient_id,
  ip.preference,
  ip.created_at,
  ip.updated_at,
  ing.name AS ingredient_name,
  ing.name_normalized,
  ing.serving_size,
  ing.serving_unit,
  ing.calories,
  ing.protein,
  ing.carbs,
  ing.fat,
  ing.source
FROM ingredient_preferences ip
JOIN ingredient_nutrition ing ON ip.ingredient_id = ing.id;

-- Grant access to the view
GRANT SELECT ON ingredient_preferences_with_details TO authenticated;
