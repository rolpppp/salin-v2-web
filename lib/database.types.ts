export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      accounts: {
        Row: {
          accountType: number
          color: string | null
          createdAt: number
          currency: string
          deletedAt: number | null
          displayOrder: number
          icon: string
          id: string
          isArchived: boolean
          name: string
          openingBalanceMinor: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          accountType: number
          color?: string | null
          createdAt: number
          currency: string
          deletedAt?: number | null
          displayOrder: number
          icon: string
          id: string
          isArchived: boolean
          name: string
          openingBalanceMinor: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Update: {
          accountType?: number
          color?: string | null
          createdAt?: number
          currency?: string
          deletedAt?: number | null
          displayOrder?: number
          icon?: string
          id?: string
          isArchived?: boolean
          name?: string
          openingBalanceMinor?: number
          syncStatus?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      allocation_plan_lines: {
        Row: {
          bucketId: string
          createdAt: number
          deletedAt: number | null
          id: string
          percentBp: number
          planId: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          bucketId: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          percentBp: number
          planId: string
          updatedAt?: number
          user_id?: string
        }
        Update: {
          bucketId?: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          percentBp?: number
          planId?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_plan_lines_bucketId_fkey"
            columns: ["bucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_plan_lines_planId_fkey"
            columns: ["planId"]
            isOneToOne: false
            referencedRelation: "allocation_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_plans: {
        Row: {
          createdAt: number
          deletedAt: number | null
          id: string
          key: string
          name: string
          priority: string | null
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt?: number
          deletedAt?: number | null
          id?: string
          key: string
          name: string
          priority?: string | null
          updatedAt?: number
          user_id?: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          id?: string
          key?: string
          name?: string
          priority?: string | null
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      allocation_rules: {
        Row: {
          createdAt: number
          deletedAt: number | null
          id: string
          kind: string
          params: Json
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt?: number
          deletedAt?: number | null
          id?: string
          kind: string
          params?: Json
          updatedAt?: number
          user_id?: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          id?: string
          kind?: string
          params?: Json
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      allocations: {
        Row: {
          amountMinor: number
          bucketId: string
          confirmedAt: number
          createdAt: number
          deletedAt: number | null
          destAccountId: string | null
          id: string
          ledgerEntryId: string | null
          percentBp: number | null
          planKey: string | null
          ruleTrace: Json
          seq: number
          transferCycleId: string | null
          updatedAt: number
          user_id: string
        }
        Insert: {
          amountMinor: number
          bucketId: string
          confirmedAt?: number
          createdAt?: number
          deletedAt?: number | null
          destAccountId?: string | null
          id?: string
          ledgerEntryId?: string | null
          percentBp?: number | null
          planKey?: string | null
          ruleTrace?: Json
          seq?: never
          transferCycleId?: string | null
          updatedAt?: number
          user_id?: string
        }
        Update: {
          amountMinor?: number
          bucketId?: string
          confirmedAt?: number
          createdAt?: number
          deletedAt?: number | null
          destAccountId?: string | null
          id?: string
          ledgerEntryId?: string | null
          percentBp?: number | null
          planKey?: string | null
          ruleTrace?: Json
          seq?: never
          transferCycleId?: string | null
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_bucketId_fkey"
            columns: ["bucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_destAccountId_fkey"
            columns: ["destAccountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_ledgerEntryId_fkey"
            columns: ["ledgerEntryId"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_transferCycleId_fkey"
            columns: ["transferCycleId"]
            isOneToOne: false
            referencedRelation: "transfer_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          data: string
          name: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          data: string
          name: string
          updatedAt: number
          user_id: string
        }
        Update: {
          data?: string
          name?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      bucket_covers: {
        Row: {
          amountMinor: number
          createdAt: number
          deletedAt: number | null
          fromBucketId: string
          id: string
          note: string | null
          occurredAt: number
          toBucketId: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          amountMinor: number
          createdAt?: number
          deletedAt?: number | null
          fromBucketId: string
          id?: string
          note?: string | null
          occurredAt?: number
          toBucketId: string
          updatedAt?: number
          user_id?: string
        }
        Update: {
          amountMinor?: number
          createdAt?: number
          deletedAt?: number | null
          fromBucketId?: string
          id?: string
          note?: string | null
          occurredAt?: number
          toBucketId?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bucket_covers_fromBucketId_fkey"
            columns: ["fromBucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_covers_toBucketId_fkey"
            columns: ["toBucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      buckets: {
        Row: {
          createdAt: number
          deletedAt: number | null
          displayOrder: number
          groupKey: string
          hue: string | null
          id: string
          isArchived: boolean
          keptInAccountId: string | null
          name: string
          note: string | null
          planless: boolean
          shortName: string | null
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt?: number
          deletedAt?: number | null
          displayOrder?: number
          groupKey: string
          hue?: string | null
          id?: string
          isArchived?: boolean
          keptInAccountId?: string | null
          name: string
          note?: string | null
          planless?: boolean
          shortName?: string | null
          updatedAt?: number
          user_id?: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          displayOrder?: number
          groupKey?: string
          hue?: string | null
          id?: string
          isArchived?: boolean
          keptInAccountId?: string | null
          name?: string
          note?: string | null
          planless?: boolean
          shortName?: string | null
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buckets_keptInAccountId_fkey"
            columns: ["keptInAccountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_categories: {
        Row: {
          budgetId: string
          categoryId: string
          createdAt: number
          id: string
          limitMinor: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          budgetId: string
          categoryId: string
          createdAt: number
          id: string
          limitMinor: number
          updatedAt: number
          user_id: string
        }
        Update: {
          budgetId?: string
          categoryId?: string
          createdAt?: number
          id?: string
          limitMinor?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_budgetId_fkey"
            columns: ["budgetId"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_categories_categoryId_fkey"
            columns: ["categoryId"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          createdAt: number
          deletedAt: number | null
          endDate: number
          id: string
          limitMinor: number | null
          name: string
          period: number
          rolloverEnabled: boolean
          startDate: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt: number
          deletedAt?: number | null
          endDate: number
          id: string
          limitMinor?: number | null
          name: string
          period: number
          rolloverEnabled: boolean
          startDate: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          endDate?: number
          id?: string
          limitMinor?: number | null
          name?: string
          period?: number
          rolloverEnabled?: boolean
          startDate?: number
          syncStatus?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          categoryType: number
          color: string
          createdAt: number
          deletedAt: number | null
          displayOrder: number
          icon: string
          id: string
          isSystem: boolean
          name: string
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          categoryType: number
          color: string
          createdAt: number
          deletedAt?: number | null
          displayOrder: number
          icon: string
          id: string
          isSystem: boolean
          name: string
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Update: {
          categoryType?: number
          color?: string
          createdAt?: number
          deletedAt?: number | null
          displayOrder?: number
          icon?: string
          id?: string
          isSystem?: boolean
          name?: string
          syncStatus?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      category_buckets: {
        Row: {
          bucketId: string
          categoryId: string
          createdAt: number
          deletedAt: number | null
          id: string
          source: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          bucketId: string
          categoryId: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          source?: string
          updatedAt?: number
          user_id?: string
        }
        Update: {
          bucketId?: string
          categoryId?: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          source?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_buckets_bucketId_fkey"
            columns: ["bucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_buckets_categoryId_fkey"
            columns: ["categoryId"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatarPath: string | null
          createdAt: number
          deletedAt: number | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          avatarPath?: string | null
          createdAt: number
          deletedAt?: number | null
          email?: string | null
          id: string
          name: string
          notes?: string | null
          phone?: string | null
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Update: {
          avatarPath?: string | null
          createdAt?: number
          deletedAt?: number | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          syncStatus?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          contactId: string
          createdAt: number
          deletedAt: number | null
          dueDate: number | null
          id: string
          note: string | null
          originLedgerEntryId: string | null
          principalMinor: number
          status: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          contactId: string
          createdAt: number
          deletedAt?: number | null
          dueDate?: number | null
          id: string
          note?: string | null
          originLedgerEntryId?: string | null
          principalMinor: number
          status: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Update: {
          contactId?: string
          createdAt?: number
          deletedAt?: number | null
          dueDate?: number | null
          id?: string
          note?: string | null
          originLedgerEntryId?: string | null
          principalMinor?: number
          status?: number
          syncStatus?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_contactId_fkey"
            columns: ["contactId"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_origin_ledger_entry"
            columns: ["originLedgerEntryId"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_buckets: {
        Row: {
          bucketId: string
          createdAt: number
          deletedAt: number | null
          id: string
          ledgerEntryId: string
          source: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          bucketId: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          ledgerEntryId: string
          source?: string
          updatedAt?: number
          user_id?: string
        }
        Update: {
          bucketId?: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          ledgerEntryId?: string
          source?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_buckets_bucketId_fkey"
            columns: ["bucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_buckets_ledgerEntryId_fkey"
            columns: ["ledgerEntryId"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          id: string
          name: string
          occurredAt: number
          props: Json
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          occurredAt?: number
          props?: Json
          user_id?: string
        }
        Update: {
          id?: string
          name?: string
          occurredAt?: number
          props?: Json
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          createdAt: number
          currency: string
          deletedAt: number | null
          dueDate: string | null
          id: string
          isArchived: boolean
          isPlanSwitch: boolean
          linkedBucketId: string | null
          linkedShareBp: number
          name: string
          targetMinor: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt?: number
          currency?: string
          deletedAt?: number | null
          dueDate?: string | null
          id?: string
          isArchived?: boolean
          isPlanSwitch?: boolean
          linkedBucketId?: string | null
          linkedShareBp?: number
          name: string
          targetMinor: number
          updatedAt?: number
          user_id?: string
        }
        Update: {
          createdAt?: number
          currency?: string
          deletedAt?: number | null
          dueDate?: string | null
          id?: string
          isArchived?: boolean
          isPlanSwitch?: boolean
          linkedBucketId?: string | null
          linkedShareBp?: number
          name?: string
          targetMinor?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_linkedBucketId_fkey"
            columns: ["linkedBucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      income_meta: {
        Row: {
          createdAt: number
          deletedAt: number | null
          id: string
          job: string | null
          ledgerEntryId: string
          oneBucketId: string | null
          sentCurrency: string | null
          sentMinor: number | null
          sourceId: string | null
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt?: number
          deletedAt?: number | null
          id?: string
          job?: string | null
          ledgerEntryId: string
          oneBucketId?: string | null
          sentCurrency?: string | null
          sentMinor?: number | null
          sourceId?: string | null
          updatedAt?: number
          user_id?: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          id?: string
          job?: string | null
          ledgerEntryId?: string
          oneBucketId?: string | null
          sentCurrency?: string | null
          sentMinor?: number | null
          sourceId?: string | null
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_meta_ledgerEntryId_fkey"
            columns: ["ledgerEntryId"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_meta_oneBucketId_fkey"
            columns: ["oneBucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_meta_sourceId_fkey"
            columns: ["sourceId"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      income_source_split_lines: {
        Row: {
          bucketId: string
          createdAt: number
          deletedAt: number | null
          id: string
          percentBp: number
          sourceId: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          bucketId: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          percentBp: number
          sourceId: string
          updatedAt?: number
          user_id?: string
        }
        Update: {
          bucketId?: string
          createdAt?: number
          deletedAt?: number | null
          id?: string
          percentBp?: number
          sourceId?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_source_split_lines_bucketId_fkey"
            columns: ["bucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_source_split_lines_sourceId_fkey"
            columns: ["sourceId"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      income_sources: {
        Row: {
          categoryId: string | null
          createdAt: number
          deletedAt: number | null
          id: string
          isArchived: boolean
          kind: string
          landsInAccountId: string | null
          name: string
          rule: string
          updatedAt: number
          user_id: string
          wholeBucketId: string | null
        }
        Insert: {
          categoryId?: string | null
          createdAt?: number
          deletedAt?: number | null
          id?: string
          isArchived?: boolean
          kind?: string
          landsInAccountId?: string | null
          name: string
          rule?: string
          updatedAt?: number
          user_id?: string
          wholeBucketId?: string | null
        }
        Update: {
          categoryId?: string | null
          createdAt?: number
          deletedAt?: number | null
          id?: string
          isArchived?: boolean
          kind?: string
          landsInAccountId?: string | null
          name?: string
          rule?: string
          updatedAt?: number
          user_id?: string
          wholeBucketId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_sources_categoryId_fkey"
            columns: ["categoryId"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_sources_landsInAccountId_fkey"
            columns: ["landsInAccountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_sources_wholeBucketId_fkey"
            columns: ["wholeBucketId"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          accountId: string
          amountMinor: number
          categoryId: string | null
          createdAt: number
          debtId: string | null
          deletedAt: number | null
          direction: number
          id: string
          metadataJson: string | null
          note: string | null
          occurredAt: number
          origin: number
          recurringInstanceId: string | null
          splitId: string | null
          syncStatus: number
          transferId: string | null
          updatedAt: number
          user_id: string
        }
        Insert: {
          accountId: string
          amountMinor: number
          categoryId?: string | null
          createdAt: number
          debtId?: string | null
          deletedAt?: number | null
          direction: number
          id: string
          metadataJson?: string | null
          note?: string | null
          occurredAt: number
          origin: number
          recurringInstanceId?: string | null
          splitId?: string | null
          syncStatus: number
          transferId?: string | null
          updatedAt: number
          user_id: string
        }
        Update: {
          accountId?: string
          amountMinor?: number
          categoryId?: string | null
          createdAt?: number
          debtId?: string | null
          deletedAt?: number | null
          direction?: number
          id?: string
          metadataJson?: string | null
          note?: string | null
          occurredAt?: number
          origin?: number
          recurringInstanceId?: string | null
          splitId?: string | null
          syncStatus?: number
          transferId?: string | null
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_accountId_fkey"
            columns: ["accountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_categoryId_fkey"
            columns: ["categoryId"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_debtId_fkey"
            columns: ["debtId"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_recurringInstanceId_fkey"
            columns: ["recurringInstanceId"]
            isOneToOne: false
            referencedRelation: "recurring_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_splitId_fkey"
            columns: ["splitId"]
            isOneToOne: false
            referencedRelation: "splits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transferId_fkey"
            columns: ["transferId"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          createdAt: number
          id: string
          ledgerEntryId: string
          mimeType: string
          path: string
          sizeBytes: number
          user_id: string
        }
        Insert: {
          createdAt: number
          id: string
          ledgerEntryId: string
          mimeType: string
          path: string
          sizeBytes: number
          user_id: string
        }
        Update: {
          createdAt?: number
          id?: string
          ledgerEntryId?: string
          mimeType?: string
          path?: string
          sizeBytes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_ledgerEntryId_fkey"
            columns: ["ledgerEntryId"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_instances: {
        Row: {
          createdAt: number
          id: string
          ledgerEntryId: string | null
          recurringRuleId: string
          scheduledDate: number
          status: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt: number
          id: string
          ledgerEntryId?: string | null
          recurringRuleId: string
          scheduledDate: number
          status: number
          syncStatus: number
          updatedAt: number
          user_id: string
        }
        Update: {
          createdAt?: number
          id?: string
          ledgerEntryId?: string | null
          recurringRuleId?: string
          scheduledDate?: number
          status?: number
          syncStatus?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ledger_entry"
            columns: ["ledgerEntryId"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_instances_recurringRuleId_fkey"
            columns: ["recurringRuleId"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_rules: {
        Row: {
          accountId: string
          amountMinor: number
          autoGenerate: boolean
          categoryId: string | null
          createdAt: number
          deletedAt: number | null
          direction: number
          endDate: number | null
          frequency: number
          id: string
          interval: number
          note: string | null
          startDate: number
          syncStatus: number
          title: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          accountId: string
          amountMinor: number
          autoGenerate: boolean
          categoryId?: string | null
          createdAt: number
          deletedAt?: number | null
          direction: number
          endDate?: number | null
          frequency: number
          id: string
          interval: number
          note?: string | null
          startDate: number
          syncStatus: number
          title: string
          updatedAt: number
          user_id: string
        }
        Update: {
          accountId?: string
          amountMinor?: number
          autoGenerate?: boolean
          categoryId?: string | null
          createdAt?: number
          deletedAt?: number | null
          direction?: number
          endDate?: number | null
          frequency?: number
          id?: string
          interval?: number
          note?: string | null
          startDate?: number
          syncStatus?: number
          title?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_accountId_fkey"
            columns: ["accountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_categoryId_fkey"
            columns: ["categoryId"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      split_participants: {
        Row: {
          contactId: string
          createdAt: number
          id: string
          shareMinor: number
          splitId: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          contactId: string
          createdAt: number
          id: string
          shareMinor: number
          splitId: string
          updatedAt: number
          user_id: string
        }
        Update: {
          contactId?: string
          createdAt?: number
          id?: string
          shareMinor?: number
          splitId?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_participants_contactId_fkey"
            columns: ["contactId"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_participants_splitId_fkey"
            columns: ["splitId"]
            isOneToOne: false
            referencedRelation: "splits"
            referencedColumns: ["id"]
          },
        ]
      }
      splits: {
        Row: {
          createdAt: number
          deletedAt: number | null
          id: string
          note: string | null
          originLedgerEntryId: string | null
          status: number
          syncStatus: number
          title: string
          totalMinor: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt: number
          deletedAt?: number | null
          id: string
          note?: string | null
          originLedgerEntryId?: string | null
          status: number
          syncStatus: number
          title: string
          totalMinor: number
          updatedAt: number
          user_id: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          id?: string
          note?: string | null
          originLedgerEntryId?: string | null
          status?: number
          syncStatus?: number
          title?: string
          totalMinor?: number
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_origin_ledger_entry"
            columns: ["originLedgerEntryId"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_checks: {
        Row: {
          createdAt: number
          deletedAt: number | null
          fromAccountId: string
          id: string
          periodKey: string
          sentMinor: number
          toAccountId: string
          transferId: string | null
          transferIds: string[]
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt?: number
          deletedAt?: number | null
          fromAccountId: string
          id?: string
          periodKey: string
          sentMinor: number
          toAccountId: string
          transferId?: string | null
          transferIds?: string[]
          updatedAt?: number
          user_id?: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          fromAccountId?: string
          id?: string
          periodKey?: string
          sentMinor?: number
          toAccountId?: string
          transferId?: string | null
          transferIds?: string[]
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_checks_fromAccountId_fkey"
            columns: ["fromAccountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_checks_toAccountId_fkey"
            columns: ["toAccountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_checks_transferId_fkey"
            columns: ["transferId"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_cycles: {
        Row: {
          closedAt: number | null
          createdAt: number
          deletedAt: number | null
          id: string
          openedAt: number
          seq: number
          updatedAt: number
          user_id: string
        }
        Insert: {
          closedAt?: number | null
          createdAt?: number
          deletedAt?: number | null
          id?: string
          openedAt?: number
          seq?: never
          updatedAt?: number
          user_id?: string
        }
        Update: {
          closedAt?: number | null
          createdAt?: number
          deletedAt?: number | null
          id?: string
          openedAt?: number
          seq?: never
          updatedAt?: number
          user_id?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          createdAt: number
          deletedAt: number | null
          fromAccountId: string
          id: string
          note: string | null
          syncStatus: number
          toAccountId: string
          updatedAt: number
          user_id: string
        }
        Insert: {
          createdAt: number
          deletedAt?: number | null
          fromAccountId: string
          id: string
          note?: string | null
          syncStatus: number
          toAccountId: string
          updatedAt: number
          user_id: string
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          fromAccountId?: string
          id?: string
          note?: string | null
          syncStatus?: number
          toAccountId?: string
          updatedAt?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_fromAccountId_fkey"
            columns: ["fromAccountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_toAccountId_fkey"
            columns: ["toAccountId"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          createdAt: number
          deletedAt: number | null
          firstName: string | null
          homeCurrency: string
          nextPaydayDate: string | null
          onboardedAt: number | null
          onboardingDraft: Json
          onboardingPath: string | null
          paydayReminder: string
          payFrequency: string | null
          planMode: string
          priority: string | null
          reviewDay: number
          updatedAt: number
          user_id: string
          weekStartsOn: number
        }
        Insert: {
          createdAt?: number
          deletedAt?: number | null
          firstName?: string | null
          homeCurrency?: string
          nextPaydayDate?: string | null
          onboardedAt?: number | null
          onboardingDraft?: Json
          onboardingPath?: string | null
          paydayReminder?: string
          payFrequency?: string | null
          planMode?: string
          priority?: string | null
          reviewDay?: number
          updatedAt?: number
          user_id?: string
          weekStartsOn?: number
        }
        Update: {
          createdAt?: number
          deletedAt?: number | null
          firstName?: string | null
          homeCurrency?: string
          nextPaydayDate?: string | null
          onboardedAt?: number | null
          onboardingDraft?: Json
          onboardingPath?: string | null
          paydayReminder?: string
          payFrequency?: string | null
          planMode?: string
          priority?: string | null
          reviewDay?: number
          updatedAt?: number
          user_id?: string
          weekStartsOn?: number
        }
        Relationships: []
      }
      week_reviews: {
        Row: {
          checks: Json
          closedAt: number
          createdAt: number
          deletedAt: number | null
          id: string
          observation: string | null
          safeToSpendMinor: number
          updatedAt: number
          user_id: string
          weekStart: string
        }
        Insert: {
          checks?: Json
          closedAt?: number
          createdAt?: number
          deletedAt?: number | null
          id?: string
          observation?: string | null
          safeToSpendMinor?: number
          updatedAt?: number
          user_id?: string
          weekStart: string
        }
        Update: {
          checks?: Json
          closedAt?: number
          createdAt?: number
          deletedAt?: number | null
          id?: string
          observation?: string | null
          safeToSpendMinor?: number
          updatedAt?: number
          user_id?: string
          weekStart?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_should_hold: {
        Args: { p_user?: string }
        Returns: {
          account_id: string
          allocated_here: number
          bucket_kept_here: boolean
          buckets_net: number
          currency: string
          should_hold: number
        }[]
      }
      active_plan: { Args: { p_user?: string }; Returns: string }
      assert_self: { Args: { p_user: string }; Returns: string }
      backfill_entry_buckets: { Args: { p_user?: string }; Returns: number }
      bucket_left: {
        Args: { p_user?: string }
        Returns: {
          allocated: number
          bucket_id: string
          covers_in: number
          covers_out: number
          left_minor: number
          spent: number
        }[]
      }
      confirm_incomes: {
        Args: { entry_ids: string[] }
        Returns: {
          amountMinor: number
          bucketId: string
          confirmedAt: number
          createdAt: number
          deletedAt: number | null
          destAccountId: string | null
          id: string
          ledgerEntryId: string | null
          percentBp: number | null
          planKey: string | null
          ruleTrace: Json
          seq: number
          transferCycleId: string | null
          updatedAt: number
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "allocations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cover_bucket: {
        Args: { p_amount: number; p_from: string; p_to: string }
        Returns: string
      }
      engine_account_should_hold: {
        Args: { p_user: string }
        Returns: {
          account_id: string
          allocated_here: number
          bucket_kept_here: boolean
          buckets_net: number
          currency: string
          should_hold: number
        }[]
      }
      engine_apply_remainder: {
        Args: {
          p_bps: number[]
          p_rem: number
          p_shares: number[]
          p_target: number
        }
        Returns: number[]
      }
      engine_bp_share: {
        Args: { p_amount: number; p_bp: number }
        Returns: number
      }
      engine_bucket_left: {
        Args: { p_user: string }
        Returns: {
          allocated: number
          bucket_id: string
          covers_in: number
          covers_out: number
          left_minor: number
          spent: number
        }[]
      }
      engine_emergency_bucket: { Args: { p_user: string }; Returns: string }
      engine_latest_cycle: { Args: { p_user: string }; Returns: string }
      engine_plan_measure: {
        Args: { p_bucket: string; p_user: string }
        Returns: number
      }
      engine_rent_bucket: { Args: { p_user: string }; Returns: string }
      engine_split_own: {
        Args: { p_amount: number; p_source_id: string; p_user: string }
        Returns: {
          amount: number
          bucket_id: string
          percent_bp: number
        }[]
      }
      engine_split_plan: {
        Args: {
          p_amount: number
          p_on_date: string
          p_plan_key: string
          p_user: string
        }
        Returns: {
          amount: number
          bucket_id: string
          percent_bp: number
        }[]
      }
      engine_transfer_plan: {
        Args: { p_cycle: string; p_user: string }
        Returns: {
          amount: number
          bucket_ids: string[]
          cycle_id: string
          done: boolean
          from_account_id: string
          kind: string
          netted: number
          send_more: number
          sent: number
          status: string
          to_account_id: string
        }[]
      }
      entry_local_date: { Args: { p_ms: number }; Returns: string }
      now_ms: { Args: never; Returns: number }
      split_by_plan: {
        Args: { p_amount: number; p_on_date: string; p_plan_key: string }
        Returns: {
          amount: number
          bucket_id: string
          percent_bp: number
        }[]
      }
      split_own: {
        Args: { p_amount: number; p_source_id: string }
        Returns: {
          amount: number
          bucket_id: string
          percent_bp: number
        }[]
      }
      tick_transfer: {
        Args: { p_amount: number; p_from: string; p_to: string }
        Returns: string
      }
      transfer_plan: {
        Args: { p_user?: string }
        Returns: {
          amount: number
          bucket_ids: string[]
          cycle_id: string
          done: boolean
          from_account_id: string
          kind: string
          netted: number
          send_more: number
          sent: number
          status: string
          to_account_id: string
        }[]
      }
      untick_transfer: {
        Args: { p_from: string; p_to: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

