-- Add image_url and share_with_community columns to validated_meals_by_user
-- This allows users to upload photos of their custom meals and optionally share them with the community

-- Add image_url column to store the Supabase Storage URL for the meal image
ALTER TABLE validated_meals_by_user
ADD COLUMN image_url TEXT DEFAULT NULL;

-- Add share_with_community column to allow users to opt-in to sharing their meals
-- When true, this meal's data may be used by AI to generate meal plans for other users
ALTER TABLE validated_meals_by_user
ADD COLUMN share_with_community BOOLEAN DEFAULT FALSE;

-- Add comment explaining the columns
COMMENT ON COLUMN validated_meals_by_user.image_url IS 'URL to the meal image stored in Supabase Storage';
COMMENT ON COLUMN validated_meals_by_user.share_with_community IS 'If true, this meal may be used by AI to generate meal plans for other users';
