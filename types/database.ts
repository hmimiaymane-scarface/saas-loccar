/**
 * Hand-written to match `supabase/migrations/*.sql`.
 *
 * This mirrors the shape `supabase gen types typescript` would produce.
 * Once a real project is linked, prefer regenerating with the Supabase CLI
 * (see docs/supabase.md) and replacing this file — CHECK-constrained
 * columns are typed as `string` here because that's what the generator
 * emits too (Postgres CHECK constraints aren't reflected in generated
 * types). The narrower unions your app code wants (e.g. `VehicleStatus`)
 * live in `types/rental.ts`, not here.
 */

type Timestamp = string

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_path: string | null
          phone: string | null
          preferred_language: string
        
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_path?: string | null
          phone?: string | null
          preferred_language?: string
        }
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
        Relationships: []
      }
      companies: {
        Row: {
          id: string
          name: string
          slug: string
          logo_path: string | null
          phone: string | null
          email: string | null
          address: string | null
          city: string | null
          country: string
          currency: string
          timezone: string
          tax_id: string | null
          business_register: string | null
          default_language: string
          status: string
          maintenance_reminder_days: number
          document_expiry_warning_days: number
          agents_can_record_expenses: boolean
          muted_notification_types: string[]

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_path?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          city?: string | null
          country?: string
          currency?: string
          timezone?: string
          tax_id?: string | null
          business_register?: string | null
          default_language?: string
          status?: string
          maintenance_reminder_days?: number
          document_expiry_warning_days?: number
          agents_can_record_expenses?: boolean
          muted_notification_types?: string[]
        }
        Update: Partial<Database["public"]["Tables"]["companies"]["Insert"]>
        Relationships: []
      }
      company_memberships: {
        Row: {
          id: string
          company_id: string
          user_id: string
          role: string
          status: string
          branch_id: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          role: string
          status?: string
          branch_id?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["company_memberships"]["Insert"]>
        Relationships: []
      }
      invitations: {
        Row: {
          id: string
          company_id: string
          email: string
          role: string
          branch_id: string | null
          token: string
          status: string
          invited_by: string | null
          expires_at: Timestamp
          accepted_at: Timestamp | null
          accepted_by: string | null
          created_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          email: string
          role: string
          branch_id?: string | null
          token?: string
          status?: string
          invited_by?: string | null
          expires_at?: Timestamp
          accepted_at?: Timestamp | null
          accepted_by?: string | null
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          company_id: string
          user_id: string
          type: string
          key: string | null
          title: string
          description: string | null
          priority: string
          link_href: string | null
          read_at: Timestamp | null
          created_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          type: string
          key?: string | null
          title: string
          description?: string | null
          priority?: string
          link_href?: string | null
          read_at?: Timestamp | null
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>
        Relationships: []
      }
      ai_conversations: {
        Row: {
          id: string
          company_id: string
          user_id: string
          title: string | null
          provider: string
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          title?: string | null
          provider?: string
          created_at?: Timestamp
          updated_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["ai_conversations"]["Insert"]>
        Relationships: []
      }
      ai_messages: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string | null
          tool_calls: unknown | null
          tool_name: string | null
          tool_result: unknown | null
          created_at: Timestamp
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content?: string | null
          tool_calls?: unknown | null
          tool_name?: string | null
          tool_result?: unknown | null
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["ai_messages"]["Insert"]>
        Relationships: []
      }
      ai_proposed_actions: {
        Row: {
          id: string
          company_id: string
          conversation_id: string
          message_id: string | null
          action_type: string
          summary: string
          payload: unknown
          status: string
          created_at: Timestamp
          resolved_at: Timestamp | null
          resolved_by: string | null
          result_id: string | null
        }
        Insert: {
          id?: string
          company_id: string
          conversation_id: string
          message_id?: string | null
          action_type: string
          summary: string
          payload: unknown
          status?: string
          created_at?: Timestamp
          resolved_at?: Timestamp | null
          resolved_by?: string | null
          result_id?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["ai_proposed_actions"]["Insert"]>
        Relationships: []
      }
      branches: {
        Row: {
          id: string
          company_id: string
          name: string
          address: string | null
          city: string | null
          phone: string | null
          is_active: boolean
          is_main: boolean
        
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          address?: string | null
          city?: string | null
          phone?: string | null
          is_active?: boolean
          is_main?: boolean
        }
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>
        Relationships: []
      }
      vehicles: {
        Row: {
          id: string
          company_id: string
          branch_id: string | null
          registration_number: string
          make: string
          model: string
          year: number
          category: string
          fuel_type: string
          transmission: string
          color: string | null
          seats: number | null
          odometer_km: number
          daily_rate: string
          deposit_amount: string | null
          status: string
          acquired_on: string | null
          acquisition_cost: string | null
          insurance_expires_on: string | null
          registration_expires_on: string | null
          inspection_expires_on: string | null
          photo_path: string | null
        
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          branch_id?: string | null
          registration_number: string
          make: string
          model: string
          year: number
          category: string
          fuel_type?: string
          transmission?: string
          color?: string | null
          seats?: number | null
          odometer_km?: number
          daily_rate: number | string
          deposit_amount?: number | string | null
          status?: string
          acquired_on?: string | null
          acquisition_cost?: number | string | null
          insurance_expires_on?: string | null
          registration_expires_on?: string | null
          inspection_expires_on?: string | null
          photo_path?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          company_id: string
          full_name: string
          phone: string
          email: string | null
          nationality: string | null
          id_document_number: string | null
          license_number: string | null
          license_issued_on: string | null
          license_expires_on: string | null
          address: string | null
          notes: string | null
          status: string
        
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          full_name: string
          phone: string
          email?: string | null
          nationality?: string | null
          id_document_number?: string | null
          license_number?: string | null
          license_issued_on?: string | null
          license_expires_on?: string | null
          address?: string | null
          notes?: string | null
          status?: string
        }
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>
        Relationships: []
      }
      reservations: {
        Row: {
          id: string
          company_id: string
          branch_id: string | null
          customer_id: string
          vehicle_id: string | null
          requested_category: string | null
          reference: string
          pickup_at: Timestamp
          return_at: Timestamp
          pickup_location: string | null
          return_location: string | null
          status: string
          source: string
          daily_rate: string
          num_days: number
          discount_amount: string
          total_amount: string
          amount_paid: string
          remaining_balance: string
          notes: string | null
          created_by: string | null
        
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          branch_id?: string | null
          customer_id: string
          vehicle_id?: string | null
          requested_category?: string | null
          reference: string
          pickup_at: Timestamp
          return_at: Timestamp
          pickup_location?: string | null
          return_location?: string | null
          status?: string
          source?: string
          daily_rate: number | string
          num_days: number
          discount_amount?: number | string
          total_amount: number | string
          amount_paid?: number | string
          notes?: string | null
          created_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["reservations"]["Insert"]>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          company_id: string
          reservation_id: string | null
          customer_id: string
          amount: string
          method: string
          transaction_type: string
          direction: string
          paid_at: Timestamp
          reference: string | null
          notes: string | null
          recorded_by: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          reservation_id?: string | null
          customer_id: string
          amount: number | string
          method?: string
          transaction_type: string
          paid_at?: Timestamp
          reference?: string | null
          notes?: string | null
          recorded_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          company_id: string
          branch_id: string | null
          vehicle_id: string | null
          maintenance_record_id: string | null
          reservation_id: string | null
          category: string
          amount: string
          method: string | null
          expense_date: string
          supplier: string | null
          description: string | null
          receipt_path: string | null
          notes: string | null
          recorded_by: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          branch_id?: string | null
          vehicle_id?: string | null
          maintenance_record_id?: string | null
          reservation_id?: string | null
          category: string
          amount: number | string
          method?: string | null
          expense_date?: string
          supplier?: string | null
          description?: string | null
          receipt_path?: string | null
          notes?: string | null
          recorded_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>
        Relationships: []
      }
      maintenance_records: {
        Row: {
          id: string
          company_id: string
          vehicle_id: string
          type: string
          priority: string
          description: string | null
          status: string
          scheduled_on: string | null
          started_on: string | null
          completed_on: string | null
          odometer_km: number | null
          estimated_cost: string | null
          actual_cost: string | null
          supplier: string | null
          next_service_on: string | null
          next_service_odometer_km: number | null
          receipt_path: string | null
          notes: string | null
          created_by: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          vehicle_id: string
          type: string
          priority?: string
          description?: string | null
          status?: string
          scheduled_on?: string | null
          started_on?: string | null
          completed_on?: string | null
          odometer_km?: number | null
          estimated_cost?: number | string | null
          actual_cost?: number | string | null
          supplier?: string | null
          next_service_on?: string | null
          next_service_odometer_km?: number | null
          receipt_path?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["maintenance_records"]["Insert"]>
        Relationships: []
      }
      activity_log: {
        Row: {
          id: string
          company_id: string
          actor_id: string | null
          actor_type: string
          type: string
          entity_type: string | null
          entity_id: string | null
          title: string
          description: string | null
          metadata: Record<string, unknown> | null
          source: string
          created_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          actor_id?: string | null
          actor_type?: string
          type: string
          entity_type?: string | null
          entity_id?: string | null
          title: string
          description?: string | null
          metadata?: Record<string, unknown> | null
          source?: string
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Insert"]>
        Relationships: []
      }
      checklist_template_items: {
        Row: {
          id: string
          company_id: string
          key: string
          label: string
          category: string
          sort_order: number
          is_active: boolean

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          key: string
          label: string
          category: string
          sort_order?: number
          is_active?: boolean
        }
        Update: Partial<Database["public"]["Tables"]["checklist_template_items"]["Insert"]>
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          company_id: string
          reservation_id: string | null
          customer_id: string | null
          vehicle_id: string | null
          category: string
          storage_path: string
          original_filename: string
          mime_type: string
          file_size_bytes: number
          contract_reference: string | null
          notes: string | null
          status: string
          uploaded_by: string | null
          expires_on: string | null
          replaces_document_id: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          reservation_id?: string | null
          customer_id?: string | null
          vehicle_id?: string | null
          category: string
          storage_path: string
          original_filename: string
          mime_type: string
          file_size_bytes: number
          contract_reference?: string | null
          notes?: string | null
          status?: string
          uploaded_by?: string | null
          expires_on?: string | null
          replaces_document_id?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>
        Relationships: []
      }
      document_extractions: {
        Row: {
          id: string
          company_id: string
          document_id: string
          category: string
          status: string
          fields: Record<string, unknown> | null
          error_message: string | null
          model: string
          created_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          document_id: string
          category: string
          status: string
          fields?: Record<string, unknown> | null
          error_message?: string | null
          model: string
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["document_extractions"]["Insert"]>
        Relationships: []
      }
      vehicle_intelligence: {
        Row: {
          id: string
          company_id: string
          vehicle_id: string
          health_score: number
          health_band: string
          health_factors: unknown
          profitability_net_mad: number
          profitability_breakdown: unknown
          utilization: unknown
          recommendations: unknown | null
          recommendations_confidence: string | null
          computed_reason: string
          computed_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          vehicle_id: string
          health_score: number
          health_band: string
          health_factors: unknown
          profitability_net_mad: number
          profitability_breakdown: unknown
          utilization: unknown
          recommendations?: unknown | null
          recommendations_confidence?: string | null
          computed_reason: string
          computed_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["vehicle_intelligence"]["Insert"]>
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          id: string
          company_id: string
          actor_id: string | null
          role: string
          purpose: string
          provider: string
          model: string
          success: boolean
          error_code: string | null
          created_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          actor_id?: string | null
          role: string
          purpose: string
          provider: string
          model: string
          success: boolean
          error_code?: string | null
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["ai_usage_log"]["Insert"]>
        Relationships: []
      }
      inspections: {
        Row: {
          id: string
          company_id: string
          reservation_id: string
          vehicle_id: string
          customer_id: string
          type: string
          status: string
          performed_by: string | null
          odometer_km: number | null
          fuel_level: string | null
          cleanliness: string | null
          overall_condition: string | null
          notes: string | null
          customer_acknowledged: boolean
          customer_acknowledged_at: Timestamp | null
          completed_at: Timestamp | null
          correction_reason: string | null
          corrected_by: string | null
          corrected_at: Timestamp | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          reservation_id: string
          vehicle_id: string
          customer_id: string
          type: string
          status?: string
          performed_by?: string | null
          odometer_km?: number | null
          fuel_level?: string | null
          cleanliness?: string | null
          overall_condition?: string | null
          notes?: string | null
          customer_acknowledged?: boolean
          customer_acknowledged_at?: Timestamp | null
          completed_at?: Timestamp | null
        }
        Update: Partial<Database["public"]["Tables"]["inspections"]["Insert"]>
        Relationships: []
      }
      inspection_checklist_responses: {
        Row: {
          id: string
          company_id: string
          inspection_id: string
          item_key: string
          item_label: string
          category: string
          response: string
          notes: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          inspection_id: string
          item_key: string
          item_label: string
          category: string
          response?: string
          notes?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["inspection_checklist_responses"]["Insert"]>
        Relationships: []
      }
      damages: {
        Row: {
          id: string
          company_id: string
          vehicle_id: string
          reservation_id: string | null
          discovered_in_inspection_id: string | null
          status: string
          category: string
          vehicle_area: string
          severity: string
          description: string
          pre_existing: boolean
          estimated_cost: string | null
          actual_cost: string | null
          created_by: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          vehicle_id: string
          reservation_id?: string | null
          discovered_in_inspection_id?: string | null
          status?: string
          category?: string
          vehicle_area: string
          severity?: string
          description: string
          pre_existing?: boolean
          estimated_cost?: number | string | null
          actual_cost?: number | string | null
          created_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["damages"]["Insert"]>
        Relationships: []
      }
      media: {
        Row: {
          id: string
          company_id: string
          entity_type: string
          entity_id: string
          storage_path: string
          original_filename: string
          mime_type: string
          file_size_bytes: number
          caption: string | null
          uploaded_by: string | null
          created_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          entity_type: string
          entity_id: string
          storage_path: string
          original_filename: string
          mime_type: string
          file_size_bytes: number
          caption?: string | null
          uploaded_by?: string | null
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["media"]["Insert"]>
        Relationships: []
      }
      deposits: {
        Row: {
          id: string
          company_id: string
          reservation_id: string
          status: string
          expected_amount: string
          collected_amount: string
          returned_amount: string
          retained_amount: string
          method: string | null
          collected_at: Timestamp | null
          returned_at: Timestamp | null
          notes: string | null
          created_by: string | null

          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          reservation_id: string
          status?: string
          expected_amount?: number | string
          collected_amount?: number | string
          returned_amount?: number | string
          retained_amount?: number | string
          method?: string | null
          collected_at?: Timestamp | null
          returned_at?: Timestamp | null
          notes?: string | null
          created_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["deposits"]["Insert"]>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_company_with_owner: {
        Args: {
          p_name: string
          p_city?: string | null
          p_phone?: string | null
          p_currency?: string
          p_language?: string
        }
        Returns: string
      }
      is_company_member: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      company_role: {
        Args: { target_company_id: string }
        Returns: string
      }
      is_company_manager_or_owner: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      next_reservation_reference: {
        Args: { target_company_id: string }
        Returns: string
      }
      transition_reservation_status: {
        Args: { p_reservation_id: string; p_next_status: string }
        Returns: Database["public"]["Tables"]["reservations"]["Row"]
      }
      seed_default_checklist: {
        Args: { target_company_id: string }
        Returns: undefined
      }
      activate_rental: {
        Args: { p_reservation_id: string; p_override_reason?: string | null }
        Returns: Database["public"]["Tables"]["reservations"]["Row"]
      }
      complete_rental: {
        Args: {
          p_reservation_id: string
          p_vehicle_outcome: string
          p_override_reason?: string | null
        }
        Returns: Database["public"]["Tables"]["reservations"]["Row"]
      }
      complete_inspection: {
        Args: { p_inspection_id: string }
        Returns: Database["public"]["Tables"]["inspections"]["Row"]
      }
      correct_inspection: {
        Args: {
          p_inspection_id: string
          p_reason: string
          p_odometer_km?: number | null
          p_fuel_level?: string | null
          p_cleanliness?: string | null
          p_overall_condition?: string | null
          p_notes?: string | null
        }
        Returns: Database["public"]["Tables"]["inspections"]["Row"]
      }
      media_entity_company_id: {
        Args: { p_entity_type: string; p_entity_id: string }
        Returns: string
      }
      assert_no_active_rental: {
        Args: { p_vehicle_id: string; p_company_id: string }
        Returns: undefined
      }
      create_maintenance: {
        Args: {
          p_vehicle_id: string
          p_type: string
          p_priority: string
          p_status: string
          p_description?: string | null
          p_scheduled_on?: string | null
          p_odometer_km?: number | null
          p_estimated_cost?: number | null
          p_supplier?: string | null
          p_notes?: string | null
        }
        Returns: Database["public"]["Tables"]["maintenance_records"]["Row"]
      }
      start_maintenance: {
        Args: { p_maintenance_id: string }
        Returns: Database["public"]["Tables"]["maintenance_records"]["Row"]
      }
      complete_maintenance: {
        Args: {
          p_maintenance_id: string
          p_vehicle_outcome: string
          p_actual_cost?: number | null
          p_next_service_on?: string | null
          p_next_service_odometer_km?: number | null
          p_create_expense?: boolean
        }
        Returns: Database["public"]["Tables"]["maintenance_records"]["Row"]
      }
      cancel_maintenance: {
        Args: { p_maintenance_id: string; p_vehicle_outcome?: string | null }
        Returns: Database["public"]["Tables"]["maintenance_records"]["Row"]
      }
      invite_member: {
        Args: { p_company_id: string; p_email: string; p_role: string; p_branch_id?: string | null }
        Returns: Database["public"]["Tables"]["invitations"]["Row"]
      }
      accept_invitation: {
        Args: { p_token: string }
        Returns: Database["public"]["Tables"]["company_memberships"]["Row"]
      }
      update_member_role: {
        Args: { p_membership_id: string; p_role: string }
        Returns: Database["public"]["Tables"]["company_memberships"]["Row"]
      }
      suspend_member: {
        Args: { p_membership_id: string }
        Returns: Database["public"]["Tables"]["company_memberships"]["Row"]
      }
      reactivate_member: {
        Args: { p_membership_id: string }
        Returns: Database["public"]["Tables"]["company_memberships"]["Row"]
      }
      remove_member: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
      get_invitation_preview: {
        Args: { p_token: string }
        Returns: {
          invitation_id: string
          company_name: string
          role: string
          status: string
          expires_at: string
        }[]
      }
      get_member_emails: {
        Args: { p_user_ids: string[] }
        Returns: { user_id: string; email: string }[]
      }
      is_platform_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_company_suspended: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      platform_set_subscription_status: {
        Args: { p_company_id: string; p_status: string; p_reason?: string | null }
        Returns: undefined
      }
      platform_start_or_extend_trial: {
        Args: { p_company_id: string; p_trial_ends_on: string; p_trial_starts_on?: string | null }
        Returns: undefined
      }
      platform_update_subscription_dates: {
        Args: { p_company_id: string; p_subscription_starts_on: string | null; p_subscription_ends_on: string | null }
        Returns: undefined
      }
      platform_update_plan: {
        Args: { p_company_id: string; p_plan_label: string; p_monthly_price_mad: number | null; p_currency?: string }
        Returns: undefined
      }
      platform_update_notes: {
        Args: { p_company_id: string; p_notes: string | null }
        Returns: undefined
      }
      platform_get_overview: {
        Args: Record<string, never>
        Returns: {
          total_companies: number
          active_subscriptions: number
          active_trials: number
          trials_ending_soon: number
          suspended_companies: number
          companies_active_recently: number
          total_vehicles: number
          reservations_created_recently: number
          documents_uploaded_this_month: number
        }[]
      }
      platform_list_companies: {
        Args: {
          p_search?: string | null
          p_status?: string | null
          p_sort?: string
          p_page?: number
          p_page_size?: number
        }
        Returns: {
          company_id: string
          name: string
          city: string | null
          owner_email: string | null
          subscription_status: string | null
          plan_label: string | null
          trial_or_renewal_date: string | null
          vehicle_count: number
          reservation_count: number
          last_activity_at: string | null
          created_at: string
          total_count: number
        }[]
      }
      platform_get_company_summary: {
        Args: { p_company_id: string }
        Returns: {
          name: string
          city: string | null
          owner_email: string | null
          owner_full_name: string | null
          created_at: string
          user_count: number
          branch_count: number
          vehicle_count: number
          customer_count: number
          reservation_count: number
          active_rental_count: number
          document_count: number
          documents_this_month_count: number
          last_activity_at: string | null
          subscription_status: string | null
          plan_label: string | null
          trial_starts_on: string | null
          trial_ends_on: string | null
          subscription_starts_on: string | null
          subscription_ends_on: string | null
          monthly_price_mad: number | null
          currency: string | null
          notes: string | null
          notes_updated_at: string | null
          notes_updated_by_email: string | null
        }[]
      }
      platform_get_company_events: {
        Args: { p_company_id: string; p_limit?: number }
        Returns: {
          id: string
          admin_email: string | null
          action: string
          description: string | null
          created_at: string
        }[]
      }
    }
    Enums: Record<string, never>
  }
}
