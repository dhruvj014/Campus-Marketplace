/**
 * Browser notification utility for new messages
 */

export class BrowserNotifications {
  private static permission: NotificationPermission = 'default';

  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    }

    return false;
  }

  static async showNotification(
    title: string,
    options?: {
      body?: string;
      icon?: string;
      tag?: string;
      data?: any;
      onClick?: () => void;
    }
  ): Promise<void> {
    if (!('Notification' in window)) {
      return;
    }

    // Request permission if not already granted
    if (Notification.permission !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        return;
      }
    }

    try {
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon || '/favicon.ico',
        tag: options?.tag,
        data: options?.data,
        badge: options?.icon || '/favicon.ico',
        requireInteraction: false,
      });

      if (options?.onClick) {
        notification.onclick = () => {
          window.focus();
          options.onClick?.();
          notification.close();
        };
      }

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  static showMessageNotification(
    senderName: string,
    message: string,
    conversationId: number,
    onClickNavigate?: (conversationId: number) => void
  ): void {
    // Only show if page is not focused
    if (document.hasFocus()) {
      return;
    }

    this.showNotification(`New message from ${senderName}`, {
      body: message.length > 100 ? message.substring(0, 97) + '...' : message,
      tag: `message-${conversationId}`,
      data: { conversationId },
      onClick: () => {
        if (onClickNavigate) {
          onClickNavigate(conversationId);
        }
      },
    });
  }

  static isSupported(): boolean {
    return 'Notification' in window;
  }

  static getPermission(): NotificationPermission {
    return Notification.permission;
  }
}



