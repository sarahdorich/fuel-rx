-- Migration: Two-Stage Meal Generation & Prep Mode
-- This migration adds support for:
-- 1. Core ingredient selection (Stage 1)
-- 2. Ingredient-constrained meal generation (Stage 2)
-- 3. Meal prep session analysis (Stage 3)
-- 4. User preferences for ingredient variety

-- ============================================
-- 1. Add ingredient variety preferences to user_profiles
-- ============================================

-- Add JSONB column for ingredient variety preferences
-- Structure: { proteins: 2, vegetables: 5, fruits: 2, grains: 2, fats: 3, pantry: 3 }
ALTER TABLE user_profiles
ADD COLUMN ingredient_variety_prefs JSONB DEFAULT '{
  "proteins": 3,
  "vegetables": 5,
  "fruits": 3,
  "grains": 2,
  "fats": 2,
  "pantry": 3
}'::jsonb;

-- ============================================
-- 2. Update meal_plans table for two-stage generation
-- ============================================

-- Add column to store core ingredients from Stage 1
ALTER TABLE meal_plans
ADD COLUMN core_ingredients JSONB DEFAULT NULL;

-- ============================================
-- 3. Create meal_plan_ingredients table
-- ============================================

-- Stores the core ingredients selected for each meal plan
CREATE TABLE meal_plan_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('proteins', 'vegetables', 'fruits', 'grains', 'fats', 'pantry')),
  ingredient_name TEXT NOT NULL,
  quantity TEXT, -- e.g., '2 lbs', '1 bag', '6 pieces'
  notes TEXT, -- Optional notes about the ingredient
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_meal_plan_ingredients_plan_id ON meal_plan_ingredients(meal_plan_id);
CREATE INDEX idx_meal_plan_ingredients_category ON meal_plan_ingredients(category);

-- Enable RLS
ALTER TABLE meal_plan_ingredients ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access ingredients for their own meal plans
CREATE POLICY "Users can view own meal plan ingredients"
    ON meal_plan_ingredients FOR SELECT
    USING (
        meal_plan_id IN (
            SELECT id FROM meal_plans WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own meal plan ingredients"
    ON meal_plan_ingredients FOR INSERT
    WITH CHECK (
        meal_plan_id IN (
            SELECT id FROM meal_plans WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own meal plan ingredients"
    ON meal_plan_ingredients FOR DELETE
    USING (
        meal_plan_id IN (
            SELECT id FROM meal_plans WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- 4. Create prep_sessions table
-- ============================================

-- Stores batch cooking strategies for meal plans
CREATE TABLE prep_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL, -- e.g., 'Sunday Prep Session', 'Wednesday Quick Prep'
  session_order INTEGER NOT NULL, -- 1, 2, 3 for ordering
  estimated_minutes INTEGER, -- Total time estimate
  prep_items JSONB NOT NULL, -- Array of items to prep
  feeds_meals JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of meal references this prep feeds
  instructions TEXT, -- Overall session instructions
  daily_assembly JSONB DEFAULT NULL, -- Day-by-day assembly instructions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_prep_sessions_plan_id ON prep_sessions(meal_plan_id);
CREATE INDEX idx_prep_sessions_order ON prep_sessions(meal_plan_id, session_order);

-- Enable RLS
ALTER TABLE prep_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access prep sessions for their own meal plans
CREATE POLICY "Users can view own prep sessions"
    ON prep_sessions FOR SELECT
    USING (
        meal_plan_id IN (
            SELECT id FROM meal_plans WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own prep sessions"
    ON prep_sessions FOR INSERT
    WITH CHECK (
        meal_plan_id IN (
            SELECT id FROM meal_plans WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own prep sessions"
    ON prep_sessions FOR UPDATE
    USING (
        meal_plan_id IN (
            SELECT id FROM meal_plans WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own prep sessions"
    ON prep_sessions FOR DELETE
    USING (
        meal_plan_id IN (
            SELECT id FROM meal_plans WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- 5. Grant permissions
-- ============================================

GRANT ALL ON meal_plan_ingredients TO postgres, service_role;
GRANT SELECT, INSERT, DELETE ON meal_plan_ingredients TO authenticated;

GRANT ALL ON prep_sessions TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON prep_sessions TO authenticated;
