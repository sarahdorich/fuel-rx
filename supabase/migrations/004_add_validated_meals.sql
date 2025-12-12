-- Create validated_meals_by_user table to store user-corrected calorie/macro information
-- When a user edits the calories or macros of a meal, we save it here so Claude can use
-- accurate nutrition data for that meal in future meal plans

CREATE TABLE validated_meals_by_user (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    meal_name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein INTEGER NOT NULL,
    carbs INTEGER NOT NULL,
    fat INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, meal_name)
);

-- Create indexes for performance
CREATE INDEX idx_validated_meals_user_id ON validated_meals_by_user(user_id);
CREATE INDEX idx_validated_meals_meal_name ON validated_meals_by_user(user_id, meal_name);

-- Enable Row Level Security
ALTER TABLE validated_meals_by_user ENABLE ROW LEVEL SECURITY;

-- RLS Policies for validated_meals_by_user
CREATE POLICY "Users can view own validated meals"
    ON validated_meals_by_user FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own validated meals"
    ON validated_meals_by_user FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own validated meals"
    ON validated_meals_by_user FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own validated meals"
    ON validated_meals_by_user FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.validated_meals_by_user TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validated_meals_by_user TO authenticated;

-- Create trigger for updated_at
CREATE TRIGGER update_validated_meals_updated_at
    BEFORE UPDATE ON validated_meals_by_user
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
