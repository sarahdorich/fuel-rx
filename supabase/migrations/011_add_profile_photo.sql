-- Add profile photo URL column to user_profiles
ALTER TABLE user_profiles
ADD COLUMN profile_photo_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.profile_photo_url IS 'URL to user profile photo stored in profile-photos bucket';
