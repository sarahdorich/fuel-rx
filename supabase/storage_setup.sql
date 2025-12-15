-- Supabase Storage Setup for Meal Images
-- Run this in the Supabase SQL Editor to create the storage bucket and policies

-- Note: You may need to create the bucket manually in the Supabase Dashboard first:
-- 1. Go to Storage in your Supabase Dashboard
-- 2. Click "New bucket"
-- 3. Name: meal-images
-- 4. Check "Public bucket" (so images can be displayed without auth)
-- 5. Click "Create bucket"

-- Then run the following policies:

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload meal images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update own meal images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'meal-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete own meal images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'meal-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all meal images (for displaying in UI)
CREATE POLICY "Public read access for meal images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'meal-images');
