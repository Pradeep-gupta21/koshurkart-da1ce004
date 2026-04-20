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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          bid_amount: number
          budget: number
          clicks: number | null
          conversions: number | null
          created_at: string
          daily_limit: number | null
          effective_score: number | null
          end_date: string | null
          id: string
          impressions: number | null
          placement: string
          product_id: string
          quality_score: number | null
          start_date: string
          status: string
          vendor_id: string
        }
        Insert: {
          bid_amount?: number
          budget?: number
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          daily_limit?: number | null
          effective_score?: number | null
          end_date?: string | null
          id?: string
          impressions?: number | null
          placement?: string
          product_id: string
          quality_score?: number | null
          start_date?: string
          status?: string
          vendor_id: string
        }
        Update: {
          bid_amount?: number
          budget?: number
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          daily_limit?: number | null
          effective_score?: number | null
          end_date?: string | null
          id?: string
          impressions?: number | null
          placement?: string
          product_id?: string
          quality_score?: number | null
          start_date?: string
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_placements: {
        Row: {
          id: string
          is_active: boolean | null
          minimum_bid: number | null
          placement_name: string
          price_per_click: number | null
          price_per_impression: number | null
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          minimum_bid?: number | null
          placement_name: string
          price_per_click?: number | null
          price_per_impression?: number | null
        }
        Update: {
          id?: string
          is_active?: boolean | null
          minimum_bid?: number | null
          placement_name?: string
          price_per_click?: number | null
          price_per_impression?: number | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          product_id: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          product_id?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          product_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          badge_key: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          order_index: number
          parent_id: string | null
          role_access: Database["public"]["Enums"]["app_role"][]
          route: string | null
          section: string
          title: string
          updated_at: string
        }
        Insert: {
          badge_key?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          order_index?: number
          parent_id?: string | null
          role_access?: Database["public"]["Enums"]["app_role"][]
          route?: string | null
          section?: string
          title: string
          updated_at?: string
        }
        Update: {
          badge_key?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          order_index?: number
          parent_id?: string | null
          role_access?: Database["public"]["Enums"]["app_role"][]
          route?: string | null
          section?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          image: string | null
          order_id: string
          price: number
          product_id: string | null
          quantity: number
          title: string
          vendor_id: string | null
        }
        Insert: {
          id?: string
          image?: string | null
          order_id: string
          price: number
          product_id?: string | null
          quantity?: number
          title: string
          vendor_id?: string | null
        }
        Update: {
          id?: string
          image?: string | null
          order_id?: string
          price?: number
          product_id?: string | null
          quantity?: number
          title?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          courier_api_config: Json | null
          created_at: string
          estimated_delivery: string | null
          id: string
          order_status: string
          payment_status: string
          shipping_provider: string | null
          shipping_status: string
          total_amount: number
          tracking_id: string | null
          user_id: string
        }
        Insert: {
          courier_api_config?: Json | null
          created_at?: string
          estimated_delivery?: string | null
          id?: string
          order_status?: string
          payment_status?: string
          shipping_provider?: string | null
          shipping_status?: string
          total_amount?: number
          tracking_id?: string | null
          user_id: string
        }
        Update: {
          courier_api_config?: Json | null
          created_at?: string
          estimated_delivery?: string | null
          id?: string
          order_status?: string
          payment_status?: string
          shipping_provider?: string | null
          shipping_status?: string
          total_amount?: number
          tracking_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          commission_percentage: number | null
          created_at: string
          credited_at: string | null
          id: string
          order_id: string
          payment_method: string
          payment_proof: string | null
          payment_provider: string | null
          payment_status: string
          platform_commission: number | null
          qr_code_url: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          transaction_id: string | null
          upi_id: string | null
          user_id: string
          vendor_earnings: number | null
        }
        Insert: {
          amount?: number
          commission_percentage?: number | null
          created_at?: string
          credited_at?: string | null
          id?: string
          order_id: string
          payment_method?: string
          payment_proof?: string | null
          payment_provider?: string | null
          payment_status?: string
          platform_commission?: number | null
          qr_code_url?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          transaction_id?: string | null
          upi_id?: string | null
          user_id: string
          vendor_earnings?: number | null
        }
        Update: {
          amount?: number
          commission_percentage?: number | null
          created_at?: string
          credited_at?: string | null
          id?: string
          order_id?: string
          payment_method?: string
          payment_proof?: string | null
          payment_provider?: string | null
          payment_status?: string
          platform_commission?: number | null
          qr_code_url?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          transaction_id?: string | null
          upi_id?: string | null
          user_id?: string
          vendor_earnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          id: string
          processed_at: string | null
          requested_at: string
          status: string
          vendor_id: string
        }
        Insert: {
          amount?: number
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          created_at: string | null
          demand_threshold_high: number
          demand_threshold_low: number
          high_demand_multiplier: number
          high_stock_multiplier: number
          id: string
          is_active: boolean | null
          low_demand_multiplier: number
          low_stock_multiplier: number
          max_decrease_pct: number
          max_increase_pct: number
          rule_name: string
          stock_threshold_high: number
          stock_threshold_low: number
        }
        Insert: {
          created_at?: string | null
          demand_threshold_high?: number
          demand_threshold_low?: number
          high_demand_multiplier?: number
          high_stock_multiplier?: number
          id?: string
          is_active?: boolean | null
          low_demand_multiplier?: number
          low_stock_multiplier?: number
          max_decrease_pct?: number
          max_increase_pct?: number
          rule_name: string
          stock_threshold_high?: number
          stock_threshold_low?: number
        }
        Update: {
          created_at?: string | null
          demand_threshold_high?: number
          demand_threshold_low?: number
          high_demand_multiplier?: number
          high_stock_multiplier?: number
          id?: string
          is_active?: boolean | null
          low_demand_multiplier?: number
          low_stock_multiplier?: number
          max_decrease_pct?: number
          max_increase_pct?: number
          rule_name?: string
          stock_threshold_high?: number
          stock_threshold_low?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          base_price: number | null
          category: string
          created_at: string
          demand_score: number | null
          description: string | null
          discount_price: number | null
          dynamic_price: number | null
          id: string
          images: string[] | null
          is_sponsored: boolean | null
          low_stock_threshold: number
          price: number
          rating: number | null
          reserved_stock: number
          review_count: number | null
          sales_count: number
          search_vector: unknown
          slug: string
          status: string
          stock: number
          tags: string[] | null
          title: string
          trending_score: number | null
          vendor_id: string
          view_count: number
        }
        Insert: {
          base_price?: number | null
          category?: string
          created_at?: string
          demand_score?: number | null
          description?: string | null
          discount_price?: number | null
          dynamic_price?: number | null
          id?: string
          images?: string[] | null
          is_sponsored?: boolean | null
          low_stock_threshold?: number
          price?: number
          rating?: number | null
          reserved_stock?: number
          review_count?: number | null
          sales_count?: number
          search_vector?: unknown
          slug: string
          status?: string
          stock?: number
          tags?: string[] | null
          title: string
          trending_score?: number | null
          vendor_id: string
          view_count?: number
        }
        Update: {
          base_price?: number | null
          category?: string
          created_at?: string
          demand_score?: number | null
          description?: string | null
          discount_price?: number | null
          dynamic_price?: number | null
          id?: string
          images?: string[] | null
          is_sponsored?: boolean | null
          low_stock_threshold?: number
          price?: number
          rating?: number | null
          reserved_stock?: number
          review_count?: number | null
          sales_count?: number
          search_vector?: unknown
          slug?: string
          status?: string
          stock?: number
          tags?: string[] | null
          title?: string
          trending_score?: number | null
          vendor_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: string | null
          country: string | null
          created_at: string
          default_pincode: string | null
          email: string
          id: string
          name: string
          phone: string | null
          preferred_currency: string | null
        }
        Insert: {
          avatar?: string | null
          country?: string | null
          created_at?: string
          default_pincode?: string | null
          email?: string
          id: string
          name?: string
          phone?: string | null
          preferred_currency?: string | null
        }
        Update: {
          avatar?: string | null
          country?: string | null
          created_at?: string
          default_pincode?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          preferred_currency?: string | null
        }
        Relationships: []
      }
      review_helpful_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_helpful_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          flagged_reason: string | null
          helpful_count: number
          id: string
          images: string[]
          is_suspicious: boolean | null
          is_verified_purchase: boolean | null
          moderation_status: string | null
          order_id: string | null
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          flagged_reason?: string | null
          helpful_count?: number
          id?: string
          images?: string[]
          is_suspicious?: boolean | null
          is_verified_purchase?: boolean | null
          moderation_status?: string | null
          order_id?: string | null
          product_id: string
          rating?: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          flagged_reason?: string | null
          helpful_count?: number
          id?: string
          images?: string[]
          is_suspicious?: boolean | null
          is_verified_purchase?: boolean | null
          moderation_status?: string | null
          order_id?: string | null
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      serviceable_pincodes: {
        Row: {
          base_delivery_days: number
          city: string
          cod_available: boolean
          country: string
          created_at: string
          is_active: boolean
          pincode: string
          region_zone: string
          state: string | null
          surcharge_pct: number
        }
        Insert: {
          base_delivery_days?: number
          city: string
          cod_available?: boolean
          country?: string
          created_at?: string
          is_active?: boolean
          pincode: string
          region_zone?: string
          state?: string | null
          surcharge_pct?: number
        }
        Update: {
          base_delivery_days?: number
          city?: string
          cod_available?: boolean
          country?: string
          created_at?: string
          is_active?: boolean
          pincode?: string
          region_zone?: string
          state?: string | null
          surcharge_pct?: number
        }
        Relationships: []
      }
      shipment_events: {
        Row: {
          created_at: string
          description: string | null
          id: string
          location: string | null
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          order_id: string
          status: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suspicious_clicks: {
        Row: {
          campaign_id: string
          click_count: number
          flagged_at: string
          id: string
          user_id: string
          window_start: string
        }
        Insert: {
          campaign_id: string
          click_count?: number
          flagged_at?: string
          id?: string
          user_id: string
          window_start: string
        }
        Update: {
          campaign_id?: string
          click_count?: number
          flagged_at?: string
          id?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          city: string
          country: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          lat: number | null
          lng: number | null
          pincode: string
          state: string | null
          user_id: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          pincode: string
          state?: string | null
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          pincode?: string
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_serviceability: {
        Row: {
          created_at: string
          delivery_days_override: number | null
          id: string
          pincode_pattern: string
          ships: boolean
          vendor_id: string
        }
        Insert: {
          created_at?: string
          delivery_days_override?: number | null
          id?: string
          pincode_pattern: string
          ships?: boolean
          vendor_id: string
        }
        Update: {
          created_at?: string
          delivery_days_override?: number | null
          id?: string
          pincode_pattern?: string
          ships?: boolean
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_serviceability_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          aadhaar_last4: string | null
          bank_account_holder: string | null
          bank_account_number_masked: string | null
          bank_ifsc: string | null
          business_name: string | null
          business_type: string | null
          cancellation_rate: number | null
          created_at: string
          delivery_rate: number | null
          description: string | null
          gstin: string | null
          id: string
          is_verified: boolean | null
          kyc_doc_address: string | null
          kyc_doc_business: string | null
          kyc_doc_pan: string | null
          kyc_rejection_reason: string | null
          kyc_reviewed_at: string | null
          kyc_status: string
          kyc_submitted_at: string | null
          logo: string | null
          pan_number: string | null
          rating: number | null
          return_rate: number | null
          review_rating: number | null
          store_name: string
          store_slug: string
          total_earnings: number | null
          total_sales: number | null
          trust_score: number | null
          user_id: string
          verification_status: string
          withdrawable_balance: number | null
        }
        Insert: {
          aadhaar_last4?: string | null
          bank_account_holder?: string | null
          bank_account_number_masked?: string | null
          bank_ifsc?: string | null
          business_name?: string | null
          business_type?: string | null
          cancellation_rate?: number | null
          created_at?: string
          delivery_rate?: number | null
          description?: string | null
          gstin?: string | null
          id?: string
          is_verified?: boolean | null
          kyc_doc_address?: string | null
          kyc_doc_business?: string | null
          kyc_doc_pan?: string | null
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_status?: string
          kyc_submitted_at?: string | null
          logo?: string | null
          pan_number?: string | null
          rating?: number | null
          return_rate?: number | null
          review_rating?: number | null
          store_name: string
          store_slug: string
          total_earnings?: number | null
          total_sales?: number | null
          trust_score?: number | null
          user_id: string
          verification_status?: string
          withdrawable_balance?: number | null
        }
        Update: {
          aadhaar_last4?: string | null
          bank_account_holder?: string | null
          bank_account_number_masked?: string | null
          bank_ifsc?: string | null
          business_name?: string | null
          business_type?: string | null
          cancellation_rate?: number | null
          created_at?: string
          delivery_rate?: number | null
          description?: string | null
          gstin?: string | null
          id?: string
          is_verified?: boolean | null
          kyc_doc_address?: string | null
          kyc_doc_business?: string | null
          kyc_doc_pan?: string | null
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_status?: string
          kyc_submitted_at?: string | null
          logo?: string | null
          pan_number?: string | null
          rating?: number | null
          return_rate?: number | null
          review_rating?: number | null
          store_name?: string
          store_slug?: string
          total_earnings?: number | null
          total_sales?: number | null
          trust_score?: number | null
          user_id?: string
          verification_status?: string
          withdrawable_balance?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_dynamic_prices: { Args: never; Returns: undefined }
      calculate_product_scores: { Args: never; Returns: undefined }
      can_review_product: {
        Args: { _product_id: string; _user_id: string }
        Returns: string
      }
      check_serviceability: {
        Args: { _pincode: string; _product_ids: string[] }
        Returns: {
          cod: boolean
          deliverable: boolean
          eta_days: number
          product_id: string
          surcharge_pct: number
        }[]
      }
      confirm_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      create_notification: {
        Args: {
          _entity_id?: string
          _message: string
          _metadata?: Json
          _title: string
          _type: string
          _user_id: string
        }
        Returns: undefined
      }
      detect_abnormal_purchases: {
        Args: never
        Returns: {
          order_count: number
          user_email: string
          user_id: string
          user_name: string
          window_start: string
        }[]
      }
      get_auction_winners: {
        Args: { p_limit?: number; p_placement: string }
        Returns: {
          bid_amount: number
          campaign_id: string
          category: string
          clicks: number
          conversions: number
          created_at: string
          discount_price: number
          effective_score: number
          images: string[]
          impressions: number
          price: number
          product_id: string
          quality_score: number
          rating: number
          review_count: number
          slug: string
          store_name: string
          title: string
          vendor_id: string
        }[]
      }
      get_local_deals: {
        Args: { _limit?: number; _pincode?: string }
        Returns: {
          category: string
          created_at: string
          description: string
          discount_pct: number
          discount_price: number
          id: string
          images: string[]
          is_sponsored: boolean
          low_stock_threshold: number
          price: number
          rating: number
          reserved_stock: number
          review_count: number
          sales_count: number
          slug: string
          status: string
          stock: number
          store_name: string
          title: string
          trending_score: number
          vendor_id: string
          view_count: number
        }[]
      }
      get_ranked_products: {
        Args: { p_category?: string; p_limit?: number; p_search?: string }
        Returns: {
          category: string
          created_at: string
          description: string
          discount_price: number
          id: string
          images: string[]
          is_sponsored: boolean
          low_stock_threshold: number
          price: number
          rank_score: number
          rating: number
          reserved_stock: number
          review_count: number
          sales_count: number
          slug: string
          status: string
          stock: number
          store_name: string
          title: string
          trending_score: number
          vendor_id: string
          view_count: number
        }[]
      }
      get_search_suggestions: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          suggestion: string
          suggestion_type: string
        }[]
      }
      get_trending_products: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          created_at: string
          description: string
          discount_price: number
          id: string
          images: string[]
          is_sponsored: boolean
          low_stock_threshold: number
          price: number
          rating: number
          reserved_stock: number
          review_count: number
          sales_count: number
          slug: string
          status: string
          stock: number
          store_name: string
          title: string
          trending_score: number
          vendor_id: string
          view_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_order_owner: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_vendor_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      promote_to_admin: { Args: { _email: string }; Returns: undefined }
      recalculate_ad_quality_score: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      recalculate_vendor_trust_score: {
        Args: { p_vendor_id: string }
        Returns: undefined
      }
      record_analytics_event: {
        Args: {
          _campaign_id?: string
          _event_type: string
          _metadata?: Json
          _product_id?: string
        }
        Returns: undefined
      }
      release_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      reserve_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      search_products: {
        Args: {
          p_category?: string
          p_limit?: number
          p_max_price?: number
          p_min_price?: number
          p_min_rating?: number
          p_query?: string
          p_sort?: string
        }
        Returns: {
          category: string
          created_at: string
          description: string
          discount_price: number
          id: string
          images: string[]
          is_sponsored: boolean
          low_stock_threshold: number
          price: number
          rating: number
          relevance_score: number
          reserved_stock: number
          review_count: number
          sales_count: number
          slug: string
          status: string
          stock: number
          store_name: string
          tags: string[]
          title: string
          trending_score: number
          vendor_id: string
          view_count: number
        }[]
      }
      track_ad_event: {
        Args: { _campaign_id: string; _event_type: string }
        Returns: undefined
      }
      vendor_apply: {
        Args: {
          _description?: string
          _store_name: string
          _store_slug: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "user" | "vendor" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "vendor", "admin"],
    },
  },
} as const
