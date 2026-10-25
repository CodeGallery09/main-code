-- Rename the Lead and Campaign concepts to Audience and Strategy, end to end.
-- Every statement here is a metadata-only RENAME: no data is touched, dropped or recreated,
-- and the change is fully reversible by renaming back in the same order in reverse.
--
-- Verified on a throwaway Neon branch before this was applied to production: the resulting
-- schema's 23 tables / 210 columns diff empty against lib/db/schema.ts in both directions, and
-- the seeded sample rows survive the rename untouched.

-- 1. Tables
ALTER TABLE leads RENAME TO audiences;
ALTER TABLE campaigns RENAME TO strategies;
ALTER TABLE segment_leads RENAME TO segment_audiences;
ALTER TABLE campaign_accounts RENAME TO strategy_accounts;

-- 2. Enum types
ALTER TYPE lead_stage RENAME TO audience_stage;
ALTER TYPE lead_source RENAME TO audience_source;
ALTER TYPE campaign_status RENAME TO strategy_status;
ALTER TYPE campaign_type RENAME TO strategy_type;

-- 3. Columns
ALTER TABLE audiences RENAME COLUMN campaign_id TO strategy_id;
ALTER TABLE strategies RENAME COLUMN leads TO audiences; -- the per-strategy audience count
ALTER TABLE workflows RENAME COLUMN campaign_id TO strategy_id;
ALTER TABLE threads RENAME COLUMN lead_id TO audience_id;
ALTER TABLE threads RENAME COLUMN campaign_id TO strategy_id;
ALTER TABLE events RENAME COLUMN lead_id TO audience_id;
ALTER TABLE events RENAME COLUMN campaign_id TO strategy_id;
ALTER TABLE tasks RENAME COLUMN lead_id TO audience_id;
ALTER TABLE segment_audiences RENAME COLUMN lead_id TO audience_id;
ALTER TABLE workflow_runs RENAME COLUMN lead_id TO audience_id;
ALTER TABLE strategy_accounts RENAME COLUMN campaign_id TO strategy_id;

-- 4. Indexes
ALTER INDEX leads_workspace_idx RENAME TO audiences_workspace_idx;
ALTER INDEX leads_workspace_stage_idx RENAME TO audiences_workspace_stage_idx;
ALTER INDEX leads_workspace_score_idx RENAME TO audiences_workspace_score_idx;
ALTER INDEX leads_campaign_idx RENAME TO audiences_strategy_idx;
ALTER INDEX campaigns_workspace_idx RENAME TO strategies_workspace_idx;
ALTER INDEX campaigns_workspace_status_idx RENAME TO strategies_workspace_status_idx;
ALTER INDEX campaign_accounts_account_idx RENAME TO strategy_accounts_account_idx;
ALTER INDEX segment_leads_lead_idx RENAME TO segment_audiences_audience_idx;
ALTER INDEX threads_lead_idx RENAME TO threads_audience_idx;
ALTER INDEX tasks_lead_idx RENAME TO tasks_audience_idx;
ALTER INDEX workflow_runs_once_per_lead RENAME TO workflow_runs_once_per_audience;
ALTER INDEX workflows_campaign_key RENAME TO workflows_strategy_key;

-- 5. Constraints (foreign keys and composite primary keys)
ALTER TABLE events RENAME CONSTRAINT events_lead_id_leads_id_fk TO events_audience_id_audiences_id_fk;
ALTER TABLE events RENAME CONSTRAINT events_campaign_id_campaigns_id_fk TO events_strategy_id_strategies_id_fk;
ALTER TABLE audiences RENAME CONSTRAINT leads_campaign_id_campaigns_id_fk TO audiences_strategy_id_strategies_id_fk;
ALTER TABLE audiences RENAME CONSTRAINT leads_owner_id_users_id_fk TO audiences_owner_id_users_id_fk;
ALTER TABLE audiences RENAME CONSTRAINT leads_workspace_id_workspaces_id_fk TO audiences_workspace_id_workspaces_id_fk;
ALTER TABLE segment_audiences RENAME CONSTRAINT segment_leads_lead_id_leads_id_fk TO segment_audiences_audience_id_audiences_id_fk;
ALTER TABLE segment_audiences RENAME CONSTRAINT segment_leads_segment_id_lead_id_pk TO segment_audiences_segment_id_audience_id_pk;
ALTER TABLE segment_audiences RENAME CONSTRAINT segment_leads_segment_id_segments_id_fk TO segment_audiences_segment_id_segments_id_fk;
ALTER TABLE segment_audiences RENAME CONSTRAINT segment_leads_workspace_id_workspaces_id_fk TO segment_audiences_workspace_id_workspaces_id_fk;
ALTER TABLE tasks RENAME CONSTRAINT tasks_lead_id_leads_id_fk TO tasks_audience_id_audiences_id_fk;
ALTER TABLE threads RENAME CONSTRAINT threads_lead_id_leads_id_fk TO threads_audience_id_audiences_id_fk;
ALTER TABLE threads RENAME CONSTRAINT threads_campaign_id_campaigns_id_fk TO threads_strategy_id_strategies_id_fk;
ALTER TABLE workflow_runs RENAME CONSTRAINT workflow_runs_lead_id_leads_id_fk TO workflow_runs_audience_id_audiences_id_fk;
ALTER TABLE strategy_accounts RENAME CONSTRAINT campaign_accounts_account_id_channel_accounts_id_fk TO strategy_accounts_account_id_channel_accounts_id_fk;
ALTER TABLE strategy_accounts RENAME CONSTRAINT campaign_accounts_campaign_id_account_id_pk TO strategy_accounts_strategy_id_account_id_pk;
ALTER TABLE strategy_accounts RENAME CONSTRAINT campaign_accounts_campaign_id_campaigns_id_fk TO strategy_accounts_strategy_id_strategies_id_fk;
ALTER TABLE strategy_accounts RENAME CONSTRAINT campaign_accounts_workspace_id_workspaces_id_fk TO strategy_accounts_workspace_id_workspaces_id_fk;
ALTER TABLE strategies RENAME CONSTRAINT campaigns_workspace_id_workspaces_id_fk TO strategies_workspace_id_workspaces_id_fk;
ALTER TABLE workflows RENAME CONSTRAINT workflows_campaign_id_campaigns_id_fk TO workflows_strategy_id_strategies_id_fk;
