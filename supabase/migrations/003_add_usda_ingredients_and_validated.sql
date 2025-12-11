-- Add usda_ingredients table for caching USDA FoodData Central API results
CREATE TABLE usda_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingredient_name TEXT UNIQUE NOT NULL,
    fdc_id INTEGER NOT NULL,
    calories_per_100g DECIMAL NOT NULL,
    protein_per_100g DECIMAL NOT NULL,
    carbs_per_100g DECIMAL NOT NULL,
    fat_per_100g DECIMAL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by ingredient name
CREATE INDEX idx_usda_ingredients_name ON usda_ingredients(ingredient_name);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_usda_ingredients_updated_at
    BEFORE UPDATE ON usda_ingredients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add validated field to meal_plans table
ALTER TABLE meal_plans
ADD COLUMN validated BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON TABLE usda_ingredients IS 'Cache for USDA FoodData Central API nutritional data. Prevents repeated API calls for common ingredients.';
COMMENT ON COLUMN meal_plans.validated IS 'Indicates whether the meal plan has been validated against USDA nutritional data';

-- Enable Row Level Security for usda_ingredients
ALTER TABLE usda_ingredients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for usda_ingredients
-- Allow all authenticated users to read cached ingredients
CREATE POLICY "Anyone can read usda_ingredients"
    ON usda_ingredients FOR SELECT
    TO authenticated
    USING (true);

-- Allow all authenticated users to insert new ingredients (cache population)
CREATE POLICY "Authenticated users can insert usda_ingredients"
    ON usda_ingredients FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow all authenticated users to update ingredients (cache refresh)
CREATE POLICY "Authenticated users can update usda_ingredients"
    ON usda_ingredients FOR UPDATE
    TO authenticated
    USING (true);

-- Enable Row Level Security for usda_ingredients
ALTER TABLE usda_ingredients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for usda_ingredients
CREATE POLICY "Anyone can read usda_ingredients"
    ON usda_ingredients FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert usda_ingredients"
    ON usda_ingredients FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update usda_ingredients"
    ON usda_ingredients FOR UPDATE
    TO authenticated
    USING (true);

