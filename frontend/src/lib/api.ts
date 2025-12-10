import { UserLogin, UserCreate, Token, User, Item, UserRatingSummary, TransactionSummary, TokenUserInfo } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('access_token')

  // Check if Authorization header is already provided in options.headers
  const providedHeaders = options.headers as HeadersInit | Record<string, string> | undefined;
  const hasCustomAuth = providedHeaders && (
    (providedHeaders as HeadersInit)['Authorization'] ||
    (providedHeaders as Record<string, string>)['Authorization'] ||
    (providedHeaders as Headers)?.get?.('Authorization')
  )

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  // Add custom headers first
  if (providedHeaders) {
    if (providedHeaders instanceof Headers) {
      providedHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, providedHeaders);
    }
  }

  // Only add Authorization header if not already provided
  if (token && !hasCustomAuth) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      // Handle 401 Unauthorized - redirect to login
      if (response.status === 401) {
        // Clear auth state
        const { authStore } = await import('@/store/authStore')
        authStore.clearAuth()

        // Clear any WebSocket connections
        const { wsClient } = await import('@/lib/websocket')
        wsClient.disconnect()

        // Redirect to login with message
        const loginUrl = `/login?message=${encodeURIComponent('Logged out for security reasons. Please log in again.')}`
        window.location.href = loginUrl
        throw new Error('Unauthorized - redirecting to login')
      }

      const error = await response.json().catch(() => ({ detail: 'An error occurred' }))
      throw new Error(error.detail || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  } catch (error) {
    // Don't handle redirect errors - they're intentional
    if (error instanceof Error && error.message === 'Unauthorized - redirecting to login') {
      throw error
    }

    // Handle network errors (connection refused, CORS, etc.)
    // Only show connection error if it's actually a network error, not a validation error
    if (error instanceof TypeError && error.message.includes('fetch') && !error.message.includes('json')) {
      throw new Error(
        `Cannot connect to backend at ${API_BASE_URL}. Please ensure the backend server is running on port 8000.`
      )
    }
    // Re-throw other errors
    throw error
  }
}

export interface LoginResponse {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  user?: TokenUserInfo
  temp_token?: string
  security_question?: string
  message?: string
  requires_security?: boolean
}

export async function login(credentials: UserLogin): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export interface AdminLoginStep1 {
  username: string
  password: string
}

export interface AdminLoginStep1Response {
  temp_token: string
  security_question: string
  message: string
}

export interface AdminSecurityAnswer {
  answer: string
}

export async function adminLoginStep1(credentials: AdminLoginStep1): Promise<AdminLoginStep1Response> {
  return apiRequest<AdminLoginStep1Response>('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export async function adminLoginStep2(answer: AdminSecurityAnswer, tempToken: string): Promise<Token> {
  // Use fetch directly to avoid apiRequest adding access_token from localStorage
  const response = await fetch(`${API_BASE_URL}/api/auth/admin/verify-security`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tempToken.trim()}`
    },
    body: JSON.stringify(answer),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }))
    throw new Error(error.detail || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export interface SendVerificationCodeRequest {
  email: string
}

export interface VerifyCodeRequest {
  email: string
  code: string
}

export async function sendVerificationCode(data: SendVerificationCodeRequest): Promise<{ message: string; email: string }> {
  return apiRequest<{ message: string; email: string }>('/api/auth/send-verification-code', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function verifyCode(data: VerifyCodeRequest): Promise<{ message: string; verified: boolean }> {
  return apiRequest<{ message: string; verified: boolean }>('/api/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function signup(userData: UserCreate): Promise<User> {
  return apiRequest<User>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(userData),
  })
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', {
      method: 'POST',
    })
  } catch (error) {
    console.error('Logout error:', error)
  } finally {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  }
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest<User>('/api/auth/me')
}

export interface UserUpdate {
  full_name?: string
  phone?: string
}

export async function getProfile(): Promise<User> {
  return apiRequest<User>('/api/users/profile')
}

export async function updateProfile(userData: UserUpdate): Promise<User> {
  return apiRequest<User>('/api/users/profile', {
    method: 'PUT',
    body: JSON.stringify(userData),
  })
}

export interface ItemSearchParams {
  search?: string
  category?: string
  condition?: string
  min_price?: number
  max_price?: number
  status?: string
}

export async function getItems(): Promise<Item[]> {
  return apiRequest<Item[]>('/api/items/')
}

export async function searchItems(params: ItemSearchParams): Promise<Item[]> {
  const queryParams = new URLSearchParams()

  if (params.search) queryParams.append('search', params.search)
  if (params.category) queryParams.append('category', params.category)
  if (params.condition) queryParams.append('condition', params.condition)
  if (params.min_price !== undefined) queryParams.append('min_price', params.min_price.toString())
  if (params.max_price !== undefined) queryParams.append('max_price', params.max_price.toString())
  if (params.status) queryParams.append('status', params.status)

  const queryString = queryParams.toString()
  const endpoint = queryString ? `/api/items/?${queryString}` : '/api/items/'

  return apiRequest<Item[]>(endpoint)
}

export interface AISearchRequest {
  query: string
  context?: {
    product_names?: string[]  // Changed from keywords to product_names
    category?: string
    condition?: string
    min_price?: number
    max_price?: number
  }
  use_semantic_search?: boolean
}

export interface AISearchContext {
  product_names?: string[]
  category?: string
  condition?: string
  min_price?: number
  max_price?: number
}

export async function aiSearchItems(params: AISearchRequest): Promise<{ items: Item[], extractedCriteria?: AISearchContext, filtersRelaxed?: string[], requestedCondition?: string, requestedPrice?: { min_price?: number, max_price?: number }, requestedCategory?: string, extractionMethod?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/items/ai-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('access_token') ? { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } : {}),
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    throw new Error(`AI search failed: ${response.statusText}`)
  }

  const responseText = await response.text()
  console.log('AI Search Raw Response:', responseText)
  console.log('AI Search Response Headers:', Object.fromEntries(response.headers.entries()))

  let items: Item[]
  try {
    items = JSON.parse(responseText)
    console.log('AI Search Parsed Items:', { itemsCount: Array.isArray(items) ? items.length : 'not an array', items })
  } catch (e) {
    console.error('Failed to parse response as JSON:', e, responseText)
    items = []
  }

  // Extract criteria from response headers
  const criteriaHeader = response.headers.get('X-Extracted-Criteria')
  let extractedCriteria: AISearchContext | undefined
  if (criteriaHeader) {
    try {
      extractedCriteria = JSON.parse(criteriaHeader)
      console.log('AI Search Extracted Criteria:', extractedCriteria)
    } catch (e) {
      console.error('Failed to parse extracted criteria from headers:', e)
    }
  }

  // Extract method from response headers
  const extractionMethod = response.headers.get('X-Extraction-Method') || undefined
  console.log('AI Search Extraction Method:', extractionMethod)

  // Check which filters were relaxed
  const filtersRelaxedHeader = response.headers.get('X-Filters-Relaxed')
  let filtersRelaxed: string[] = []
  if (filtersRelaxedHeader) {
    try {
      filtersRelaxed = JSON.parse(filtersRelaxedHeader)
    } catch (e) {
      console.error('Failed to parse filters relaxed:', e)
    }
  }

  const requestedCondition = response.headers.get('X-Requested-Condition')
  const requestedPriceHeader = response.headers.get('X-Requested-Price')
  let requestedPrice: { min_price?: number, max_price?: number } | undefined
  if (requestedPriceHeader) {
    try {
      requestedPrice = JSON.parse(requestedPriceHeader)
    } catch (e) {
      console.error('Failed to parse requested price:', e)
    }
  }
  const requestedCategory = response.headers.get('X-Requested-Category')

  // Ensure items is always an array
  const itemsArray = Array.isArray(items) ? items : []
  console.log('AI Search Final Items Array:', itemsArray.length, 'items', filtersRelaxed.length > 0 ? `(filters relaxed: ${filtersRelaxed.join(', ')})` : '')

  return {
    items: itemsArray,
    extractedCriteria,
    filtersRelaxed: filtersRelaxed.length > 0 ? filtersRelaxed : undefined,
    requestedCondition: requestedCondition || undefined,
    requestedPrice,
    requestedCategory: requestedCategory || undefined,
    extractionMethod
  }
}

export async function getItem(itemId: number): Promise<Item> {
  return apiRequest<Item>(`/api/items/${itemId}`)
}

export async function getMyItems(): Promise<Item[]> {
  return apiRequest<Item[]>('/api/items/my-items')
}

export interface ItemCreate {
  title: string
  description: string
  price: number
  condition: string
  category: string
  location?: string
  is_negotiable?: boolean
  item_url?: string
}

export async function createItem(itemData: ItemCreate): Promise<Item> {
  return apiRequest<Item>('/api/items/', {
    method: 'POST',
    body: JSON.stringify(itemData),
  })
}

export interface ItemUpdate {
  title?: string
  description?: string
  price?: number
  condition?: string
  category?: string
  location?: string
  is_negotiable?: boolean
  status?: string
  item_url?: string
}

export async function updateItem(itemId: number, itemData: ItemUpdate): Promise<Item> {
  return apiRequest<Item>(`/api/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(itemData),
  })
}

export async function deleteItem(itemId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/items/${itemId}`, {
    method: 'DELETE',
  })
}

export async function uploadFile(file: File, folder: string = 'uploads'): Promise<string> {
  const token = localStorage.getItem('access_token')

  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)

  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(error.detail || `Upload error! status: ${response.status}`)
  }

  const result = await response.json()
  // Support both s3_url (S3) and file_url (local storage)
  return result.data.file_url || result.data.s3_url
}

// Admin API functions
export interface AdminStats {
  users: {
    total: number
    active: number
    sellers: number
    recent_registrations: number
  }
  listings: {
    total: number
    active: number
    sold: number
    reserved: number
    recent: number
  }
  category_breakdown: Record<string, number>
  status_breakdown: Record<string, number>
}

export interface Seller extends User {
  listing_count: number
}

export async function getAdminStats(): Promise<AdminStats> {
  return apiRequest<AdminStats>('/api/admin/stats')
}

export interface ReportedItem {
  report_id: number
  item: Item
  reported_at: string
  report_type: string
  description?: string | null
  is_resolved?: boolean
  is_dismissed?: boolean
  resolved_at?: string | null
  item_snapshot?: any
  changes?: Record<string, { old: any; new: any }>
  has_changes?: boolean
  reporter: {
    id: number | null
    username: string
  }
  seller: {
    id: number
    username: string
    email: string
  } | null
}

export async function getReportedItems(includeResolved: boolean = false): Promise<ReportedItem[]> {
  const params = new URLSearchParams()
  if (includeResolved) {
    params.append('include_resolved', 'true')
  }
  return apiRequest<ReportedItem[]>(`/api/admin/reports?${params.toString()}`)
}

export async function markReportFixed(reportId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/items/reports/${reportId}/mark-fixed`, {
    method: 'POST',
  })
}

export async function notifySellerAboutReport(reportId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/items/reports/${reportId}/notify-seller`, {
    method: 'POST',
  })
}

export async function getAllUsers(): Promise<User[]> {
  return apiRequest<User[]>('/api/admin/users')
}

export async function getSellers(): Promise<Seller[]> {
  return apiRequest<Seller[]>('/api/admin/sellers')
}

export async function deleteUser(userId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  })
}

export async function getAllItemsAdmin(status?: string): Promise<Item[]> {
  const params = new URLSearchParams()
  if (status) {
    params.append('status', status)
  }
  const queryString = params.toString()
  return apiRequest<Item[]>(`/api/items/admin/all${queryString ? `?${queryString}` : ''}`)
}

export interface AdminPasswordReset {
  new_password: string
  confirm_password: string
}

export async function resetUserPassword(userId: number, passwordData: AdminPasswordReset): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/admin/users/${userId}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify(passwordData),
  })
}

export interface AdminSecurityAnswerVerify {
  answer: string
}

export async function verifyAdminSecurityAnswer(userId: number, answer: AdminSecurityAnswerVerify): Promise<{ message: string; verified: boolean }> {
  return apiRequest<{ message: string; verified: boolean }>(`/api/admin/users/${userId}/verify-security`, {
    method: 'POST',
    body: JSON.stringify(answer),
  })
}

export interface AdminSecurityAnswerUpdate {
  new_answer: string
  confirm_answer: string
}

export async function updateAdminSecurityAnswer(userId: number, securityData: AdminSecurityAnswerUpdate): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/admin/users/${userId}/update-security-answer`, {
    method: 'PUT',
    body: JSON.stringify(securityData),
  })
}

// Chat API functions
import { Conversation, Message } from '../types'

export interface ConversationCreate {
  user2_id: number
  item_id?: number
}

export interface MessageCreate {
  conversation_id: number
  content: string
}

export async function createConversation(data: ConversationCreate): Promise<Conversation> {
  return apiRequest<Conversation>('/api/chat/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getConversations(includeArchived: boolean = true): Promise<Conversation[]> {
  const params = includeArchived ? '?include_archived=true' : '';
  return apiRequest<Conversation[]>(`/api/chat/conversations${params}`)
}

export async function getMessages(conversationId: number): Promise<Message[]> {
  return apiRequest<Message[]>(`/api/chat/conversations/${conversationId}/messages`)
}

export async function sendMessage(data: MessageCreate): Promise<Message> {
  return apiRequest<Message>('/api/chat/messages', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Notifications API functions
import { Notification } from '../types'

export async function getNotifications(unreadOnly: boolean = false, skip: number = 0, limit: number = 50): Promise<Notification[]> {
  const params = new URLSearchParams()
  if (unreadOnly) params.append('unread_only', 'true')
  params.append('skip', skip.toString())
  params.append('limit', limit.toString())
  return apiRequest<Notification[]>(`/api/notifications/?${params.toString()}`)
}

export async function getUnreadNotificationCount(): Promise<{ unread_count: number }> {
  return apiRequest<{ unread_count: number }>('/api/notifications/unread-count')
}

export async function markNotificationRead(notificationId: number): Promise<Notification> {
  return apiRequest<Notification>(`/api/notifications/${notificationId}/read`, {
    method: 'PUT',
  })
}

export async function markAllNotificationsRead(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/api/notifications/read-all', {
    method: 'PUT',
  })
}

export async function markConversationNotificationsRead(conversationId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/notifications/conversation/${conversationId}/read`, {
    method: 'PUT',
  })
}

export async function deleteNotification(notificationId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/notifications/${notificationId}`, {
    method: 'DELETE',
  })
}

// Chat management functions
export async function archiveConversation(conversationId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/chat/conversations/${conversationId}/archive`, {
    method: 'PUT',
  })
}

export async function unarchiveConversation(conversationId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/chat/conversations/${conversationId}/unarchive`, {
    method: 'PUT',
  })
}

export async function deleteConversation(conversationId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/chat/conversations/${conversationId}`, {
    method: 'DELETE',
  })
}

export async function reportConversation(conversationId: number, reason: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/chat/conversations/${conversationId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

// Transaction and Rating functions
import { Transaction, TransactionCreate, Rating, RatingCreate } from '../types'

export async function sendPurchaseOffer(conversationId: number, data: TransactionCreate): Promise<{ message: string; offer_price: number }> {
  return apiRequest<{ message: string; offer_price: number }>(`/api/chat/conversations/${conversationId}/offer`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function respondToOffer(conversationId: number, response: { action: "accept" | "reject" | "counter"; counter_price?: number }): Promise<Transaction | { message: string; success?: boolean; offer_price?: number }> {
  return apiRequest<Transaction | { message: string }>(`/api/chat/conversations/${conversationId}/respond-offer`, {
    method: 'POST',
    body: JSON.stringify(response),
  })
}

export async function getTransactionRatings(transactionId: number): Promise<{ ratings: Rating[]; has_rated: boolean }> {
  return apiRequest<{ ratings: Rating[]; has_rated: boolean }>(`/api/chat/transactions/${transactionId}/ratings`)
}

export async function rateUser(data: RatingCreate): Promise<Rating> {
  return apiRequest<Rating>(`/api/chat/transactions/${data.transaction_id}/rate`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getUserRatingSummary(userId: number): Promise<UserRatingSummary> {
  return apiRequest<UserRatingSummary>(`/api/chat/users/${userId}/rating-summary`)
}

export async function getTransactionSummary(): Promise<TransactionSummary> {
  return apiRequest<TransactionSummary>('/api/chat/transactions/summary')
}

export async function getReportedConversations(): Promise<any[]> {
  return apiRequest<any[]>('/api/chat/conversations/reported')
}

export async function continueConversation(conversationId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/chat/conversations/${conversationId}/continue`, {
    method: 'PUT',
  })
}

export interface ItemReportData {
  report_type: "incomplete_info" | "no_photos" | "inappropriate" | "other"
  description?: string
}

export async function markItemIncomplete(itemId: number, reportData: ItemReportData): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/items/${itemId}/mark-incomplete`, {
    method: 'POST',
    body: JSON.stringify(reportData),
  })
}

export async function resolveItemReport(reportId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/items/reports/${reportId}/resolve`, {
    method: 'POST',
  })
}

export async function dismissItemReport(reportId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/items/reports/${reportId}/dismiss`, {
    method: 'POST',
  })
}
