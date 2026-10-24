export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      affiliate_clicks: {
        Row: {
          affiliate_id: string
          created_at: string
          id: string
          ip_hash: string | null
          path: string | null
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          path?: string | null
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_affiliate_id_fkey"
            columns: ["affiliate_id"]
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_conversions: {
        Row: {
          affiliate_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          order_amount: number
          order_id: string
          run_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          commission_amount: number
          commission_rate: number
          created_at?: string
          id?: string
          order_amount: number
          order_id: string
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          order_amount?: number
          order_id?: string
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_conversions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payout_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          order_count: number
          period: string
          status: string
          total_commission: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_count?: number
          period: string
          status?: string
          total_commission?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_count?: number
          period?: string
          status?: string
          total_commission?: number
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_runs_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_profiles: {
        Row: {
          application_answers: Json | null
          code: string
          commission_rate: number
          created_at: string
          credit_balance: number
          id: string
          status: string
          total_clicks: number
          total_earnings: number
          total_orders: number
          total_paid: number
          updated_at: string
          user_id: string
        }
        Insert: {
          application_answers?: Json | null
          code: string
          commission_rate?: number
          created_at?: string
          credit_balance?: number
          id?: string
          status?: string
          total_clicks?: number
          total_earnings?: number
          total_orders?: number
          total_paid?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          application_answers?: Json | null
          code?: string
          commission_rate?: number
          created_at?: string
          credit_balance?: number
          id?: string
          status?: string
          total_clicks?: number
          total_earnings?: number
          total_orders?: number
          total_paid?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_profiles_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily: {
        Row: {
          add_to_carts: number
          coupon_applies: number
          day: string
          pageviews: number
          purchases: number
          revenue: number
          sessions: number
          users: number
          utm_campaign: string
          utm_source: string
        }
        Insert: {
          add_to_carts?: number
          coupon_applies?: number
          day: string
          pageviews?: number
          purchases?: number
          revenue?: number
          sessions?: number
          users?: number
          utm_campaign?: string
          utm_source?: string
        }
        Update: {
          add_to_carts?: number
          coupon_applies?: number
          day?: string
          pageviews?: number
          purchases?: number
          revenue?: number
          sessions?: number
          users?: number
          utm_campaign?: string
          utm_source?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          meta: Json | null
          path: string | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: never
          meta?: Json | null
          path?: string | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: never
          meta?: Json | null
          path?: string | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_session_id_fkey"
            columns: ["session_id"]
            referencedRelation: "analytics_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      analytics_sessions: {
        Row: {
          abandoned_notified_at: string | null
          contact_id: string | null
          device: string | null
          event_count: number
          ip: string | null
          is_bot: boolean
          landing_path: string | null
          last_seen_at: string
          referrer: string | null
          session_id: string
          started_at: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          abandoned_notified_at?: string | null
          contact_id?: string | null
          device?: string | null
          event_count?: number
          ip?: string | null
          is_bot?: boolean
          landing_path?: string | null
          last_seen_at?: string
          referrer?: string | null
          session_id: string
          started_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          abandoned_notified_at?: string | null
          contact_id?: string | null
          device?: string | null
          event_count?: number
          ip?: string | null
          is_bot?: boolean
          landing_path?: string | null
          last_seen_at?: string
          referrer?: string | null
          session_id?: string
          started_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_sessions_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_runs: {
        Row: {
          backup_name: string | null
          created_at: string
          db_bytes: number | null
          id: number
          kind: string
          local_ok: boolean | null
          message: string | null
          offsite_ok: boolean | null
          ok: boolean
          storage_bytes: number | null
          tables_checked: number | null
        }
        Insert: {
          backup_name?: string | null
          created_at?: string
          db_bytes?: number | null
          id?: number
          kind: string
          local_ok?: boolean | null
          message?: string | null
          offsite_ok?: boolean | null
          ok: boolean
          storage_bytes?: number | null
          tables_checked?: number | null
        }
        Update: {
          backup_name?: string | null
          created_at?: string
          db_bytes?: number | null
          id?: number
          kind?: string
          local_ok?: boolean | null
          message?: string | null
          offsite_ok?: boolean | null
          ok?: boolean
          storage_bytes?: number | null
          tables_checked?: number | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          intro: string | null
          faq: Json | null
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intro?: string | null
          faq?: Json | null
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intro?: string | null
          faq?: Json | null
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          intro: string | null
          faq: Json | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intro?: string | null
          faq?: Json | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intro?: string | null
          faq?: Json | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string
          instagram_handle: string | null
          linked_user_id: string | null
          note: string | null
          phone: string | null
          shoe_size: string | null
          source_channel: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          instagram_handle?: string | null
          linked_user_id?: string | null
          note?: string | null
          phone?: string | null
          shoe_size?: string | null
          source_channel?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          instagram_handle?: string | null
          linked_user_id?: string | null
          note?: string | null
          phone?: string | null
          shoe_size?: string | null
          source_channel?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          affiliate_id: string | null
          brand_ids: string[] | null
          category_ids: string[] | null
          amount: number
          auto_assign_on_signup: boolean
          campaign_slug: string | null
          code: string
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          is_personal: boolean
          max_discount_amount: number | null
          max_uses: number | null
          min_order_amount: number
          name: string
          per_user_limit: number
          starts_at: string | null
          type: string
          updated_at: string | null
          used_count: number
        }
        Insert: {
          affiliate_id?: string | null
          brand_ids?: string[] | null
          category_ids?: string[] | null
          amount?: number
          auto_assign_on_signup?: boolean
          campaign_slug?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          max_discount_amount?: number | null
          max_uses?: number | null
          min_order_amount?: number
          name: string
          per_user_limit?: number
          starts_at?: string | null
          type: string
          updated_at?: string | null
          used_count?: number
        }
        Update: {
          affiliate_id?: string | null
          brand_ids?: string[] | null
          category_ids?: string[] | null
          amount?: number
          auto_assign_on_signup?: boolean
          campaign_slug?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          max_discount_amount?: number | null
          max_uses?: number | null
          min_order_amount?: number
          name?: string
          per_user_limit?: number
          starts_at?: string | null
          type?: string
          updated_at?: string | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_affiliate_id_fkey"
            columns: ["affiliate_id"]
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_sends: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          id: string
          recipient_email: string
          status: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          recipient_email: string
          status?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          recipient_email?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          campaign_slug: string
          created_at: string | null
          html_body: string | null
          id: string
          recipient_count: number | null
          recipient_type: string
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          campaign_slug: string
          created_at?: string | null
          html_body?: string | null
          id?: string
          recipient_count?: number | null
          recipient_type?: string
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          campaign_slug?: string
          created_at?: string | null
          html_body?: string | null
          id?: string
          recipient_count?: number | null
          recipient_type?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          attempts: number | null
          campaign_id: string | null
          created_at: string | null
          error_message: string | null
          from_email: string
          from_name: string
          html_body: string
          id: string
          kind: string
          last_attempt_at: string | null
          recipient_email: string
          sent_at: string | null
          status: string | null
          subject: string
          to_name: string | null
        }
        Insert: {
          attempts?: number | null
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          from_email?: string
          from_name?: string
          html_body: string
          id?: string
          kind?: string
          last_attempt_at?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string | null
          subject: string
          to_name?: string | null
        }
        Update: {
          attempts?: number | null
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          from_email?: string
          from_name?: string
          html_body?: string
          id?: string
          kind?: string
          last_attempt_at?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
          to_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string | null
          id: string
          is_active: boolean | null
          subject: string
          trigger: string
          updated_at: string | null
        }
        Insert: {
          body_html: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject: string
          trigger: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject?: string
          trigger?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_handled: boolean
          message: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_handled?: boolean
          message: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_handled?: boolean
          message?: string
          source?: string | null
        }
        Relationships: []
      }
      free_gift_rules: {
        Row: {
          created_at: string | null
          gift_product_id: string
          id: string
          is_active: boolean | null
          name: string
          quantity_mode: string
          selection_group: string | null
          trigger_category_id: string
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          gift_product_id: string
          id?: string
          is_active?: boolean | null
          name: string
          quantity_mode?: string
          selection_group?: string | null
          trigger_category_id: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          gift_product_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          quantity_mode?: string
          selection_group?: string | null
          trigger_category_id?: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "free_gift_rules_gift_product_id_fkey"
            columns: ["gift_product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_gift_rules_trigger_category_id_fkey"
            columns: ["trigger_category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          category_id: string | null
          content: string | null
          created_at: string | null
          id: string
          slug: string
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          category_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          slug: string
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          category_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          slug?: string
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      marketplace_channels: {
        Row: {
          created_at: string
          id: string
          integration: string
          is_active: boolean
          manage_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          integration?: string
          is_active?: boolean
          manage_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          integration?: string
          is_active?: boolean
          manage_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      member_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: []
      }
      member_tag_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      member_tag_options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          value: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          value: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_tag_options_group_id_fkey"
            columns: ["group_id"]
            referencedRelation: "member_tag_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          order_id: string | null
          sender_role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          order_id?: string | null
          sender_role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          order_id?: string | null
          sender_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string | null
          created_at: string | null
          error_message: string | null
          id: string
          order_id: string | null
          recipient: string | null
          status: string | null
          trigger: string | null
          user_id: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          order_id?: string | null
          recipient?: string | null
          status?: string | null
          trigger?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          order_id?: string | null
          recipient?: string | null
          status?: string | null
          trigger?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_clicks: {
        Row: {
          created_at: string | null
          id: string
          ip_hash: string | null
          opportunity_id: string | null
          referrer: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          opportunity_id?: string | null
          referrer?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          opportunity_id?: string | null
          referrer?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_clicks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            referencedRelation: "partner_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      order_coupons: {
        Row: {
          counted: boolean
          coupon_id: string
          created_at: string
          discount: number
          free_shipping: boolean
          order_id: string
        }
        Insert: {
          counted?: boolean
          coupon_id: string
          created_at?: string
          discount?: number
          free_shipping?: boolean
          order_id: string
        }
        Update: {
          counted?: boolean
          coupon_id?: string
          created_at?: string
          discount?: number
          free_shipping?: boolean
          order_id?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          note: string | null
          order_id: string
          tracking_code: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          tracking_code?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          tracking_code?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          sku: string | null
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity?: number
          sku?: string | null
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          sku?: string | null
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reviews: {
        Row: {
          admin_note: string | null
          comment: string | null
          created_at: string | null
          id: string
          images: string[] | null
          is_approved: boolean | null
          order_id: string | null
          product_id: string | null
          rating_communication: number | null
          rating_quality: number | null
          rating_shipping: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          images?: string[] | null
          is_approved?: boolean | null
          order_id?: string | null
          product_id?: string | null
          rating_communication?: number | null
          rating_quality?: number | null
          rating_shipping?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          images?: string[] | null
          is_approved?: boolean | null
          order_id?: string | null
          product_id?: string | null
          rating_communication?: number | null
          rating_quality?: number | null
          rating_shipping?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_reviews_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reviews_user_id_profiles_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_note: string | null
          affiliate_id: string | null
          auto_expired: boolean
          billing_address: string | null
          closed_at: string | null
          commission_run_id: string | null
          completed_at: string | null
          coupon_discount: number | null
          coupon_id: string | null
          coupons_restored_at: string | null
          created_at: string
          credit_restored: boolean
          credit_used: number
          id: string
          invoice_status: string | null
          is_closed: boolean
          iyzico_conversation_id: string | null
          iyzico_payment_id: string | null
          iyzico_token: string | null
          kargonomi_shipment_id: string | null
          kargonomi_tracking_code: string | null
          order_number: string | null
          payment_method: string | null
          payment_status: string | null
          refund_method: string | null
          refund_status: string | null
          refunded_amount: number | null
          shipment_status: string | null
          shipping_address: string | null
          shipping_cost: number | null
          shipping_method: string | null
          status: string
          stock_reduced_at: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          affiliate_id?: string | null
          auto_expired?: boolean
          billing_address?: string | null
          closed_at?: string | null
          commission_run_id?: string | null
          completed_at?: string | null
          coupon_discount?: number | null
          coupon_id?: string | null
          coupons_restored_at?: string | null
          created_at?: string
          credit_restored?: boolean
          credit_used?: number
          id?: string
          invoice_status?: string | null
          is_closed?: boolean
          iyzico_conversation_id?: string | null
          iyzico_payment_id?: string | null
          iyzico_token?: string | null
          kargonomi_shipment_id?: string | null
          kargonomi_tracking_code?: string | null
          order_number?: string | null
          payment_method?: string | null
          payment_status?: string | null
          refund_method?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          shipment_status?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          status?: string
          stock_reduced_at?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          affiliate_id?: string | null
          auto_expired?: boolean
          billing_address?: string | null
          closed_at?: string | null
          commission_run_id?: string | null
          completed_at?: string | null
          coupon_discount?: number | null
          coupon_id?: string | null
          coupons_restored_at?: string | null
          created_at?: string
          credit_restored?: boolean
          credit_used?: number
          id?: string
          invoice_status?: string | null
          is_closed?: boolean
          iyzico_conversation_id?: string | null
          iyzico_payment_id?: string | null
          iyzico_token?: string | null
          kargonomi_shipment_id?: string | null
          kargonomi_tracking_code?: string | null
          order_number?: string | null
          payment_method?: string | null
          payment_status?: string | null
          refund_method?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          shipment_status?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          status?: string
          stock_reduced_at?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_affiliate_id_fkey"
            columns: ["affiliate_id"]
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_profiles_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_opportunities: {
        Row: {
          allowed_role_slugs: string[] | null
          claim_limit: number
          click_count: number | null
          coupon_id: string | null
          created_at: string | null
          description: string | null
          discount_code: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          kind: string
          partner_name: string
          tier_level: number
          title: string
          updated_at: string | null
          url: string | null
          valid_until: string | null
        }
        Insert: {
          allowed_role_slugs?: string[] | null
          claim_limit?: number
          click_count?: number | null
          coupon_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          kind?: string
          partner_name: string
          tier_level?: number
          title: string
          updated_at?: string | null
          url?: string | null
          valid_until?: string | null
        }
        Update: {
          allowed_role_slugs?: string[] | null
          claim_limit?: number
          click_count?: number | null
          coupon_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          kind?: string
          partner_name?: string
          tier_level?: number
          title?: string
          updated_at?: string | null
          url?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_opportunities_coupon_id_fkey"
            columns: ["coupon_id"]
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          company_name: string
          contact_person: string | null
          created_at: string | null
          id: string
          phone: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          company_name: string
          contact_person?: string | null
          created_at?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_person?: string | null
          created_at?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      popup_config: {
        Row: {
          button_text: string
          button_url: string
          content: string
          cooldown_days: number
          created_at: string | null
          delay_seconds: number
          id: string
          is_active: boolean
          title: string
          updated_at: string | null
        }
        Insert: {
          button_text?: string
          button_url?: string
          content?: string
          cooldown_days?: number
          created_at?: string | null
          delay_seconds?: number
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string | null
        }
        Update: {
          button_text?: string
          button_url?: string
          content?: string
          cooldown_days?: number
          created_at?: string | null
          delay_seconds?: number
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      popup_impressions: {
        Row: {
          id: string
          shown_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          shown_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          shown_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          is_approved: boolean | null
          product_id: string | null
          rating: number | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          product_id?: string | null
          rating?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          product_id?: string | null
          rating?: number | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tag_assignments: {
        Row: {
          id: string
          product_id: string
          tag_option_id: string
        }
        Insert: {
          id?: string
          product_id: string
          tag_option_id: string
        }
        Update: {
          id?: string
          product_id?: string
          tag_option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tag_assignments_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tag_assignments_tag_option_id_fkey"
            columns: ["tag_option_id"]
            referencedRelation: "member_tag_options"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_price: number | null
          created_at: string | null
          id: string
          image_url: string | null
          in_production: number
          is_active: boolean | null
          price: number
          product_id: string | null
          sku: string | null
          stock: number | null
          trendyol_price: number | null
          trendyol_psf: number | null
          updated_at: string | null
          variant_option_id: string | null
        }
        Insert: {
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          in_production?: number
          is_active?: boolean | null
          price: number
          product_id?: string | null
          sku?: string | null
          stock?: number | null
          trendyol_price?: number | null
          trendyol_psf?: number | null
          updated_at?: string | null
          variant_option_id?: string | null
        }
        Update: {
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          in_production?: number
          is_active?: boolean | null
          price?: number
          product_id?: string | null
          sku?: string | null
          stock?: number | null
          trendyol_price?: number | null
          trendyol_psf?: number | null
          updated_at?: string | null
          variant_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_variant_option_id_fkey"
            columns: ["variant_option_id"]
            referencedRelation: "variant_options"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          has_variants: boolean | null
          id: string
          image_url: string | null
          images: string[] | null
          in_production: number
          is_active: boolean
          model_code: string | null
          price: number
          saya_option_id: string | null
          short_description: string | null
          slug: string
          stock: number
          taban_option_id: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          has_variants?: boolean | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          in_production?: number
          is_active?: boolean
          model_code?: string | null
          price?: number
          saya_option_id?: string | null
          short_description?: string | null
          slug: string
          stock?: number
          taban_option_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          has_variants?: boolean | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          in_production?: number
          is_active?: boolean
          model_code?: string | null
          price?: number
          saya_option_id?: string | null
          short_description?: string | null
          slug?: string
          stock?: number
          taban_option_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_saya_option_id_fkey"
            columns: ["saya_option_id"]
            referencedRelation: "variant_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_taban_option_id_fkey"
            columns: ["taban_option_id"]
            referencedRelation: "variant_options"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          district: string | null
          email: string | null
          email_verified: boolean
          email_verified_at: string | null
          email_verify_sent_at: string | null
          email_verify_token: string | null
          first_name: string | null
          id: string
          identity_number: string | null
          last_active_at: string | null
          last_name: string | null
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          district?: string | null
          email?: string | null
          email_verified?: boolean
          email_verified_at?: string | null
          email_verify_sent_at?: string | null
          email_verify_token?: string | null
          first_name?: string | null
          id: string
          identity_number?: string | null
          last_active_at?: string | null
          last_name?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          district?: string | null
          email?: string | null
          email_verified?: boolean
          email_verified_at?: string | null
          email_verify_sent_at?: string | null
          email_verify_token?: string | null
          first_name?: string | null
          id?: string
          identity_number?: string | null
          last_active_at?: string | null
          last_name?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          id: string
          level: number
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          level?: number
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          level?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          address: string | null
          affiliate_default_rate: number
          bank_transfer_enabled: boolean | null
          bank_transfer_info: string | null
          contact_email: string | null
          contact_phone: string | null
          currency: string | null
          ga_measurement_id: string | null
          gmc_brand_default: string | null
          gmc_content_language: string | null
          gmc_default_category: string | null
          gmc_feed_secret: string | null
          gmc_merchant_id: string | null
          gmc_product_condition: string | null
          gmc_target_country: string | null
          id: string
          kargonomi_api_token: string | null
          kargonomi_warehouse_id: string | null
          product_reviews_show_all: boolean
          smtp_from_email: string | null
          smtp_from_name: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          smtp_user: string | null
          store_logo_url: string | null
          store_name: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          affiliate_default_rate?: number
          bank_transfer_enabled?: boolean | null
          bank_transfer_info?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          currency?: string | null
          ga_measurement_id?: string | null
          gmc_brand_default?: string | null
          gmc_content_language?: string | null
          gmc_default_category?: string | null
          gmc_feed_secret?: string | null
          gmc_merchant_id?: string | null
          gmc_product_condition?: string | null
          gmc_target_country?: string | null
          id?: string
          kargonomi_api_token?: string | null
          kargonomi_warehouse_id?: string | null
          product_reviews_show_all?: boolean
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          store_logo_url?: string | null
          store_name?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          affiliate_default_rate?: number
          bank_transfer_enabled?: boolean | null
          bank_transfer_info?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          currency?: string | null
          ga_measurement_id?: string | null
          gmc_brand_default?: string | null
          gmc_content_language?: string | null
          gmc_default_category?: string | null
          gmc_feed_secret?: string | null
          gmc_merchant_id?: string | null
          gmc_product_condition?: string | null
          gmc_target_country?: string | null
          id?: string
          kargonomi_api_token?: string | null
          kargonomi_warehouse_id?: string | null
          product_reviews_show_all?: boolean
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          store_logo_url?: string | null
          store_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      shipping_methods: {
        Row: {
          created_at: string
          description: string | null
          fee: number
          free_over: number | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          fee?: number
          free_over?: number | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          fee?: number
          free_over?: number | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      site_content: {
        Row: {
          id: string
          key: string
          label: string
          page: string
          section: string
          sort_order: number
          type: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          label?: string
          page: string
          section: string
          sort_order?: number
          type?: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          label?: string
          page?: string
          section?: string
          sort_order?: number
          type?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      stock_events: {
        Row: {
          changed_by: string | null
          created_at: string | null
          delta: number | null
          id: string
          new_stock: number | null
          old_stock: number | null
          product_id: string | null
          source: string
          synced: boolean
          variant_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          delta?: number | null
          id?: string
          new_stock?: number | null
          old_stock?: number | null
          product_id?: string | null
          source?: string
          synced?: boolean
          variant_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          delta?: number | null
          id?: string
          new_stock?: number | null
          old_stock?: number | null
          product_id?: string | null
          source?: string
          synced?: boolean
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_events_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_events_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_notifications: {
        Row: {
          contact_id: string | null
          created_at: string | null
          email: string | null
          id: string
          instagram: string | null
          notified_at: string | null
          phone: string | null
          product_id: string
          status: string
          user_id: string | null
          variant_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          notified_at?: string | null
          phone?: string | null
          product_id: string
          status?: string
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          notified_at?: string | null
          phone?: string | null
          product_id?: string
          status?: string
          user_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_notifications_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sync_tasks: {
        Row: {
          barcode: string | null
          channel_id: string
          created_at: string
          done_at: string | null
          done_by: string | null
          id: string
          method: string | null
          note: string | null
          product_id: string | null
          product_title: string | null
          reason: string
          status: string
          target_stock: number
          variant_id: string | null
        }
        Insert: {
          barcode?: string | null
          channel_id: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          product_id?: string | null
          product_title?: string | null
          reason?: string
          status?: string
          target_stock?: number
          variant_id?: string | null
        }
        Update: {
          barcode?: string | null
          channel_id?: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          product_id?: string | null
          product_title?: string | null
          reason?: string
          status?: string
          target_stock?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_sync_tasks_channel_id_fkey"
            columns: ["channel_id"]
            referencedRelation: "marketplace_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_tasks_done_by_fkey"
            columns: ["done_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_tasks_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_tasks_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credit_ledger: {
        Row: {
          affiliate_id: string
          amount: number
          balance_after: number | null
          created_at: string
          id: string
          note: string | null
          order_id: string | null
          period: string | null
          run_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          affiliate_id: string
          amount: number
          balance_after?: number | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          period?: string | null
          run_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          affiliate_id?: string
          amount?: number
          balance_after?: number | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          period?: string | null
          run_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_credit_ledger_affiliate_id_fkey"
            columns: ["affiliate_id"]
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_ledger_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_ledger_run_id_fkey"
            columns: ["run_id"]
            referencedRelation: "affiliate_payout_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_ledger_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_addresses: {
        Row: {
          address_detail: string
          address_name: string
          city: string
          company_name: string | null
          created_at: string | null
          district: string
          first_name: string
          id: string
          is_corporate: boolean
          is_default_billing: boolean | null
          is_default_shipping: boolean | null
          last_name: string
          phone: string
          tax_number: string | null
          tax_office: string | null
          user_id: string | null
        }
        Insert: {
          address_detail: string
          address_name: string
          city: string
          company_name?: string | null
          created_at?: string | null
          district: string
          first_name: string
          id?: string
          is_corporate?: boolean
          is_default_billing?: boolean | null
          is_default_shipping?: boolean | null
          last_name: string
          phone: string
          tax_number?: string | null
          tax_office?: string | null
          user_id?: string | null
        }
        Update: {
          address_detail?: string
          address_name?: string
          city?: string
          company_name?: string | null
          created_at?: string | null
          district?: string
          first_name?: string
          id?: string
          is_corporate?: boolean
          is_default_billing?: boolean | null
          is_default_shipping?: boolean | null
          last_name?: string
          phone?: string
          tax_number?: string | null
          tax_office?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_coupons: {
        Row: {
          added_at: string | null
          coupon_id: string
          id: string
          last_order_id: string | null
          last_used_at: string | null
          max_uses: number | null
          use_count: number
          user_id: string
        }
        Insert: {
          added_at?: string | null
          coupon_id: string
          id?: string
          last_order_id?: string | null
          last_used_at?: string | null
          max_uses?: number | null
          use_count?: number
          user_id: string
        }
        Update: {
          added_at?: string | null
          coupon_id?: string
          id?: string
          last_order_id?: string | null
          last_used_at?: string | null
          max_uses?: number | null
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_coupons_coupon_id_fkey"
            columns: ["coupon_id"]
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tags: {
        Row: {
          assigned_at: string
          id: string
          tag_option_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          tag_option_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          tag_option_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tags_tag_option_id_fkey"
            columns: ["tag_option_id"]
            referencedRelation: "member_tag_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_groups: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      variant_options: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string
          value: string
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          value: string
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_options_group_id_fkey"
            columns: ["group_id"]
            referencedRelation: "variant_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_tag_assignments: {
        Row: {
          id: string
          tag_option_id: string
          variant_id: string
        }
        Insert: {
          id?: string
          tag_option_id: string
          variant_id: string
        }
        Update: {
          id?: string
          tag_option_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_tag_assignments_tag_option_id_fkey"
            columns: ["tag_option_id"]
            referencedRelation: "member_tag_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_tag_assignments_variant_id_fkey"
            columns: ["variant_id"]
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_link_contact_to_member: {
        Args: { p_contact: string; p_user: string }
        Returns: undefined
      }
      admin_merge_duplicate_contacts: { Args: never; Returns: number }
      admin_set_stock: {
        Args: {
          p_new_stock: number
          p_product_id: string
          p_source?: string
          p_variant_id: string
        }
        Returns: Json
      }
      analytics_storage: { Args: never; Returns: Json }
      expire_unpaid_orders: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      link_contacts_for_user: {
        Args: { p_email: string; p_user: string }
        Returns: undefined
      }
      product_hold_info: {
        Args: { p_product_id: string; p_variant_id?: string }
        Returns: Json
      }
      prune_analytics: { Args: never; Returns: Json }
      reduce_order_stock: {
        Args: { p_order_id: string; p_strict?: boolean }
        Returns: Json
      }
      restore_order_stock: { Args: { p_order_id: string }; Returns: Json }
      review_author_names: {
        Args: { p_user_ids: string[] }
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      rollup_analytics_daily: {
        Args: { target_day?: string }
        Returns: undefined
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
    Enums: {},
  },
} as const
