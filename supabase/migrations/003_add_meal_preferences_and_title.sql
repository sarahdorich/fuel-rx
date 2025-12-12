-- -- Add title column to meal_plans
-- ALTER TABLE meal_plans
-- ADD COLUMN title TEXT;

COMMENT ON COLUMN meal_plans.title IS 'User-editable title for the meal plan';

-- Create meal_preferences table to track user likes/dislikes
CREATE TABLE meal_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    meal_name TEXT NOT NULL,
    preference TEXT NOT NULL CHECK (preference IN ('liked', 'disliked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, meal_name)
);

-- Create indexes for performance
CREATE INDEX idx_meal_preferences_user_id ON meal_preferences(user_id);
CREATE INDEX idx_meal_preferences_preference ON meal_preferences(user_id, preference);

-- Enable Row Level Security
ALTER TABLE meal_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meal_preferences
CREATE POLICY "Users can view own meal preferences"
    ON meal_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal preferences"
    ON meal_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal preferences"
    ON meal_preferences FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal preferences"
    ON meal_preferences FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.meal_preferences TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_preferences TO authenticated;
