-- Costco Products table for inventory scraping
CREATE TABLE costco_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    costco_id TEXT, -- Costco's internal product ID if available
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT NOT NULL, -- 'meat_seafood', 'deli', 'prepared_meals', etc.
    price DECIMAL(10, 2),
    unit_price TEXT, -- e.g. "$12.99/lb"
    package_size TEXT, -- e.g. "2 lbs", "12 pack"
    image_url TEXT,
    product_url TEXT UNIQUE, -- To prevent duplicates
    description TEXT,
    in_stock BOOLEAN DEFAULT TRUE,
    warehouse_location TEXT DEFAULT 'Sandy, UT', -- Your specific warehouse

    -- Nutritional data (when available)
    calories INT,
    protein INT,
    carbs INT,
    fat INT,
    serving_size TEXT,

    -- Metadata
    last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_costco_products_category ON costco_products(category);
CREATE INDEX idx_costco_products_name ON costco_products(name);
CREATE INDEX idx_costco_products_in_stock ON costco_products(in_stock) WHERE in_stock = TRUE;
CREATE INDEX idx_costco_products_warehouse ON costco_products(warehouse_location);
CREATE INDEX idx_costco_products_url ON costco_products(product_url);

-- Enable Row Level Security (optional - if you want users to see these)
ALTER TABLE costco_products ENABLE ROW LEVEL SECURITY;

-- Public read access for all authenticated users
CREATE POLICY "Authenticated users can view costco products"
    ON costco_products FOR SELECT
    USING (auth.role() = 'authenticated');

-- Only service role can insert/update/delete (for your scraper)
-- CREATE POLICY "Service role can manage costco products"
--     ON costco_products FOR ALL
--     USING (auth.role() = 'service_role');

ALTER TABLE costco_products DISABLE ROW LEVEL SECURITY;

-- Add sodium tracking (common nutritional info)
ALTER TABLE costco_products ADD COLUMN IF NOT EXISTS sodium INT;

-- Add fiber tracking
ALTER TABLE costco_products ADD COLUMN IF NOT EXISTS fiber INT;

-- Add sugar tracking
ALTER TABLE costco_products ADD COLUMN IF NOT EXISTS sugar INT;

-- Add ingredients list
ALTER TABLE costco_products ADD COLUMN IF NOT EXISTS ingredients TEXT;

-- Add allergens
ALTER TABLE costco_products ADD COLUMN IF NOT EXISTS allergens TEXT;

-- Add raw product details (for any info not captured in structured fields)
ALTER TABLE costco_products ADD COLUMN IF NOT EXISTS raw_product_details TEXT;

-- Add raw specifications (for any info not captured in structured fields)
ALTER TABLE costco_products ADD COLUMN IF NOT EXISTS raw_specifications TEXT;

-- Update the updated_at trigger if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if not exists (drop first to be safe)
DROP TRIGGER IF EXISTS update_costco_products_updated_at ON costco_products;
CREATE TRIGGER update_costco_products_updated_at
    BEFORE UPDATE ON costco_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


