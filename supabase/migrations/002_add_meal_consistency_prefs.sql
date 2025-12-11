-- Add meal_consistency_prefs column to user_profiles
-- This allows users to specify which meal types should be consistent (same every day)
-- vs varied (different each day)

ALTER TABLE user_profiles
ADD COLUMN meal_consistency_prefs JSONB DEFAULT '{"breakfast": "varied", "lunch": "varied", "dinner": "varied", "snack": "varied"}'::jsonb;

-- Add a comment for documentation
COMMENT ON COLUMN user_profiles.meal_consistency_prefs IS 'User preferences for meal variety. Each meal type can be "consistent" (same meal every day) or "varied" (different meals each day)';
