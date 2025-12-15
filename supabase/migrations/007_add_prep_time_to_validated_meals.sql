-- Add prep_time column to validated_meals_by_user table
ALTER TABLE validated_meals_by_user
ADD COLUMN prep_time TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN validated_meals_by_user.prep_time IS 'Prep time for custom meals: 5_or_less, 15, 30, more_than_30';
