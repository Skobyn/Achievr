-- Script to clear all data while preserving tables and structure

-- Disable all triggers temporarily
SET session_replication_role = 'replica';

-- Truncate all application tables (preserves the structure but removes all data)
TRUNCATE TABLE financial_profiles CASCADE;
TRUNCATE TABLE goals CASCADE;
TRUNCATE TABLE households CASCADE;
TRUNCATE TABLE household_members CASCADE;
TRUNCATE TABLE incomes CASCADE;
TRUNCATE TABLE bills CASCADE;
TRUNCATE TABLE expenses CASCADE;
TRUNCATE TABLE budgets CASCADE;
TRUNCATE TABLE categories CASCADE;
TRUNCATE TABLE forecasting_data CASCADE;

-- Only delete user data from profiles, don't truncate to maintain auth references
DELETE FROM profiles;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Clear auth.users (only accessible in Supabase SQL Editor)
-- WARNING: This removes all user accounts
DELETE FROM auth.users;

-- Optional: Reset sequences if needed
ALTER SEQUENCE forecast_metrics_id_seq RESTART WITH 1;
ALTER SEQUENCE forecasting_data_id_seq RESTART WITH 1;

-- Re-insert default forecast metrics and categories
INSERT INTO forecast_metrics (metric_name, description)
VALUES
  ('Cash Flow', 'Monthly net cash flow forecast'),
  ('Savings', 'Projected savings over time'),
  ('Expense Trend', 'Forecast of expense trends')
ON CONFLICT DO NOTHING;

-- Insert default categories
INSERT INTO categories (name, type, user_id)
VALUES
  ('Salary', 'income', NULL),
  ('Investments', 'income', NULL),
  ('Side Hustle', 'income', NULL),
  ('Rent/Mortgage', 'expense', NULL),
  ('Utilities', 'expense', NULL),
  ('Groceries', 'expense', NULL),
  ('Entertainment', 'expense', NULL),
  ('Transportation', 'expense', NULL),
  ('Healthcare', 'expense', NULL),
  ('Dining Out', 'expense', NULL),
  ('Shopping', 'expense', NULL),
  ('Subscriptions', 'expense', NULL)
ON CONFLICT DO NOTHING; 