export enum UserRole {
  USER = "user",
  ADMIN = "admin"
}

export interface User {
  id: number
  email: string
  username: string
  full_name: string
  phone?: string
  student_id: string
  profile_picture_url?: string
  role: UserRole
  is_active: boolean
  is_verified: boolean
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at?: string
}

export interface TokenUserInfo {
  user_id: number
  username: string
  email: string
  full_name: string
  role: UserRole
  is_verified: boolean
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: TokenUserInfo
}

export interface UserLogin {
  email: string  // Can be email or username
  password: string
}

export interface UserCreate {
  email: string
  username: string
  password: string
  full_name: string
  phone?: string
  student_id: string
  role?: UserRole
}

export interface AuthState {
  user: TokenUserInfo | null
  token: string | null
  isAuthenticated: boolean
}

export enum ItemCategory {
  TEXTBOOKS = "textbooks",
  ELECTRONICS = "electronics",
  FURNITURE = "furniture",
  CLOTHING = "clothing",
  SPORTS_FITNESS = "sports_fitness",
  OTHER = "other"
}

export enum ItemCondition {
  NEW = "new",
  LIKE_NEW = "like_new",
  GOOD = "good",
  FAIR = "fair",
  POOR = "poor"
}

export enum ItemStatus {
  AVAILABLE = "available",
  SOLD = "sold",
  RESERVED = "reserved", // Maps to "on_hold" in UI
  INACTIVE = "inactive", // Maps to "archive" in UI
  REMOVED = "removed", // Soft deleted items
  INCOMPLETE = "incomplete" // Items reported as incomplete
}

export interface Item {
  id: number
  title: string
  description: string
  price: number
  condition: ItemCondition
  status: ItemStatus
  category: ItemCategory
  location?: string
  is_negotiable: boolean
  item_url?: string
  seller_id: number
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at?: string
}

export interface Message {
  id: number
  conversation_id: number
  sender_id: number
  content: string
  is_read: boolean
  read_at?: string
  created_at: string
  sender_username?: string
  sender_full_name?: string
}

export interface Conversation {
  id: number
  user1_id: number
  user2_id: number
  item_id?: number
  last_message_at?: string
  created_at: string
  other_user_id: number
  other_user_username: string
  other_user_full_name: string
  other_user_profile_picture_url?: string
  unread_count: number
  last_message?: Message
  status?: string // "active", "archived" - optional for backward compatibility
  is_sold?: boolean
  is_ended?: boolean
  transaction_id?: number
  transaction?: Transaction // Full transaction data if exists
  pending_offer_price?: number // Price in dollars
  pending_offer_from_user_id?: number
  pending_offer_at?: string
}

export interface Transaction {
  id: number
  item_id: number
  seller_id: number
  buyer_id: number
  conversation_id?: number
  sale_price: number
  original_price?: number
  is_completed: boolean
  completed_at?: string
  notes?: string
  created_at: string
}

export interface TransactionDetail {
  id: number
  item_id: number
  conversation_id?: number
  item_title?: string | null
  seller_id: number
  seller_name?: string | null
  buyer_id: number
  buyer_name?: string | null
  sale_price: number
  completed_at?: string | null
}

export interface TransactionSummary {
  sales: TransactionDetail[]
  purchases: TransactionDetail[]
  sold_items: number
  purchased_items: number
  total_amount_earned: number
  total_amount_spent: number
}

export interface Rating {
  id: number
  transaction_id: number
  rater_id: number
  rated_user_id: number
  rating: number // 1-5
  comment?: string
  created_at: string
}

export interface TransactionCreate {
  sale_price: number
}

export interface RatingCreate {
  transaction_id: number
  rated_user_id: number
  rating: number
  comment?: string
}

export interface UserRatingSummary {
  average_rating: number | null
  rating_count: number
  viewer_rating: number | null
}

export enum NotificationType {
  MESSAGE = "message",
  ITEM_INTEREST = "item_interest",
  ITEM_SOLD = "item_sold",
  SYSTEM = "system"
}

export interface Notification {
  id: number
  user_id: number
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  read_at?: string
  related_item_id?: number
  related_user_id?: number
  related_conversation_id?: number
  created_at: string
}
