-- Migration: Add Prep Style Preferences
-- This migration adds support for:
-- 1. User prep style preferences (traditional_batch, night_before, day_of, mixed)
-- 2. Meal complexity preferences per meal type
-- 3. Extended prep_sessions columns for the new prep view design

-- ============================================
-- 1. Add prep style preferences to user_profiles
-- ============================================

-- Add prep style column
ALTER TABLE user_profiles
ADD COLUMN prep_style VARCHAR(50) DEFAULT 'mixed';

-- Add meal complexity preferences
ALTER TABLE user_profiles
ADD COLUMN breakfast_complexity VARCHAR(50) DEFAULT 'minimal_prep',
ADD COLUMN lunch_complexity VARCHAR(50) DEFAULT 'minimal_prep',
ADD COLUMN dinner_complexity VARCHAR(50) DEFAULT 'full_recipe';

-- Add comments for clarity
COMMENT ON COLUMN user_profiles.prep_style IS 'User preference for when to prep meals: traditional_batch, night_before, day_of, or mixed';
COMMENT ON COLUMN user_profiles.breakfast_complexity IS 'Preferred complexity for breakfast: quick_assembly, minimal_prep, or full_recipe';
COMMENT ON COLUMN user_profiles.lunch_complexity IS 'Preferred complexity for lunch: quick_assembly, minimal_prep, or full_recipe';
COMMENT ON COLUMN user_profiles.dinner_complexity IS 'Preferred complexity for dinner: quick_assembly, minimal_prep, or full_recipe';

-- ============================================
-- 2. Add new columns to prep_sessions table
-- ============================================

-- Add session_type column to categorize prep sessions
ALTER TABLE prep_sessions
ADD COLUMN session_type VARCHAR(50) DEFAULT 'weekly_batch';

-- Add session_day for day-specific prep sessions
ALTER TABLE prep_sessions
ADD COLUMN session_day VARCHAR(20) DEFAULT NULL;

-- Add session_time_of_day for more granular scheduling
ALTER TABLE prep_sessions
ADD COLUMN session_time_of_day VARCHAR(20) DEFAULT NULL;

-- Add prep_for_date to track which date the prep is for
ALTER TABLE prep_sessions
ADD COLUMN prep_for_date DATE DEFAULT NULL;

-- Add prep_tasks JSONB for the new task structure
ALTER TABLE prep_sessions
ADD COLUMN prep_tasks JSONB DEFAULT '{"tasks": []}'::jsonb;

-- Add display_order for UI ordering (rename from session_order for clarity)
ALTER TABLE prep_sessions
ADD COLUMN display_order INTEGER DEFAULT 1;

-- Add updated_at timestamp
ALTER TABLE prep_sessions
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add comments for the new columns
COMMENT ON COLUMN prep_sessions.session_type IS 'Type of prep session: weekly_batch, night_before, day_of_morning, day_of_dinner';
COMMENT ON COLUMN prep_sessions.session_day IS 'Day of week for session: monday, tuesday, etc. Null for weekly_batch';
COMMENT ON COLUMN prep_sessions.session_time_of_day IS 'Time of day: morning, afternoon, night. Null for weekly_batch';
COMMENT ON COLUMN prep_sessions.prep_for_date IS 'The date these prep tasks are for. Null for weekly_batch';
COMMENT ON COLUMN prep_sessions.prep_tasks IS 'Array of prep task objects with id, description, estimated_minutes, meal_ids, completed';
COMMENT ON COLUMN prep_sessions.display_order IS 'Order to display sessions in the UI';

-- Create index on the new display_order column
CREATE INDEX idx_prep_sessions_display_order ON prep_sessions(meal_plan_id, display_order);
