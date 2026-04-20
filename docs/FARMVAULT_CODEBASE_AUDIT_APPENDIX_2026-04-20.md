# FarmVault Codebase Audit — Appendix (2026-04-20)

## A. Full 153-table list (all names)

```text
admin.company_migration_items
admin.company_migrations
admin.developer_delete_audit
admin.developers
admin.reset_users
admin.subscription_override_audit
admin.subscription_overrides
core.billing_prices
core.companies
core.company_members
core.compliance_document_catalog
core.device_app_locks
core.profiles
developer.code_red_incidents
developer.code_red_notes
developer.company_records_outbox
developer.farmvault_expenses
developer.system_backups
finance.budget_pools
finance.expense_links
finance.expenses
finance.project_wallet_ledger
finance.project_wallets
harvest.fallback_harvest_sessions
harvest.fallback_harvest_units
harvest.fallback_market_dispatches
harvest.fallback_market_expense_lines
harvest.fallback_market_expense_templates
harvest.fallback_market_sales_entries
harvest.fallback_market_sales_entry_edit_audits
harvest.fallback_session_picker_logs
harvest.fallback_session_pickers
harvest.harvest_collection_sequence_counters
harvest.harvest_collections
harvest.harvest_pickers
harvest.harvests
harvest.picker_intake_entries
harvest.picker_payment_entries
harvest.tomato_custom_markets
harvest.tomato_harvest_picker_logs
harvest.tomato_harvest_pickers
harvest.tomato_harvest_sessions
harvest.tomato_market_dispatches
harvest.tomato_market_expense_lines
harvest.tomato_market_expense_templates
harvest.tomato_market_sales_entries
harvest.tomato_market_sales_entry_edit_audits
projects.farms
projects.project_stages
projects.projects
projects.stage_notes
public.IF
public.activity_logs
public.admin_alerts
public.alert_recipients
public.ambassador_earnings
public.ambassador_revenue_commissions
public.ambassador_transactions
public.ambassador_withdrawals
public.ambassadors
public.audit_logs
public.budget_pools
public.challenge_templates
public.code_red
public.code_red_messages
public.collection_cash_usage
public.commissions
public.companies
public.company_expenses
public.company_members
public.company_record_attachments
public.company_record_crops
public.company_record_shares
public.company_records
public.company_revenue
public.company_subscriptions
public.crop_catalog
public.crop_knowledge_challenges
public.crop_knowledge_chemicals
public.crop_knowledge_practices
public.crop_knowledge_profiles
public.crop_knowledge_timing_windows
public.crops
public.custom_roles
public.data_integrity_findings
public.deliveries
public.developer_actions_log
public.developer_backup_snapshots
public.developer_backups
public.developer_crop_record_templates
public.email_logs
public.emergency_access_attempts
public.employee_activity_logs
public.employee_project_access
public.employees
public.expenses
public.farm_notebook_admin_notes
public.farm_notebook_entries
public.farmer_smart_inbox
public.farmer_smart_messaging_state
public.feedback
public.harvest_cash_pools
public.harvest_collection_totals
public.harvest_collections
public.harvest_entry_events
public.harvest_payment_batches
public.harvest_picker_entries
public.harvest_picker_totals
public.harvest_pickers
public.harvest_wallets
public.harvests
public.inventory_audit_logs
public.inventory_categories
public.inventory_items
public.inventory_purchases
public.inventory_usage
public.launch_monitor_logs
public.mpesa_orphan_attempts
public.mpesa_payments
public.mpesa_stk_callbacks
public.needed_items
public.notifications
public.operations_work_cards
public.payment_reconciliation_log
public.payment_webhook_failures
public.picker_payments
public.picker_weigh_entries
public.platform_expenses
public.profiles
public.project_blocks
public.project_stages
public.project_wallet_ledger
public.project_wallet_meta
public.projects
public.push_subscriptions
public.rate_limits
public.receipts
public.record_attachments
public.record_audit_log
public.record_crop_catalog
public.records
public.records_library
public.referral_sessions
public.referrals
public.sales
public.season_challenges
public.skips
public.stage_notes
public.subscription_payments
public.subscriptions
public.suppliers
public.system_health_logs
public.work_logs
```

## B. Full 319-function list (all names)

```text
admin.bootstrap_developer
admin.current_clerk_user_id
admin.dev_dashboard_kpis
admin.execute_company_migration
admin.get_company_with_admin
admin.get_migrateable_tables
admin.get_migration_details
admin.get_migration_history
admin.is_developer
admin.list_companies
admin.list_companies_for_migration
admin.list_pending_payments
admin.list_platform_users
admin.preview_company_migration
admin.set_company_migrations_updated_at
core.companies_set_created_by
core.create_company_and_admin
core.create_company_with_admin
core.current_clerk_id
core.current_company_id
core.current_member_role
core.current_user_id
core.ensure_current_membership
core.is_company_admin
core.is_company_member
core.is_signed_in
core.set_billing_reference
core.trg_company_members_sync_user_id
developer.approve_billing_confirmation
developer.assert_developer
developer.attach_record_file
developer.column_exists
developer.create_code_red_incident
developer.create_farmvault_expense
developer.create_record_for_company
developer.delete_company_safely
developer.delete_farmvault_expense
developer.delete_user_safely
developer.get_backup_overview
developer.get_companies_table
developer.get_company_members_table
developer.get_company_overview
developer.get_company_subscriptions_table
developer.get_crop_monitoring_intelligence
developer.get_crop_records
developer.get_dashboard_overview
developer.get_finances_overview
developer.get_profiles_table
developer.get_recent_platform_activity
developer.get_record_detail
developer.get_records_overview
developer.get_season_challenges_intelligence
developer.get_subscription_analytics
developer.list_audit_logs
developer.list_backups
developer.list_billing_confirmations
developer.list_code_red_incidents
developer.list_companies
developer.list_duplicate_profile_emails
developer.list_farmvault_expenses
developer.list_feedback_inbox
developer.list_users
developer.mark_billing_confirmation_reviewed
developer.reject_billing_confirmation
developer.safe_count
developer.safe_jsonb
developer.safe_numeric
developer.set_updated_at
developer.table_exists
developer.update_code_red_incident
developer.update_farmvault_expense
finance.add_expense
finance.project_wallet_ledger_set_created
harvest._employee_role_is_sales_broker
harvest.allocate_next_harvest_collection_sequence
harvest.close_collection
harvest.company_tomato_harvest_aggregate
harvest.company_tomato_monthly_revenue
harvest.create_collection
harvest.dispatch_broker_matches_me
harvest.fallback_dispatch_broker_matches_me
harvest.fallback_touch_updated_at
harvest.list_collection_sequence_duplicates
harvest.preview_next_collection_sequence
harvest.preview_next_harvest_collection_sequence
harvest.record_intake
harvest.record_payment
harvest.refresh_fallback_market_dispatch_totals
harvest.refresh_fallback_session_totals
harvest.refresh_tomato_market_dispatch_totals
harvest.sync_fallback_picker_labour_expense
harvest.sync_tomato_picker_labour_expense
harvest.tomato_harvest_sessions_summaries_for_project
harvest.tomato_harvest_sessions_touch_updated_at
harvest.tomato_market_child_set_company
harvest.tomato_market_dispatches_broker_field_lock
harvest.tomato_market_dispatches_touch_updated_at
harvest.tomato_market_revenue_by_market
harvest.tomato_market_sales_entries_next_number
harvest.tr_after_sales_or_expense_touch_dispatch
harvest.tr_expense_links_refresh_fallback_totals
harvest.tr_fallback_dispatch_children_refresh
harvest.tr_fallback_dispatch_refresh_session
harvest.tr_fallback_picker_logs_sync_labour_expense
harvest.tr_fallback_session_children_refresh
harvest.tr_fallback_sessions_sync_labour_expense
harvest.tr_tomato_picker_logs_sync_labour_expense
harvest.tr_tomato_sessions_sync_labour_expense
harvest.user_is_sales_broker_in_company
projects.create_project
public._activate_company_subscription_internal
public._apply_excess_for_subscription_payment_internal
public._column_exists
public._subscription_payment_finalize_approval
public._table_exists
public.activate_company_subscription
public.activate_subscription_from_mpesa_stk
public.add_crop_knowledge_challenge
public.add_crop_knowledge_chemical
public.add_crop_knowledge_practice
public.add_crop_knowledge_timing_window
public.add_crop_record_attachment
public.alloc_billing_receipt_number
public.ambassador_payout_notify_enqueue
public.ambassador_payout_status_timeline_label
public.ambassador_referred_by_referral
public.ambassador_request_withdrawal
public.analytics_crop_profit
public.analytics_crop_yield
public.analytics_expense_breakdown
public.analytics_monthly_revenue
public.analytics_report_detail_rows
public.apply_ambassador_referral_company_signup_bonus
public.apply_excess_for_subscription_payment
public.apply_farmer_referral_attribution
public.apply_farmer_referral_subscription_commission
public.approve_subscription_payment
public.award_subscription_commission
public.billing_plan_price_kes
public.billing_receipt_load_context
public.billing_receipt_profile_email_for_uid
public.billing_receipt_profile_full_name_for_uid
public.billing_receipt_tenant_can_access
public.billing_receipt_tenant_can_issue_for_payment
public.bootstrap_developer
public.check_payment_status
public.check_rate_limit
public.choose_post_trial_plan
public.cleanup_orphaned_access
public.cleanup_rate_limits
public.company_billing_contact_email
public.company_exists
public.complete_ambassador_onboarding
public.complete_company_onboarding
public.complete_my_ambassador_onboarding
public.consume_reset_user_for_signup
public.create_company_crop_record
public.create_company_record_crop
public.create_company_with_admin
public.create_harvest_picker_entry
public.create_project
public.current_clerk_id
public.current_company_id
public.current_company_id_text
public.current_context
public.current_member_role
public.dashboard_switcher_capabilities
public.delete_company_safely
public.delete_user_safely
public.deny_update_delete
public.dev_create_crop_record_template
public.dev_dashboard_kpis
public.dev_launch_monitoring_metrics
public.dev_list_all_notebook_crops
public.dev_list_ambassador_payouts
public.dev_list_companies_table
public.dev_list_crop_records
public.dev_mark_ambassador_earnings_paid
public.dev_review_ambassador_withdrawal
public.dev_send_crop_record_to_company
public.dev_send_existing_record_to_companies
public.developer_bootstrap_company
public.developer_company_billing_excess
public.developer_fetch_company_season_challenges
public.developer_get_company_farm_intelligence
public.developer_get_project_by_id
public.developer_get_season_challenges_for_company
public.developer_list_company_audit_logs
public.developer_list_company_season_challenges
public.developer_season_challenges_for_company_json
public.disable_quick_unlock
public.employee_has_project_access
public.employees_protect_company_and_role
public.enable_quick_unlock
public.enforce_employee_company_match
public.ensure_current_membership
public.ensure_harvest_collection_totals
public.execute_company_migration
public.expected_subscription_amount_kes
public.extend_company_trial
public.fetch_ambassador_dashboard_stats
public.fetch_ambassador_earnings_transactions
public.fetch_ambassador_referral_rows
public.fetch_my_ambassador_dashboard_stats
public.fetch_my_ambassador_earnings_transactions
public.fetch_my_ambassador_referral_rows
public.fetch_my_ambassador_withdrawals
public.fv_bump_row_version
public.fv_crop_name
public.fv_current_company_id_text
public.fv_developer_company_season_challenges
public.fv_has_clerk_session
public.fv_is_developer
public.fv_normalize_company_key
public.fv_notebook_list_crops
public.fv_notebook_list_crops_ctx
public.fv_record_audit_row
public.fv_run_data_integrity_checks
public.fv_slugify
public.fv_sync_public_projects_soft_fields
public.generate_referral_code
public.get_ambassador_id_by_referral_code
public.get_company_override
public.get_company_workspace_notify_lookup
public.get_crop_intelligence
public.get_crop_record_detail
public.get_crop_record_insights
public.get_developer_company_farm_intelligence
public.get_developer_company_farm_intelligence_text
public.get_developer_company_season_challenges
public.get_developer_settings
public.get_device_app_lock
public.get_employee_by_clerk_and_company
public.get_migration_details
public.get_migration_history
public.get_my_company_workspace_status
public.get_rate_limit_for_action
public.get_reset_user_state
public.get_subscription_analytics
public.get_subscription_gate_state
public.get_user_plan
public.initialize_company_subscription
public.is_company_admin
public.is_company_admin_of
public.is_company_member
public.is_developer
public.is_manager
public.launch_monitoring_collect_metrics
public.link_developer_to_company
public.list_companies
public.list_companies_for_migration
public.list_companies_v2
public.list_company_payments
public.list_company_record_crops
public.list_crop_records
public.list_duplicate_emails
public.list_mpesa_stk_callbacks_without_payment
public.list_operations_work_cards_for_export
public.list_payments
public.list_payments_v2
public.list_pending_payments
public.list_platform_users
public.list_users
public.log_employee_activity
public.mark_my_farmer_referral_onboarding_complete
public.normalize_company_email
public.normalize_email
public.normalize_employee_email
public.normalize_phone_digits_for_billing
public.normalize_profile_email
public.normalize_subscription_mpesa_tx_code
public.notify_push_on_notification_insert
public.override_subscription
public.preview_company_migration
public.process_ambassador_monthly_commissions
public.promote_ambassador_commission_releases
public.record_company_expense
public.record_company_revenue
public.record_referral_session
public.refresh_ambassador_balance_cache
public.register_ambassador_for_clerk
public.reject_subscription_payment
public.remove_developer_company_link
public.rename_company_safely
public.resolve_or_ensure_platform_profile
public.restore_record
public.row_company_matches_user
public.rpc_admin_send_farm_notebook_note
public.rpc_farmvault_notebook_list_crops
public.rpc_list_farm_notebook_admin_notes
public.set_ambassador_referral_code
public.set_company_paid_access
public.set_company_subscription_state
public.set_developer_role
public.set_my_ambassador_profile_role
public.set_payment_billing_reference
public.set_row_updated_at
public.set_updated_at
public.start_trial
public.submission_notify_recipient_allowed
public.submit_manual_subscription_payment
public.subscription_payment_success_sync_company
public.sync_my_farmer_referral_link
public.sync_season_challenges_company_id_from_project_text
public.sync_season_challenges_company_id_from_project_uuid
public.system_health_evaluate
public.tg_ambassador_payout_to_company_expense
public.trg_after_harvest_entry_insert
public.trg_after_picker_payment_insert
public.trg_ambassador_earnings_referral_commissioned
public.trg_ambassador_earnings_sync_commission_tx_paid
public.trg_init_collection_totals
public.trg_pub_company_members_sync_user_id
public.try_resolve_company_from_fv_account_ref
public.update_crop_record
public.update_farm_notebook_updated_at
public.upsert_crop_knowledge_profile
public.validate_email_uniqueness
public.verify_quick_unlock_pin

```

## C. Routes: redirect-only vs real-page (194 routes, exactly as parsed from self-closing `<Route ... />` entries in `src/App.tsx`)

Format per line: `path<TAB>classification<TAB>element`

```text
/	real-page	<RootRoute />
/r/:code	real-page	<ReferralShortLinkPage />
/login	redirect-only	<Navigate to="/sign-in" replace />
/signin	redirect-only	<Navigate to="/sign-in" replace />
/signup	real-page	<SignupQueryPreservingRedirect />
/sign-in	redirect-only	import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <SignInPage /> : <Navigate to="/emergency-access" replace />
/sign-in/*	redirect-only	import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <SignInPage /> : <Navigate to="/emergency-access" replace />
/sign-up	real-page	<SignUpPage />
/sign-up/*	real-page	<SignUpPage />
/accept-invitation	real-page	<AcceptInvitationPage />
/accept-invitation/*	real-page	<AcceptInvitationPage />
/dev/sign-in	real-page	<DevSignInPage />
/dev/sign-in/*	real-page	<DevSignInPage />
/dev/sign-up	real-page	<DevSignUpPage />
/dev/sign-up/*	real-page	<DevSignUpPage />
/dev/sign-up/tasks/*	redirect-only	<Navigate to="/developer" replace />
/dev/bootstrap	real-page	<DevRoute> <DevBootstrapPage /> </DevRoute>
/auth/callback	real-page	<AuthCallbackPage />
/auth/continue	real-page	<PostAuthContinuePage />
/auth/ambassador-continue	real-page	<AmbassadorAuthContinuePage />
/emergency-access	real-page	<EmergencyAccessPage />
/choose-plan	redirect-only	<Navigate to="/onboarding/company" replace />
/onboarding/company	real-page	<RequireAuth><OnboardingPage /></RequireAuth>
/onboarding	redirect-only	<Navigate to="/onboarding/company" replace />
/pending-approval	real-page	<RequireAuth><PendingApprovalPage /></RequireAuth>
/awaiting-approval	redirect-only	<Navigate to="/pending-approval" replace />
/start-fresh	real-page	<RequireAuth><StartFreshPage /></RequireAuth>
/setup-company	redirect-only	<Navigate to="/onboarding/company" replace />
/setup	redirect-only	<Navigate to="/onboarding/company" replace />
/app/app-entry	redirect-only (dynamic)	<RequireAuth><AppEntryPage /></RequireAuth>
/features	real-page	<FeaturesPage />
/pricing	real-page	<PricingPage />
/about	real-page	<AboutPage />
/faq	real-page	<FaqPage />
/what-is-farmvault	real-page	<WhatIsFarmVaultPage />
/agriculture-software-kenya	real-page	<AgricultureSoftwareKenyaPage />
/learn/farm-management	real-page	<FarmManagementLearnMasterPage />
/learn/:slug	real-page	<LearnTopicPage />
/learn	real-page	<LearnHubPage />
/terms	real-page	<TermsPage />
/privacy	real-page	<PrivacyPage />
/refund	real-page	<RefundPage />
/ambassador	real-page	<AmbassadorLandingPage />
/ambassador/signup	real-page	<AmbassadorSignupPage />
/ambassador/terms	real-page	<AmbassadorTermsPage />
/ambassador/privacy	real-page	<PrivacyPage />
/ambassador/onboarding	real-page	<AmbassadorOnboardingPage />
/ambassador/learn	real-page	<AmbassadorLearnPage />
/ambassador/refer	redirect-only	<Navigate to="/ambassador/console/refer" replace />
/ambassador/dashboard	redirect-only	<Navigate to="/ambassador/console/dashboard" replace />
dashboard	real-page	<RequireAmbassador><AmbassadorDashboardPage /></RequireAmbassador>
referrals	real-page	<RequireAmbassador><AmbassadorReferralsPage /></RequireAmbassador>
earnings	real-page	<RequireAmbassador><AmbassadorEarningsPage /></RequireAmbassador>
refer	real-page	<RequireAmbassador><AmbassadorReferPage /></RequireAmbassador>
qr	redirect-only	<Navigate to="refer" replace />
learn	real-page	<RequireAmbassador><AmbassadorLearnConsolePage /></RequireAmbassador>
settings	real-page	<RequireAmbassador><AmbassadorSettingsPage /></RequireAmbassador>
/scan	real-page	<ScanPage />
/farm-management-software-kenya	real-page	<FarmManagementSoftwareKenyaPage />
/crop-monitoring-software	real-page	<CropMonitoringSoftwarePage />
/farm-inventory-management-system	real-page	<FarmInventoryManagementPage />
/farm-expense-tracking-software	real-page	<FarmExpenseTrackingPage />
/farm-harvest-management-system	real-page	<FarmHarvestManagementPage />
/farm-project-management-software	real-page	<FarmProjectManagementPage />
/farm-budgeting-software	real-page	<FarmBudgetingSoftwarePage />
/crop-guides	real-page	<CropGuidesHubPage />
/farm-budget-guides	real-page	<FarmBudgetGuidesHubPage />
/farm-chemicals-guide	real-page	<FarmChemicalsGuideHubPage />
/crop-disease-database	real-page	<CropDiseaseDatabaseHubPage />
/farm-calculators	real-page	<FarmCalculatorsHubPage />
/tomato-farming-kenya	real-page	<TomatoFarmingKenyaPage />
/maize-farming-kenya	real-page	<MaizeFarmingKenyaPage />
/rice-farming-kenya	real-page	<RiceFarmingKenyaPage />
/french-beans-farming-kenya	real-page	<FrenchBeansFarmingKenyaPage />
/capsicum-farming-kenya	real-page	<CapsicumFarmingKenyaPage />
/watermelon-farming-kenya	real-page	<WatermelonFarmingKenyaPage />
/farm-management-software-nairobi	real-page	<FarmManagementNairobiPage />
/farm-management-software-eldoret	real-page	<FarmManagementEldoretPage />
/farm-management-software-nakuru	real-page	<FarmManagementNakuruPage />
/farm-management-software-kisumu	real-page	<FarmManagementKisumuPage />
/farm-management-software-mombasa	real-page	<FarmManagementMombasaPage />
/tomato-profit-calculator	real-page	<TomatoProfitCalculatorPage />
/maize-profit-calculator	real-page	<MaizeProfitCalculatorPage />
/farm-budget-calculator	real-page	<FarmBudgetCalculatorPage />
/yield-per-acre-calculator	real-page	<YieldPerAcreCalculatorPage />
/blog	real-page	<BlogIndexPage />
/blog/:slug	real-page	<BlogPostPage />
/app	redirect-only (dynamic)	<RequireNotBroker><CompanyDashboardRoute /></RequireNotBroker>
/app/*	redirect-only (dynamic)	<RequireNotBroker><CompanyDashboardRoute /></RequireNotBroker>
/dashboard	redirect-only (dynamic)	<PermissionRoute module="dashboard"> <RequireNotBroker> <CompanyDashboardRoute /> </RequireNotBroker> </PermissionRoute>
/projects	real-page	<PermissionRoute module="projects"><RequireNotBroker><ProjectsPage /></RequireNotBroker></PermissionRoute>
/farms/:farmId	real-page	<PermissionRoute module="projects"><RequireNotBroker><FarmDetailsPage /></RequireNotBroker></PermissionRoute>
/projects/new	redirect-only	<PermissionRoute module="projects" actionPath="create"><RequireNotBroker><Navigate to="/projects?new=1" replace /></RequireNotBroker></PermissionRoute>
/projects/:projectId/edit	real-page	<PermissionRoute module="projects"><RequireNotBroker><EditProjectPage /></RequireNotBroker></PermissionRoute>
/projects/:projectId	real-page	<PermissionRoute module="projects"><RequireNotBroker><ProjectDetailsPage /></RequireNotBroker></PermissionRoute>
/projects/:projectId/planning	real-page	<PermissionRoute module="planning"><RequireNotBroker><ProjectPlanningPage /></RequireNotBroker></PermissionRoute>
/crop-stages	real-page	<PermissionRoute module="planning"><CropStagesPage /></PermissionRoute>
/expenses	real-page	<PermissionRoute module="expenses"><ExpensesPage /></PermissionRoute>
/operations	real-page	<PermissionRoute module="operations"><AdminOperationsPage /></PermissionRoute>
/operations/legacy	real-page	<PermissionRoute module="operations"><OperationsPage /></PermissionRoute>
/inventory	real-page	<PermissionRoute module="inventory"><InventoryPage /></PermissionRoute>
/inventory/item/:itemId	real-page	<PermissionRoute module="inventory"><InventoryItemDetailsPage /></PermissionRoute>
/inventory/categories	real-page	<PermissionRoute module="inventory"><InventoryCategoriesPage /></PermissionRoute>
/inventory/suppliers	real-page	<PermissionRoute module="inventory"><InventorySuppliersPage /></PermissionRoute>
/harvest	redirect-only (dynamic)	<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker"><HarvestEntryRoute /></RequireNotBroker></PermissionRoute>
/harvest-sessions/:projectId/session/:sessionId	real-page	<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker"><FallbackHarvestSessionDetailPage /></RequireNotBroker></PermissionRoute>
/harvest-sessions/:projectId?	real-page	<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker"><FallbackHarvestListPage /></RequireNotBroker></PermissionRoute>
/harvest-sales	real-page	<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker"><HarvestSalesPage /></RequireNotBroker></PermissionRoute>
/harvest-sales/harvest/:harvestId	real-page	<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker"><HarvestDetailsPage /></RequireNotBroker></PermissionRoute>
/harvest-collections/:projectId?	real-page	<PermissionRoute module="harvest"><RequireNotBroker><HarvestCollectionsPage /></RequireNotBroker></PermissionRoute>
/tomato-harvest/:projectId/session/:sessionId	real-page	<PermissionRoute module="harvest"><RequireNotBroker><TomatoHarvestSessionDetailPage /></RequireNotBroker></PermissionRoute>
/tomato-harvest/:projectId?	real-page	<PermissionRoute module="harvest"><RequireNotBroker><TomatoHarvestListPage /></RequireNotBroker></PermissionRoute>
/broker	real-page	<RequireBroker><BrokerTomatoDashboardPage /></RequireBroker>
/broker/harvest-fallback/:dispatchId	real-page	<RequireBroker><BrokerFallbackDispatchPage /></RequireBroker>
/broker/harvest/:dispatchId	real-page	<RequireBroker><BrokerTomatoDispatchPage /></RequireBroker>
/broker/harvest-sales	redirect-only	<Navigate to="/broker" replace />
/broker/expenses	real-page	<RequireBroker><BrokerTomatoMarketExpensesPage /></RequireBroker>
/suppliers	real-page	<PermissionRoute module="projects"><SuppliersPage /></PermissionRoute>
/challenges	real-page	<PermissionRoute module="planning"><SeasonChallengesPage /></PermissionRoute>
/employees	real-page	<PermissionRoute module="employees"><EmployeesPage /></PermissionRoute>
/employees/:employeeId	real-page	<PermissionRoute module="employees"><EmployeeProfilePage /></PermissionRoute>
/reports	real-page	<PermissionRoute module="reports"><ReportsPage /></PermissionRoute>
/billing	real-page	<PermissionRoute module="settings"> <RequireBillingAccess> <BillingPage /> </RequireBillingAccess> </PermissionRoute>
/profile	redirect-only	<Navigate to="/settings" replace />
/settings	real-page	<PermissionRoute module="settings"><SettingsPage /></PermissionRoute>
/support	real-page	<SupportPage />
/feedback	real-page	<FeedbackPage />
/records	real-page	<PermissionRoute module="notes"><AdminRecordsPage /></PermissionRoute>
/records/:cropSlug	real-page	<PermissionRoute module="notes"><CropDetailsPage /></PermissionRoute>
/records/:cropSlug/new	real-page	<PermissionRoute module="notes"><NotebookPage /></PermissionRoute>
/records/:cropSlug/:noteId	real-page	<PermissionRoute module="notes"><NotebookPage /></PermissionRoute>
staff-dashboard	real-page	<StaffDashboard />
profile	redirect-only	<Navigate to="/settings" replace />
support	real-page	<SupportPage />
feedback	real-page	<FeedbackPage />
harvest	redirect-only (dynamic)	<PermissionRoute module="harvest"><StaffHarvestEntryRoute /></PermissionRoute>
harvest-sessions/:projectId/session/:sessionId	real-page	<PermissionRoute module="harvest"> <FallbackHarvestSessionDetailPage /> </PermissionRoute>
harvest-sessions/:projectId?	real-page	<PermissionRoute module="harvest"> <FallbackHarvestListPage /> </PermissionRoute>
tomato-harvest/:projectId/session/:sessionId	real-page	<PermissionRoute module="harvest"> <TomatoHarvestSessionDetailPage /> </PermissionRoute>
tomato-harvest/:projectId?	real-page	<PermissionRoute module="harvest"> <TomatoHarvestListPage /> </PermissionRoute>
harvest-collections/:projectId?	real-page	<PermissionRoute module="harvest"> <HarvestCollectionsPage /> </PermissionRoute>
inventory	real-page	<PermissionRoute module="inventory"> <InventoryPage /> </PermissionRoute>
inventory/item/:itemId	real-page	<PermissionRoute module="inventory"> <InventoryItemDetailsPage /> </PermissionRoute>
expenses	real-page	<PermissionRoute module="expenses"> <ExpensesPage /> </PermissionRoute>
operations	real-page	<PermissionRoute module="operations"> <StaffOperationsPage /> </PermissionRoute>
farms/:farmId	real-page	<PermissionRoute module="projects"> <FarmDetailsPage /> </PermissionRoute>
reports	real-page	<PermissionRoute module="reports"> <ReportsPage /> </PermissionRoute>
/manager	redirect-only	<Navigate to="/staff/staff-dashboard" replace />
/manager/*	redirect-only	<Navigate to="/staff/staff-dashboard" replace />
/driver	redirect-only	<Navigate to="/staff/staff-dashboard" replace />
/dev	redirect-only	<Navigate to="/developer" replace />
/dev/dashboard	redirect-only	<Navigate to="/developer" replace />
/dev/diagnostics	real-page	<DevDiagnosticsPage />
/dev/referrals/:id	real-page	<DevReferralDetailPage />
/dev/referrals	real-page	<DevReferralsPage />
/dev/qr-generator	redirect-only	<Navigate to="/developer/qr" replace />
/admin	redirect-only	<Navigate to="/developer" replace />
/admin/companies	real-page	<AdminCompaniesPage />
/admin/users	real-page	<AdminUsersPage />
/admin/users/pending	real-page	<AdminPendingUsersPage />
/admin/audit-logs	real-page	<AdminAuditLogsPage />
/admin/backups	real-page	<AdminBackupsPage />
/admin/migration	real-page	<AdminMigrationPage />
/admin/code-red	real-page	<AdminCodeRedPage />
/admin/feedback	real-page	<AdminFeedbackPage />
/admin/finances	real-page	<AdminFinancesPage />
/admin/analytics/subscriptions	real-page	<AdminSubscriptionAnalyticsPage />
/admin/expenses	real-page	<AdminExpensesPage />
/admin/billing	real-page	<AdminBillingPage />
/admin/payments	real-page	<AdminPendingPaymentsPage />
companies	real-page	<DeveloperCompaniesPage />
companies/:companyId	real-page	<DeveloperCompanyDetailsPage />
users	real-page	<DeveloperUsersPage />
settings	real-page	<DeveloperSettingsPage />
billing-confirmation	real-page	<DeveloperBillingConfirmationPage />
finances	real-page	<DeveloperFinancesPage />
subscription-analytics	real-page	<DeveloperSubscriptionAnalyticsPage />
farmvault-expenses	real-page	<DeveloperExpensesPage />
backups	real-page	<DeveloperBackupsPage />
code-red	real-page	<DeveloperCodeRedPage />
feedback-inbox	real-page	<DeveloperFeedbackInboxPage />
audit-logs	real-page	<DeveloperAuditLogsPage />
email-center	real-page	<DeveloperEmailCenterPage />
email-logs	redirect-only	<Navigate to="/developer/email-center" replace />
records	real-page	<DeveloperRecordsPage />
records/:cropSlug	real-page	<CropDetailsPage />
records/:cropSlug/full-knowledge	real-page	<FullKnowledgePage />
records/:cropSlug/new	real-page	<NotebookPage />
records/:cropSlug/:noteId	real-page	<NotebookPage />
company-migrations	real-page	<DeveloperCompanyMigrationsPage />
qr	real-page	<DevQRGeneratorPage />
documents	real-page	<DeveloperDocumentsPage />
integrations	real-page	<DeveloperIntegrationsPage />
*	real-page	<NotFound />
```

