-- Add social feed feature to FuelRx
-- This enables users to share meals, follow other users, and discover community content

-- Add social_feed_enabled preference to user_profiles
ALTER TABLE user_profiles
ADD COLUMN social_feed_enabled BOOLEAN DEFAULT FALSE;

-- Add display_name for social features (optional public name)
ALTER TABLE user_profiles
ADD COLUMN display_name TEXT DEFAULT NULL;

COMMENT ON COLUMN user_profiles.social_feed_enabled IS 'If true, user participates in the social feed';
COMMENT ON COLUMN user_profiles.display_name IS 'Optional public display name for social feed';

-- Create social_feed_posts table
-- This is a denormalized feed table for efficient querying
CREATE TABLE social_feed_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('custom_meal', 'favorited_meal')),
    -- For custom meals: references validated_meals_by_user
    source_meal_id UUID REFERENCES validated_meals_by_user(id) ON DELETE CASCADE,
    -- For favorited meals: references meal_plans and stores meal data
    source_meal_plan_id UUID REFERENCES meal_plans(id) ON DELETE CASCADE,
    -- Denormalized meal data for feed display
    meal_name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein INTEGER NOT NULL,
    carbs INTEGER NOT NULL,
    fat INTEGER NOT NULL,
    image_url TEXT,
    prep_time TEXT,
    ingredients JSONB,
    instructions JSONB,
    meal_type TEXT,
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraints to prevent duplicate posts
CREATE UNIQUE INDEX idx_social_feed_posts_custom_meal
    ON social_feed_posts(user_id, source_type, source_meal_id)
    WHERE source_type = 'custom_meal' AND source_meal_id IS NOT NULL;

CREATE UNIQUE INDEX idx_social_feed_posts_favorited_meal
    ON social_feed_posts(user_id, source_type, source_meal_plan_id, meal_name)
    WHERE source_type = 'favorited_meal' AND source_meal_plan_id IS NOT NULL;

CREATE INDEX idx_social_feed_posts_created_at ON social_feed_posts(created_at DESC);
CREATE INDEX idx_social_feed_posts_user_id ON social_feed_posts(user_id);

-- Create user_follows table for friends/follow system
CREATE TABLE user_follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE INDEX idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX idx_user_follows_following ON user_follows(following_id);

-- Create saved_community_meals table
-- When users "add" a meal from the feed to their collection
CREATE TABLE saved_community_meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    source_post_id UUID NOT NULL REFERENCES social_feed_posts(id) ON DELETE CASCADE,
    original_author_id UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, source_post_id)
);

CREATE INDEX idx_saved_community_meals_user ON saved_community_meals(user_id);

-- Enable RLS
ALTER TABLE social_feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_community_meals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for social_feed_posts
-- Users can view posts from users who have social_feed_enabled
CREATE POLICY "Users can view feed posts from social-enabled users"
    ON social_feed_posts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = social_feed_posts.user_id
            AND user_profiles.social_feed_enabled = true
        )
    );

CREATE POLICY "Users can insert own feed posts"
    ON social_feed_posts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feed posts"
    ON social_feed_posts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own feed posts"
    ON social_feed_posts FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for user_follows
CREATE POLICY "Users can view all follows"
    ON user_follows FOR SELECT
    USING (true);

CREATE POLICY "Users can create their own follows"
    ON user_follows FOR INSERT
    WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own follows"
    ON user_follows FOR DELETE
    USING (auth.uid() = follower_id);

-- RLS Policies for saved_community_meals
CREATE POLICY "Users can view own saved meals"
    ON saved_community_meals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can save meals"
    ON saved_community_meals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove saved meals"
    ON saved_community_meals FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.social_feed_posts TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_feed_posts TO authenticated;

GRANT ALL ON public.user_follows TO postgres, service_role;
GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;

GRANT ALL ON public.saved_community_meals TO postgres, service_role;
GRANT SELECT, INSERT, DELETE ON public.saved_community_meals TO authenticated;
