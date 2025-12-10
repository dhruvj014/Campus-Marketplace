/**
 * WebSocket client for real-time chat and notifications
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ' https://campus-marketplace-backend-225981188796.us-central1.run.app'

export class WebSocketClient {
  private ws: WebSocket | null = null
  private userId: number | null = null
  private token: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 2000
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map()
  private isConnecting = false
  private pingInterval: NodeJS.Timeout | null = null

  connect(userId: number, token: string) {
    // Don't reconnect if already connected or connecting
    if (this.isConnecting) {
      console.log('WebSocket connection already in progress');
      return
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return
    }

    // Close existing connection if any
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.userId = userId
    this.token = token
    this.isConnecting = true

    try {
      // Convert http to ws
      const wsUrl = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')
      const url = `${wsUrl}/api/chat/ws/${userId}?token=${encodeURIComponent(token)}`
      console.log('Connecting WebSocket to:', url.replace(token, '***'))
      
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully')
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.startPing()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          console.log('📨 WebSocket message received:', message)
          this.handleMessage(message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error, event.data)
        }
      }

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        this.isConnecting = false
      }

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected, code:', event.code, 'reason:', event.reason)
        this.isConnecting = false
        this.stopPing()
        
        // Handle unauthorized (code 1008) - redirect to login
        if (event.code === 1008) {
          // Clear auth state and redirect
          import('@/store/authStore').then(({ authStore }) => {
            authStore.clearAuth()
            
            // Redirect to login with message
            const loginUrl = `/login?message=${encodeURIComponent('Logged out for security reasons. Please log in again.')}`
            window.location.href = loginUrl
          })
          return
        }
        
        // Don't reconnect if closed intentionally (code 1000) or unauthorized (code 1008)
        if (event.code !== 1000 && event.code !== 1008) {
          this.attemptReconnect()
        }
      }
    } catch (error) {
      console.error('Error connecting WebSocket:', error)
      this.isConnecting = false
    }
  }

  private startPing() {
    // Send ping every 30 seconds to keep connection alive
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping')
      }
    }, 30000)
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.userId && this.token) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 3)
      console.log(`🔄 Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      setTimeout(() => {
        this.connect(this.userId!, this.token!)
      }, delay)
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached. Please refresh the page.')
    }
  }

  private handleMessage(message: any) {
    const { type, data } = message
    console.log(`Handling message type: ${type}`, data)
    const handlers = this.messageHandlers.get(type) || []
    
    if (handlers.length === 0) {
      console.warn(`No handlers registered for message type: ${type}`)
    }
    
    handlers.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        console.error(`Error in message handler for type ${type}:`, error)
      }
    })
  }

  on(event: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, [])
    }
    this.messageHandlers.get(event)!.push(handler)
    console.log(`✅ Registered handler for event: ${event}, total handlers: ${this.messageHandlers.get(event)!.length}`)
  }

  off(event: string, handler: (data: any) => void) {
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  disconnect() {
    console.log('Disconnecting WebSocket')
    this.stopPing()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.userId = null
    this.token = null
    this.messageHandlers.clear()
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

// Singleton instance
export const wsClient = new WebSocketClient()

