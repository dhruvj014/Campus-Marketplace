-- Migration: Add description and item_snapshot columns to item_reports table
-- Run this script on your PostgreSQL database

-- Add description column (nullable text field for custom comments)
ALTER TABLE item_reports 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add item_snapshot column (JSON field to store item state at time of report)
ALTER TABLE item_reports 
ADD COLUMN IF NOT EXISTS item_snapshot JSONB;

-- Add comment for documentation
COMMENT ON COLUMN item_reports.description IS 'Custom comments for report type "other"';
COMMENT ON COLUMN item_reports.item_snapshot IS 'Snapshot of item state when report was created';

