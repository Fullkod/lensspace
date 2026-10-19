export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor_user_id: string | null
          entity_id: string | null
          entity_type: string
          event_type: string
          id: number
          occurred_at: string
          organization_id: number | null
          origin: string
          payload: Json
          reason: string | null
        }
        Insert: {
          actor_user_id?: string | null
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: never
          occurred_at?: string
          organization_id?: number | null
          origin?: string
          payload?: Json
          reason?: string | null
        }
        Update: {
          actor_user_id?: string | null
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: never
          occurred_at?: string
          organization_id?: number | null
          origin?: string
          payload?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string
          created_at: string
          id: number
          is_active: boolean
          is_primary: boolean
          name: string
          organization_id: number
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_primary?: boolean
          name: string
          organization_id: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_primary?: boolean
          name?: string
          organization_id?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cashbox_closure_payments: {
        Row: {
          allocated_amount: number
          allocated_at: string
          closure_id: number
          payment_id: number
        }
        Insert: {
          allocated_amount: number
          allocated_at?: string
          closure_id: number
          payment_id: number
        }
        Update: {
          allocated_amount?: number
          allocated_at?: string
          closure_id?: number
          payment_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cashbox_closure_payments_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "cashbox_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbox_closure_payments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      cashbox_closures: {
        Row: {
          branch_id: number
          business_date: string
          cashbox_id: number
          closed_at: string
          closed_by: string
          closure_type: string
          currency: string
          declared_amount: number
          difference_amount: number | null
          expected_amount: number
          id: number
          organization_id: number
          seller_id: string
          sequence_number: number
        }
        Insert: {
          branch_id: number
          business_date: string
          cashbox_id: number
          closed_at?: string
          closed_by: string
          closure_type: string
          currency: string
          declared_amount: number
          difference_amount?: number | null
          expected_amount: number
          id?: never
          organization_id: number
          seller_id: string
          sequence_number: number
        }
        Update: {
          branch_id?: number
          business_date?: string
          cashbox_id?: number
          closed_at?: string
          closed_by?: string
          closure_type?: string
          currency?: string
          declared_amount?: number
          difference_amount?: number | null
          expected_amount?: number
          id?: never
          organization_id?: number
          seller_id?: string
          sequence_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cashbox_closures_cashbox_id_organization_id_branch_id_sell_fkey"
            columns: [
              "cashbox_id",
              "organization_id",
              "branch_id",
              "seller_id",
              "business_date",
              "currency",
            ]
            isOneToOne: false
            referencedRelation: "seller_cashboxes"
            referencedColumns: [
              "id",
              "organization_id",
              "branch_id",
              "seller_id",
              "business_date",
              "currency",
            ]
          },
        ]
      }
      catalog_item_compatibilities: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          is_allowed: boolean
          left_item_id: number
          message: string
          organization_id: number | null
          right_item_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          is_allowed?: boolean
          left_item_id: number
          message: string
          organization_id?: number | null
          right_item_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          is_allowed?: boolean
          left_item_id?: number
          message?: string
          organization_id?: number | null
          right_item_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_item_compatibilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "catalog_item_compatibilities_left_item_id_fkey"
            columns: ["left_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_item_compatibilities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_item_compatibilities_right_item_id_fkey"
            columns: ["right_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_item_overrides: {
        Row: {
          catalog_item_id: number
          changed_at: string
          changed_by: string
          cost_amount: number
          currency: string
          is_enabled: boolean
          organization_id: number
          sale_price: number
        }
        Insert: {
          catalog_item_id: number
          changed_at?: string
          changed_by: string
          cost_amount: number
          currency: string
          is_enabled?: boolean
          organization_id: number
          sale_price: number
        }
        Update: {
          catalog_item_id?: number
          changed_at?: string
          changed_by?: string
          cost_amount?: number
          currency?: string
          is_enabled?: boolean
          organization_id?: number
          sale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_item_overrides_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_item_overrides_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "catalog_item_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          category: string
          code: string
          cost_amount: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: number
          is_active: boolean
          name: string
          organization_id: number | null
          sale_price: number
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          cost_amount?: number
          created_at?: string
          created_by?: string | null
          currency: string
          description?: string | null
          id?: never
          is_active?: boolean
          name: string
          organization_id?: number | null
          sale_price: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          cost_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: never
          is_active?: boolean
          name?: string
          organization_id?: number | null
          sale_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "catalog_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_phones: {
        Row: {
          branch_id: number
          created_at: string
          customer_id: number
          id: number
          is_primary: boolean
          label: string
          normalized_phone: string | null
          organization_id: number
          phone_number: string
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          branch_id: number
          created_at?: string
          customer_id: number
          id?: never
          is_primary?: boolean
          label?: string
          normalized_phone?: string | null
          organization_id: number
          phone_number: string
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          branch_id?: number
          created_at?: string
          customer_id?: number
          id?: never
          is_primary?: boolean
          label?: string
          normalized_phone?: string | null
          organization_id?: number
          phone_number?: string
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customer_phones_customer_fkey"
            columns: ["customer_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          archived_at: string | null
          birth_date: string | null
          branch_id: number
          client_request_id: string | null
          created_at: string
          created_by: string
          full_name: string
          id: number
          messaging_consent: boolean
          national_id: string | null
          notes: string | null
          organization_id: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          birth_date?: string | null
          branch_id: number
          client_request_id?: string | null
          created_at?: string
          created_by: string
          full_name: string
          id?: never
          messaging_consent?: boolean
          national_id?: string | null
          notes?: string | null
          organization_id: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          birth_date?: string | null
          branch_id?: number
          client_request_id?: string | null
          created_at?: string
          created_by?: string
          full_name?: string
          id?: never
          messaging_consent?: boolean
          national_id?: string | null
          notes?: string | null
          organization_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_rules: {
        Row: {
          applies_to_item_id: number | null
          code: string
          created_at: string
          created_by: string | null
          id: number
          is_active: boolean
          message: string
          minimum_absolute_cylinder: number | null
          minimum_absolute_sphere: number | null
          minimum_addition: number | null
          name: string
          organization_id: number | null
          recommended_item_id: number | null
          surcharge_amount: number
          surcharge_currency: string | null
          updated_at: string
        }
        Insert: {
          applies_to_item_id?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          message: string
          minimum_absolute_cylinder?: number | null
          minimum_absolute_sphere?: number | null
          minimum_addition?: number | null
          name: string
          organization_id?: number | null
          recommended_item_id?: number | null
          surcharge_amount?: number
          surcharge_currency?: string | null
          updated_at?: string
        }
        Update: {
          applies_to_item_id?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          message?: string
          minimum_absolute_cylinder?: number | null
          minimum_absolute_sphere?: number | null
          minimum_addition?: number | null
          name?: string
          organization_id?: number | null
          recommended_item_id?: number | null
          surcharge_amount?: number
          surcharge_currency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_rules_applies_to_item_id_fkey"
            columns: ["applies_to_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "graduation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_rules_recommended_item_id_fkey"
            columns: ["recommended_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      license_contracts: {
        Row: {
          billing_period: string
          client_address: string | null
          client_email: string | null
          client_identification: string | null
          client_legal_name: string
          client_phone: string | null
          client_representative: string | null
          created_at: string
          created_by: string | null
          currency: string
          ends_on: string
          extra_branches: number
          id: number
          module_keys: string[]
          monthly_amount: number
          notes: string | null
          organization_id: number
          period_amount: number
          plan: string
          post_lock_monthly_amount: number | null
          price_locked_until: string | null
          referral_credit_applied_on: string | null
          referral_credit_days: number | null
          referred_by_organization_id: number | null
          signed_at: string | null
          signed_file_path: string | null
          starts_on: string
          status: string
          term_months: number
          updated_at: string
        }
        Insert: {
          billing_period?: string
          client_address?: string | null
          client_email?: string | null
          client_identification?: string | null
          client_legal_name: string
          client_phone?: string | null
          client_representative?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on: string
          extra_branches?: number
          id?: never
          module_keys?: string[]
          monthly_amount: number
          notes?: string | null
          organization_id: number
          period_amount?: number
          plan: string
          post_lock_monthly_amount?: number | null
          price_locked_until?: string | null
          referral_credit_applied_on?: string | null
          referral_credit_days?: number | null
          referred_by_organization_id?: number | null
          signed_at?: string | null
          signed_file_path?: string | null
          starts_on: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Update: {
          billing_period?: string
          client_address?: string | null
          client_email?: string | null
          client_identification?: string | null
          client_legal_name?: string
          client_phone?: string | null
          client_representative?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string
          extra_branches?: number
          id?: never
          module_keys?: string[]
          monthly_amount?: number
          notes?: string | null
          organization_id?: number
          period_amount?: number
          plan?: string
          post_lock_monthly_amount?: number | null
          price_locked_until?: string | null
          referral_credit_applied_on?: string | null
          referral_credit_days?: number | null
          referred_by_organization_id?: number | null
          signed_at?: string | null
          signed_file_path?: string | null
          starts_on?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_contracts_referred_by_organization_id_fkey"
            columns: ["referred_by_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_documents: {
        Row: {
          content: Json
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: Json
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      market_exchange_rates: {
        Row: {
          fetched_at: string
          rate_date: string
          rates: Json
          source: string
          usd_to_cup: number
        }
        Insert: {
          fetched_at?: string
          rate_date: string
          rates?: Json
          source: string
          usd_to_cup: number
        }
        Update: {
          fetched_at?: string
          rate_date?: string
          rates?: Json
          source?: string
          usd_to_cup?: number
        }
        Relationships: []
      }
      module_dependencies: {
        Row: {
          created_at: string
          depends_on_module_key: string
          module_key: string
        }
        Insert: {
          created_at?: string
          depends_on_module_key: string
          module_key: string
        }
        Update: {
          created_at?: string
          depends_on_module_key?: string
          module_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_dependencies_depends_on_module_key_fkey"
            columns: ["depends_on_module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "module_dependencies_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          description: string
          is_active: boolean
          is_mandatory: boolean
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description: string
          is_active?: boolean
          is_mandatory?: boolean
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string
          is_active?: boolean
          is_mandatory?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      notification_attempts: {
        Row: {
          attempted_at: string
          attempted_by: string
          branch_id: number
          channel: string
          customer_id: number
          failure_code: string | null
          failure_message: string | null
          id: number
          message_snapshot: string
          order_id: number
          organization_id: number
          outcome: string
          provider_chat_id: string | null
          provider_key: string
          provider_message_id: string | null
          recipient_snapshot: string | null
          source_event_key: string | null
          template_key: string
        }
        Insert: {
          attempted_at?: string
          attempted_by: string
          branch_id: number
          channel?: string
          customer_id: number
          failure_code?: string | null
          failure_message?: string | null
          id?: never
          message_snapshot: string
          order_id: number
          organization_id: number
          outcome: string
          provider_chat_id?: string | null
          provider_key?: string
          provider_message_id?: string | null
          recipient_snapshot?: string | null
          source_event_key?: string | null
          template_key: string
        }
        Update: {
          attempted_at?: string
          attempted_by?: string
          branch_id?: number
          channel?: string
          customer_id?: number
          failure_code?: string | null
          failure_message?: string | null
          id?: never
          message_snapshot?: string
          order_id?: number
          organization_id?: number
          outcome?: string
          provider_chat_id?: string | null
          provider_key?: string
          provider_message_id?: string | null
          recipient_snapshot?: string | null
          source_event_key?: string | null
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_attempts_customer_id_organization_id_branch_i_fkey"
            columns: ["customer_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
          {
            foreignKeyName: "notification_attempts_order_id_organization_id_branch_id_fkey"
            columns: ["order_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
          {
            foreignKeyName: "notification_attempts_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          channel: string
          created_at: string
          is_active: boolean
          key: string
          name: string
        }
        Insert: {
          body_template: string
          channel?: string
          created_at?: string
          is_active?: boolean
          key: string
          name: string
        }
        Update: {
          body_template?: string
          channel?: string
          created_at?: string
          is_active?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      order_confirmations: {
        Row: {
          branch_id: number
          confirmation_method: string
          confirmed_at: string
          confirmed_by: string
          cup_equivalent: number | null
          id: number
          order_id: number
          organization_id: number
          totals: Json
          usd_to_cup_rate: number | null
        }
        Insert: {
          branch_id: number
          confirmation_method?: string
          confirmed_at?: string
          confirmed_by: string
          cup_equivalent?: number | null
          id?: never
          order_id: number
          organization_id: number
          totals: Json
          usd_to_cup_rate?: number | null
        }
        Update: {
          branch_id?: number
          confirmation_method?: string
          confirmed_at?: string
          confirmed_by?: string
          cup_equivalent?: number | null
          id?: never
          order_id?: number
          organization_id?: number
          totals?: Json
          usd_to_cup_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_confirmations_order_id_organization_id_branch_id_fkey"
            columns: ["order_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      order_counters: {
        Row: {
          last_value: number
          order_year: number
          organization_id: number
        }
        Insert: {
          last_value?: number
          order_year: number
          organization_id: number
        }
        Update: {
          last_value?: number
          order_year?: number
          organization_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          amount: number
          base_amount: number
          branch_id: number
          catalog_item_id: number | null
          category: string | null
          created_at: string
          currency: string
          discount_authorized_by: string | null
          id: number
          line_kind: string
          name: string
          order_id: number
          organization_id: number
          position: number
          price_adjusted_by: string | null
          price_adjustment_reason: string | null
          source_code: string | null
        }
        Insert: {
          amount: number
          base_amount: number
          branch_id: number
          catalog_item_id?: number | null
          category?: string | null
          created_at?: string
          currency: string
          discount_authorized_by?: string | null
          id?: never
          line_kind: string
          name: string
          order_id: number
          organization_id: number
          position: number
          price_adjusted_by?: string | null
          price_adjustment_reason?: string | null
          source_code?: string | null
        }
        Update: {
          amount?: number
          base_amount?: number
          branch_id?: number
          catalog_item_id?: number | null
          category?: string | null
          created_at?: string
          currency?: string
          discount_authorized_by?: string | null
          id?: never
          line_kind?: string
          name?: string
          order_id?: number
          organization_id?: number
          position?: number
          price_adjusted_by?: string | null
          price_adjustment_reason?: string | null
          source_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_organization_id_branch_id_fkey"
            columns: ["order_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string
          branch_id: number
          commercial_status: string
          created_at: string
          cup_equivalent: number
          customer_id: number
          delivered_at: string | null
          delivered_by: string | null
          id: number
          order_number: string
          organization_id: number
          payment_status: string
          prescription_revision_id: number | null
          primary_seller_id: string
          quotation_id: number
          totals: Json
          usd_to_cup_rate: number
        }
        Insert: {
          accepted_at?: string
          branch_id: number
          commercial_status?: string
          created_at?: string
          cup_equivalent: number
          customer_id: number
          delivered_at?: string | null
          delivered_by?: string | null
          id?: never
          order_number: string
          organization_id: number
          payment_status?: string
          prescription_revision_id?: number | null
          primary_seller_id: string
          quotation_id: number
          totals: Json
          usd_to_cup_rate: number
        }
        Update: {
          accepted_at?: string
          branch_id?: number
          commercial_status?: string
          created_at?: string
          cup_equivalent?: number
          customer_id?: number
          delivered_at?: string | null
          delivered_by?: string | null
          id?: never
          order_number?: string
          organization_id?: number
          payment_status?: string
          prescription_revision_id?: number | null
          primary_seller_id?: string
          quotation_id?: number
          totals?: Json
          usd_to_cup_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "orders_customer_id_organization_id_branch_id_fkey"
            columns: ["customer_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
          {
            foreignKeyName: "orders_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_prescription_revision_id_fkey"
            columns: ["prescription_revision_id"]
            isOneToOne: false
            referencedRelation: "prescription_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quotation_id_organization_id_branch_id_fkey"
            columns: ["quotation_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          branch_id: number | null
          created_at: string
          id: number
          organization_id: number
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          id?: never
          organization_id: number
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          id?: never
          organization_id?: number
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_branch_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      organization_modules: {
        Row: {
          changed_at: string
          changed_by: string
          is_enabled: boolean
          module_key: string
          organization_id: number
        }
        Insert: {
          changed_at?: string
          changed_by: string
          is_enabled?: boolean
          module_key: string
          organization_id: number
        }
        Update: {
          changed_at?: string
          changed_by?: string
          is_enabled?: boolean
          module_key?: string
          organization_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "organization_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          first_order_created_at: string | null
          id: number
          name: string
          order_prefix: string
          status: string
          timezone: string
          updated_at: string
          usd_rate_date: string | null
          usd_rate_source: string | null
          usd_rate_updated_at: string | null
          usd_rate_updated_by: string | null
          usd_to_cup_rate: number | null
        }
        Insert: {
          created_at?: string
          first_order_created_at?: string | null
          id?: never
          name: string
          order_prefix: string
          status?: string
          timezone?: string
          updated_at?: string
          usd_rate_date?: string | null
          usd_rate_source?: string | null
          usd_rate_updated_at?: string | null
          usd_rate_updated_by?: string | null
          usd_to_cup_rate?: number | null
        }
        Update: {
          created_at?: string
          first_order_created_at?: string | null
          id?: never
          name?: string
          order_prefix?: string
          status?: string
          timezone?: string
          updated_at?: string
          usd_rate_date?: string | null
          usd_rate_source?: string | null
          usd_rate_updated_at?: string | null
          usd_rate_updated_by?: string | null
          usd_to_cup_rate?: number | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          applied_rate: number
          branch_id: number
          business_date: string
          cashbox_id: number
          client_request_id: string | null
          currency: string
          equivalent_cup: number | null
          id: number
          is_post_close: boolean
          notes: string | null
          order_id: number
          organization_id: number
          payment_method: string
          received_at: string
          received_by: string
        }
        Insert: {
          amount: number
          applied_rate: number
          branch_id: number
          business_date: string
          cashbox_id: number
          client_request_id?: string | null
          currency: string
          equivalent_cup?: number | null
          id?: never
          is_post_close?: boolean
          notes?: string | null
          order_id: number
          organization_id: number
          payment_method?: string
          received_at?: string
          received_by: string
        }
        Update: {
          amount?: number
          applied_rate?: number
          branch_id?: number
          business_date?: string
          cashbox_id?: number
          client_request_id?: string | null
          currency?: string
          equivalent_cup?: number | null
          id?: never
          is_post_close?: boolean
          notes?: string | null
          order_id?: number
          organization_id?: number
          payment_method?: string
          received_at?: string
          received_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cashbox_id_organization_id_branch_id_received_by__fkey"
            columns: [
              "cashbox_id",
              "organization_id",
              "branch_id",
              "received_by",
              "business_date",
              "currency",
            ]
            isOneToOne: false
            referencedRelation: "seller_cashboxes"
            referencedColumns: [
              "id",
              "organization_id",
              "branch_id",
              "seller_id",
              "business_date",
              "currency",
            ]
          },
          {
            foreignKeyName: "payments_order_id_organization_id_branch_id_fkey"
            columns: ["order_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      platform_provider_profile: {
        Row: {
          address: string | null
          email: string | null
          id: boolean
          identification: string | null
          legal_name: string
          payment_instructions: string | null
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          email?: string | null
          id?: boolean
          identification?: string | null
          legal_name: string
          payment_instructions?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          email?: string | null
          id?: boolean
          identification?: string | null
          legal_name?: string
          payment_instructions?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_support_sessions: {
        Row: {
          administrator_id: string
          ended_at: string | null
          expires_at: string
          id: number
          organization_id: number
          reason: string
          started_at: string
        }
        Insert: {
          administrator_id: string
          ended_at?: string | null
          expires_at: string
          id?: never
          organization_id: number
          reason: string
          started_at?: string
        }
        Update: {
          administrator_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: never
          organization_id?: number
          reason?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_support_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_files: {
        Row: {
          branch_id: number
          byte_size: number
          created_at: string
          file_name: string
          id: number
          mime_type: string
          organization_id: number
          prescription_id: number
          revision_id: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          branch_id: number
          byte_size: number
          created_at?: string
          file_name: string
          id?: never
          mime_type: string
          organization_id: number
          prescription_id: number
          revision_id: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          branch_id?: number
          byte_size?: number
          created_at?: string
          file_name?: string
          id?: never
          mime_type?: string
          organization_id?: number
          prescription_id?: number
          revision_id?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_files_prescription_fkey"
            columns: ["prescription_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
          {
            foreignKeyName: "prescription_files_revision_fkey"
            columns: [
              "revision_id",
              "prescription_id",
              "organization_id",
              "branch_id",
            ]
            isOneToOne: false
            referencedRelation: "prescription_revisions"
            referencedColumns: [
              "id",
              "prescription_id",
              "organization_id",
              "branch_id",
            ]
          },
          {
            foreignKeyName: "prescription_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      prescription_revisions: {
        Row: {
          branch_id: number
          change_reason: string | null
          created_at: string
          created_by: string
          id: number
          left_addition: number | null
          left_axis: number | null
          left_cylinder: number | null
          left_height: number | null
          left_prism: number | null
          left_prism_base: string | null
          left_pupillary_distance: number | null
          left_sphere: number | null
          notes: string | null
          organization_id: number
          prescriber_name: string | null
          prescription_date: string
          prescription_id: number
          pupillary_distance_total: number | null
          revision_number: number
          right_addition: number | null
          right_axis: number | null
          right_cylinder: number | null
          right_height: number | null
          right_prism: number | null
          right_prism_base: string | null
          right_pupillary_distance: number | null
          right_sphere: number | null
        }
        Insert: {
          branch_id: number
          change_reason?: string | null
          created_at?: string
          created_by: string
          id?: never
          left_addition?: number | null
          left_axis?: number | null
          left_cylinder?: number | null
          left_height?: number | null
          left_prism?: number | null
          left_prism_base?: string | null
          left_pupillary_distance?: number | null
          left_sphere?: number | null
          notes?: string | null
          organization_id: number
          prescriber_name?: string | null
          prescription_date?: string
          prescription_id: number
          pupillary_distance_total?: number | null
          revision_number: number
          right_addition?: number | null
          right_axis?: number | null
          right_cylinder?: number | null
          right_height?: number | null
          right_prism?: number | null
          right_prism_base?: string | null
          right_pupillary_distance?: number | null
          right_sphere?: number | null
        }
        Update: {
          branch_id?: number
          change_reason?: string | null
          created_at?: string
          created_by?: string
          id?: never
          left_addition?: number | null
          left_axis?: number | null
          left_cylinder?: number | null
          left_height?: number | null
          left_prism?: number | null
          left_prism_base?: string | null
          left_pupillary_distance?: number | null
          left_sphere?: number | null
          notes?: string | null
          organization_id?: number
          prescriber_name?: string | null
          prescription_date?: string
          prescription_id?: number
          pupillary_distance_total?: number | null
          revision_number?: number
          right_addition?: number | null
          right_axis?: number | null
          right_cylinder?: number | null
          right_height?: number | null
          right_prism?: number | null
          right_prism_base?: string | null
          right_pupillary_distance?: number | null
          right_sphere?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prescription_revisions_prescription_fkey"
            columns: ["prescription_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          archived_at: string | null
          branch_id: number
          created_at: string
          created_by: string
          customer_id: number
          id: number
          organization_id: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          branch_id: number
          created_at?: string
          created_by: string
          customer_id: number
          id?: never
          organization_id: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          branch_id?: number
          created_at?: string
          created_by?: string
          customer_id?: number
          id?: never
          organization_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prescriptions_customer_fkey"
            columns: ["customer_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      production_incidents: {
        Row: {
          branch_id: number
          cost_responsibility: string
          description: string
          id: number
          job_id: number
          opened_at: string
          opened_by: string
          organization_id: number
          rework_job_id: number | null
        }
        Insert: {
          branch_id: number
          cost_responsibility: string
          description: string
          id?: never
          job_id: number
          opened_at?: string
          opened_by: string
          organization_id: number
          rework_job_id?: number | null
        }
        Update: {
          branch_id?: number
          cost_responsibility?: string
          description?: string
          id?: never
          job_id?: number
          opened_at?: string
          opened_by?: string
          organization_id?: number
          rework_job_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_incidents_job_id_organization_id_branch_id_fkey"
            columns: ["job_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "production_jobs"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
          {
            foreignKeyName: "production_incidents_rework_job_id_fkey"
            columns: ["rework_job_id"]
            isOneToOne: false
            referencedRelation: "production_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_job_events: {
        Row: {
          actor_id: string
          actor_role: string
          branch_id: number
          from_status: string | null
          id: number
          job_id: number
          notes: string | null
          occurred_at: string
          organization_id: number
          to_status: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          branch_id: number
          from_status?: string | null
          id?: never
          job_id: number
          notes?: string | null
          occurred_at?: string
          organization_id: number
          to_status: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          branch_id?: number
          from_status?: string | null
          id?: never
          job_id?: number
          notes?: string | null
          occurred_at?: string
          organization_id?: number
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_job_events_job_id_organization_id_branch_id_fkey"
            columns: ["job_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "production_jobs"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      production_jobs: {
        Row: {
          assigned_at: string
          assigned_by: string
          branch_id: number
          completed_at: string | null
          dispatched_at: string | null
          id: number
          is_current: boolean
          job_type: string
          order_id: number
          organization_id: number
          original_job_id: number | null
          provider_id: string
          received_at: string | null
          status: string
          superseded_at: string | null
          work_snapshot: Json
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          branch_id: number
          completed_at?: string | null
          dispatched_at?: string | null
          id?: never
          is_current?: boolean
          job_type: string
          order_id: number
          organization_id: number
          original_job_id?: number | null
          provider_id: string
          received_at?: string | null
          status?: string
          superseded_at?: string | null
          work_snapshot: Json
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          branch_id?: number
          completed_at?: string | null
          dispatched_at?: string | null
          id?: never
          is_current?: boolean
          job_type?: string
          order_id?: number
          organization_id?: number
          original_job_id?: number | null
          provider_id?: string
          received_at?: string | null
          status?: string
          superseded_at?: string | null
          work_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "production_jobs_order_id_organization_id_branch_id_fkey"
            columns: ["order_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
          {
            foreignKeyName: "production_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_jobs_original_job_id_fkey"
            columns: ["original_job_id"]
            isOneToOne: false
            referencedRelation: "production_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          is_active: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          amount: number
          base_amount: number
          branch_id: number
          catalog_item_id: number | null
          category: string | null
          created_at: string
          currency: string
          discount_authorized_by: string | null
          id: number
          line_kind: string
          name: string
          organization_id: number
          position: number
          price_adjusted_by: string | null
          price_adjustment_reason: string | null
          quotation_id: number
          source_code: string | null
        }
        Insert: {
          amount: number
          base_amount: number
          branch_id: number
          catalog_item_id?: number | null
          category?: string | null
          created_at?: string
          currency: string
          discount_authorized_by?: string | null
          id?: never
          line_kind: string
          name: string
          organization_id: number
          position: number
          price_adjusted_by?: string | null
          price_adjustment_reason?: string | null
          quotation_id: number
          source_code?: string | null
        }
        Update: {
          amount?: number
          base_amount?: number
          branch_id?: number
          catalog_item_id?: number | null
          category?: string | null
          created_at?: string
          currency?: string
          discount_authorized_by?: string | null
          id?: never
          line_kind?: string
          name?: string
          organization_id?: number
          position?: number
          price_adjusted_by?: string | null
          price_adjustment_reason?: string | null
          quotation_id?: number
          source_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_organization_id_branch_id_fkey"
            columns: ["quotation_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
        ]
      }
      quotations: {
        Row: {
          accepted_at: string | null
          branch_id: number
          client_request_id: string | null
          created_at: string
          cup_equivalent: number
          customer_id: number
          id: number
          notes: string | null
          organization_id: number
          prescription_revision_id: number | null
          seller_id: string
          status: string
          totals: Json
          updated_at: string
          usd_to_cup_rate: number
          warnings: Json
        }
        Insert: {
          accepted_at?: string | null
          branch_id: number
          client_request_id?: string | null
          created_at?: string
          cup_equivalent: number
          customer_id: number
          id?: never
          notes?: string | null
          organization_id: number
          prescription_revision_id?: number | null
          seller_id: string
          status?: string
          totals?: Json
          updated_at?: string
          usd_to_cup_rate: number
          warnings?: Json
        }
        Update: {
          accepted_at?: string | null
          branch_id?: number
          client_request_id?: string | null
          created_at?: string
          cup_equivalent?: number
          customer_id?: number
          id?: never
          notes?: string | null
          organization_id?: number
          prescription_revision_id?: number | null
          seller_id?: string
          status?: string
          totals?: Json
          updated_at?: string
          usd_to_cup_rate?: number
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "quotations_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotations_customer_id_organization_id_branch_id_fkey"
            columns: ["customer_id", "organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id", "branch_id"]
          },
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_prescription_revision_id_fkey"
            columns: ["prescription_revision_id"]
            isOneToOne: false
            referencedRelation: "prescription_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_cashboxes: {
        Row: {
          branch_id: number
          business_date: string
          created_at: string
          currency: string
          id: number
          organization_id: number
          seller_id: string
        }
        Insert: {
          branch_id: number
          business_date: string
          created_at?: string
          currency: string
          id?: never
          organization_id: number
          seller_id: string
        }
        Update: {
          branch_id?: number
          business_date?: string
          created_at?: string
          currency?: string
          id?: never
          organization_id?: number
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_cashboxes_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "seller_cashboxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          billing_period: string
          created_at: string
          currency: string
          expires_on: string
          id: number
          last_renewed_on: string | null
          notes: string | null
          organization_id: number
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_period?: string
          created_at?: string
          currency?: string
          expires_on: string
          id?: never
          last_renewed_on?: string | null
          notes?: string | null
          organization_id: number
          starts_on: string
          status: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_period?: string
          created_at?: string
          currency?: string
          expires_on?: string
          id?: never
          last_renewed_on?: string | null
          notes?: string | null
          organization_id?: number
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_quotation: { Args: { target_quotation_id: number }; Returns: Json }
      add_organization_member: {
        Args: {
          actor_user_id: string
          target_branch_id: number
          target_organization_id: number
          target_role: string
          target_status: string
          target_user_id: string
        }
        Returns: number
      }
      adopt_market_usd_rate: {
        Args: { target_organization_id: number }
        Returns: Json
      }
      apply_referral_credit: {
        Args: { target_contract_id: number }
        Returns: Json
      }
      assign_production_job: {
        Args: { job_type: string; provider_id: string; target_order_id: number }
        Returns: number
      }
      begin_platform_support_session: {
        Args: {
          duration_minutes?: number
          support_reason: string
          target_organization_id: number
        }
        Returns: Json
      }
      bootstrap_organization: {
        Args: {
          actor_user_id: string
          branch_code: string
          branch_name: string
          enabled_module_keys: string[]
          organization_name: string
          organization_prefix: string
          organization_timezone: string
          owner_user_id: string
          subscription_amount: number
          subscription_billing_period: string
          subscription_currency: string
          subscription_expires_on: string
          subscription_starts_on: string
          subscription_status: string
        }
        Returns: number
      }
      calculate_catalog_price: {
        Args: {
          selected_item_ids: number[]
          target_organization_id: number
          target_prescription_revision_id: number
          usd_to_cup_rate: number
        }
        Returns: Json
      }
      calculate_sale_price: {
        Args: {
          line_adjustments?: Json
          selected_item_ids: number[]
          target_organization_id: number
          target_prescription_revision_id: number
          usd_to_cup_rate: number
        }
        Returns: Json
      }
      cancel_license_contract: {
        Args: { cancel_reason: string; target_contract_id: number }
        Returns: boolean
      }
      close_cashbox: {
        Args: {
          closure_type: string
          declared_amount: number
          target_cashbox_id: number
        }
        Returns: Json
      }
      complete_automatic_notification_dispatch: {
        Args: {
          target_dispatch_id: number
          target_failure_code?: string
          target_outcome: string
        }
        Returns: undefined
      }
      complete_platform_alert: {
        Args: {
          target_alert_id: number
          target_failure_code: string
          target_failure_message: string
          target_message_id: string
          target_outcome: string
        }
        Returns: undefined
      }
      complete_subscription_notice: {
        Args: {
          target_failure_code: string
          target_failure_message: string
          target_message_id: string
          target_notice_id: number
          target_outcome: string
        }
        Returns: undefined
      }
      create_branch: {
        Args: {
          branch_code: string
          branch_name: string
          change_reason: string
          target_organization_id: number
        }
        Returns: number
      }
      create_customer_with_phones:
        | {
            Args: {
              customer_address?: string
              customer_birth_date?: string
              customer_full_name: string
              customer_messaging_consent?: boolean
              customer_national_id?: string
              customer_notes?: string
              phone_entries?: Json
              target_branch_id: number
              target_organization_id: number
            }
            Returns: number
          }
        | {
            Args: {
              customer_address?: string
              customer_birth_date?: string
              customer_full_name: string
              customer_messaging_consent?: boolean
              customer_national_id?: string
              customer_notes?: string
              customer_request_id: string
              phone_entries?: Json
              target_branch_id: number
              target_organization_id: number
            }
            Returns: number
          }
      create_prescription_revision: {
        Args: {
          revision_change_reason: string
          revision_left_addition: number
          revision_left_axis: number
          revision_left_cylinder: number
          revision_left_height: number
          revision_left_prism: number
          revision_left_prism_base: string
          revision_left_pupillary_distance: number
          revision_left_sphere: number
          revision_notes: string
          revision_prescriber_name: string
          revision_prescription_date: string
          revision_pupillary_distance_total: number
          revision_right_addition: number
          revision_right_axis: number
          revision_right_cylinder: number
          revision_right_height: number
          revision_right_prism: number
          revision_right_prism_base: string
          revision_right_pupillary_distance: number
          revision_right_sphere: number
          target_branch_id: number
          target_customer_id: number
          target_organization_id: number
          target_prescription_id: number
        }
        Returns: Json
      }
      create_production_rework:
        | { Args: { target_incident_id: number }; Returns: number }
        | {
            Args: { new_provider_id: string; target_incident_id: number }
            Returns: number
          }
      current_user_can_manage_organization: {
        Args: { target_organization_id: number }
        Returns: boolean
      }
      current_user_can_operate_organization: {
        Args: { required_module_key?: string; target_organization_id: number }
        Returns: boolean
      }
      current_user_is_platform_admin: { Args: never; Returns: boolean }
      delete_empty_organization: {
        Args: {
          change_reason: string
          confirm_name: string
          target_organization_id: number
        }
        Returns: boolean
      }
      end_platform_support_session: {
        Args: { target_session_id: number }
        Returns: boolean
      }
      find_auth_user_by_email: {
        Args: { target_email: string }
        Returns: {
          is_confirmed: boolean
          user_id: string
        }[]
      }
      get_automatic_notification_payload: {
        Args: { target_dispatch_id: number }
        Returns: Json
      }
      get_error_group: { Args: { target_group_id: number }; Returns: Json }
      get_my_subscription_notices: { Args: never; Returns: Json }
      get_navigation_counters: { Args: never; Returns: Json }
      get_openwa_runtime_config: { Args: never; Returns: Json }
      get_order_detail: { Args: { target_order_id: number }; Returns: Json }
      get_order_kpis: { Args: never; Returns: Json }
      get_order_payment_summary: {
        Args: { target_order_id: number }
        Returns: Json
      }
      get_order_production_panel: {
        Args: { target_order_id: number }
        Returns: Json
      }
      get_order_timeline: { Args: { target_order_id: number }; Returns: Json }
      get_organization_activity: {
        Args: { target_days?: number; target_organization_id?: number }
        Returns: Json
      }
      get_owner_dashboard: {
        Args: {
          date_from?: string
          date_to?: string
          target_branch_id?: number
          target_organization_id: number
          target_seller_id?: string
        }
        Returns: Json
      }
      get_platform_alert_payload: {
        Args: { target_alert_id: number }
        Returns: Json
      }
      get_platform_usage: { Args: never; Returns: Json }
      get_subscription_notice_payload: {
        Args: { target_notice_id: number }
        Returns: Json
      }
      list_accessible_cashboxes: {
        Args: {
          target_branch_id?: number
          target_business_date?: string
          target_seller_id?: string
        }
        Returns: Json
      }
      list_accessible_orders:
        | { Args: never; Returns: Json }
        | { Args: { finished_since: string }; Returns: Json }
      list_accessible_production_jobs: { Args: never; Returns: Json }
      list_error_groups: {
        Args: { target_limit?: number; target_status?: string }
        Returns: Json
      }
      list_my_pending_invitations: { Args: never; Returns: Json }
      list_subscription_notices: {
        Args: { target_organization_id: number }
        Returns: Json
      }
      manage_organization_member: {
        Args: {
          target_branch_id: number
          target_membership_id: number
          target_status: string
        }
        Returns: undefined
      }
      mark_order_delivered: {
        Args: { target_order_id: number }
        Returns: undefined
      }
      notify_order_ready: {
        Args: { request_id: string; target_order_id: number }
        Returns: Json
      }
      platform_owner_email: {
        Args: { target_user_id: string }
        Returns: string
      }
      prepare_manual_notification: {
        Args: { target_order_id: number; target_template_key: string }
        Returns: Json
      }
      prepare_openwa_notification: {
        Args: { target_order_id: number; target_template_key: string }
        Returns: Json
      }
      record_server_error: {
        Args: { ingest_secret: string; report: Json }
        Returns: undefined
      }
      record_subscription_payment: {
        Args: { payment_note: string; target_organization_id: number }
        Returns: Json
      }
      register_cash_payment: {
        Args: {
          payment_amount: number
          payment_applied_rate: number
          payment_currency: string
          payment_notes?: string
          payment_request_id?: string
          target_order_id: number
        }
        Returns: Json
      }
      report_client_error: { Args: { report: Json }; Returns: undefined }
      report_production_incident: {
        Args: {
          cost_responsibility: string
          description: string
          target_job_id: number
        }
        Returns: number
      }
      respond_to_organization_invitation: {
        Args: { accept: boolean; target_membership_id: number }
        Returns: undefined
      }
      save_quotation: {
        Args: {
          selected_item_ids: number[]
          target_branch_id: number
          target_customer_id: number
          target_line_adjustments?: Json
          target_notes?: string
          target_organization_id: number
          target_prescription_revision_id: number
          target_quotation_id: number
          target_usd_to_cup_rate: number
        }
        Returns: number
      }
      save_sale_quotation: {
        Args: {
          quotation_request_id?: string
          selected_item_ids: number[]
          target_branch_id: number
          target_customer_id: number
          target_line_adjustments?: Json
          target_notes?: string
          target_organization_id: number
          target_prescription_revision_id: number
          target_quotation_id: number
          target_usd_to_cup_rate: number
        }
        Returns: Json
      }
      set_branch_active: {
        Args: {
          change_reason: string
          target_active: boolean
          target_branch_id: number
        }
        Returns: boolean
      }
      set_error_group_status: {
        Args: { target_group_id: number; target_status: string }
        Returns: undefined
      }
      set_primary_branch: {
        Args: { change_reason: string; target_branch_id: number }
        Returns: boolean
      }
      sign_license_contract: {
        Args: { signed_path: string; target_contract_id: number }
        Returns: Json
      }
      transition_production_job: {
        Args: { notes?: string; target_job_id: number; target_status: string }
        Returns: undefined
      }
      update_branch: {
        Args: {
          branch_code: string
          branch_name: string
          change_reason: string
          target_branch_id: number
        }
        Returns: boolean
      }
      update_customer_with_phones: {
        Args: {
          customer_address?: string
          customer_birth_date?: string
          customer_full_name: string
          customer_messaging_consent?: boolean
          customer_national_id?: string
          customer_notes?: string
          phone_entries?: Json
          target_customer_id: number
        }
        Returns: number
      }
      update_platform_organization: {
        Args: {
          change_reason: string
          target_amount: number
          target_billing_period: string
          target_currency: string
          target_expires_on: string
          target_module_keys: string[]
          target_organization_id: number
          target_organization_status: string
          target_starts_on: string
          target_subscription_status: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
