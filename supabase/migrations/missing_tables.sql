-- Create financial_profiles table
CREATE TABLE IF NOT EXISTS financial_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    monthly_income NUMERIC(12,2) DEFAULT 0,
    monthly_expenses NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_profiles_user_id ON financial_profiles(user_id);

ALTER TABLE financial_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD their own financial profiles"
    ON financial_profiles
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Create goals table
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    target_amount NUMERIC(12,2) NOT NULL,
    current_amount NUMERIC(12,2) DEFAULT 0,
    target_date DATE,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD their own goals"
    ON goals
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Create households table (with initial simple policies)
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_households_created_by ON households(created_by);

-- Create household_members table
CREATE TABLE IF NOT EXISTS household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(household_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_profile ON household_members(profile_id);

-- Now set up RLS policies in the correct order
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view households they are a member of"
    ON households
    USING (
        created_by = auth.uid() OR
        id IN (
            SELECT household_id FROM household_members 
            WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY "Only creator can update or delete household"
    ON households
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Only creator can create household"
    ON households
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household owners can manage members"
    ON household_members
    USING (
        household_id IN (
            SELECT id FROM households WHERE created_by = auth.uid()
        )
    )
    WITH CHECK (
        household_id IN (
            SELECT id FROM households WHERE created_by = auth.uid()
        )
    );

CREATE POLICY "Users can view their household memberships"
    ON household_members
    FOR SELECT
    USING (profile_id = auth.uid()); 