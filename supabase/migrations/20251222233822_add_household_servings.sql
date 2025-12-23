-- Add household servings preferences to user_profiles
-- This allows users to specify how many additional people they're feeding
-- per day of the week and meal type (breakfast, lunch, dinner, snacks)

-- Structure: {
--   "monday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": {...}, "dinner": {...}, "snacks": {...} },
--   "tuesday": { ... },
--   ...
-- }

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS household_servings JSONB DEFAULT '{
  "monday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": { "adults": 0, "children": 0 }, "dinner": { "adults": 0, "children": 0 }, "snacks": { "adults": 0, "children": 0 } },
  "tuesday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": { "adults": 0, "children": 0 }, "dinner": { "adults": 0, "children": 0 }, "snacks": { "adults": 0, "children": 0 } },
  "wednesday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": { "adults": 0, "children": 0 }, "dinner": { "adults": 0, "children": 0 }, "snacks": { "adults": 0, "children": 0 } },
  "thursday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": { "adults": 0, "children": 0 }, "dinner": { "adults": 0, "children": 0 }, "snacks": { "adults": 0, "children": 0 } },
  "friday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": { "adults": 0, "children": 0 }, "dinner": { "adults": 0, "children": 0 }, "snacks": { "adults": 0, "children": 0 } },
  "saturday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": { "adults": 0, "children": 0 }, "dinner": { "adults": 0, "children": 0 }, "snacks": { "adults": 0, "children": 0 } },
  "sunday": { "breakfast": { "adults": 0, "children": 0 }, "lunch": { "adults": 0, "children": 0 }, "dinner": { "adults": 0, "children": 0 }, "snacks": { "adults": 0, "children": 0 } }
}'::jsonb;

-- Add a comment explaining the field
COMMENT ON COLUMN user_profiles.household_servings IS 'Additional people to feed per day/meal. Adults count as 1x portion, children as 0.6x. The main user (athlete) is always counted as 1 adult automatically.';
