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
        
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          role: string
        }
        Update: Partial<Database["public"]["Tables"]["company_memberships"]["Insert"]>
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
          deposit_amount: string | null
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
          deposit_amount?: number | string | null
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
          category: string
          amount: string
          expense_date: string
          supplier: string | null
          description: string | null
          receipt_path: string | null
          recorded_by: string | null
        
          created_at: Timestamp
          updated_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          branch_id?: string | null
          vehicle_id?: string | null
          category: string
          amount: number | string
          expense_date?: string
          supplier?: string | null
          description?: string | null
          receipt_path?: string | null
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
          description: string | null
          status: string
          scheduled_on: string | null
          completed_on: string | null
          odometer_km: number | null
          cost: string | null
          supplier: string | null
          next_service_on: string | null
          next_service_odometer_km: number | null
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
          description?: string | null
          status?: string
          scheduled_on?: string | null
          completed_on?: string | null
          odometer_km?: number | null
          cost?: number | string | null
          supplier?: string | null
          next_service_on?: string | null
          next_service_odometer_km?: number | null
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
          type: string
          title: string
          description: string | null
          metadata: Record<string, unknown> | null
          created_at: Timestamp
        }
        Insert: {
          id?: string
          company_id: string
          actor_id?: string | null
          type: string
          title: string
          description?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: Timestamp
        }
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Insert"]>
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
    }
    Enums: Record<string, never>
  }
}
