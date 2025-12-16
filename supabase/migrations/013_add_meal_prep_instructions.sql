-- Add meal prep instructions to validated_meals_by_user
ALTER TABLE validated_meals_by_user
ADD COLUMN meal_prep_instructions TEXT DEFAULT NULL;

-- Also add to social_feed_posts so instructions can be shared
ALTER TABLE social_feed_posts
ADD COLUMN meal_prep_instructions TEXT DEFAULT NULL;
