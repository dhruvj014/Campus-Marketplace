import { TokenUserInfo } from '../types'

interface AuthStore {
  user: TokenUserInfo | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (token: string, user: TokenUserInfo) => void
  clearAuth: () => void
  initAuth: () => void
}

export const authStore: AuthStore = {
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth(token: string, user: TokenUserInfo) {
    this.token = token
    this.user = user
    this.isAuthenticated = true
    localStorage.setItem('access_token', token)
    localStorage.setItem('user', JSON.stringify(user))
  },

  clearAuth() {
    this.token = null
    this.user = null
    this.isAuthenticated = false
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
  },

  initAuth() {
    const token = localStorage.getItem('access_token')
    const userStr = localStorage.getItem('user')
    
    if (token && userStr) {
      try {
        this.token = token
        this.user = JSON.parse(userStr)
        this.isAuthenticated = true
      } catch (error) {
        console.error('Error parsing user from localStorage:', error)
        this.clearAuth()
      }
    }
  },
}

// Initialize auth state on module load
authStore.initAuth()




