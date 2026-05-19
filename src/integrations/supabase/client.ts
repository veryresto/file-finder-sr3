import { createClient } from '@supabase/supabase-js';
import type { SupportedStorage } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Parse JWT to extract claims for reconstructing the User object
const parseJwt = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

const getCookieDomain = (): string => {
  const hostname = window.location.hostname;
  if (hostname.endsWith('.localtest.me') || hostname === 'localtest.me') {
    return '.localtest.me';
  }
  if (hostname.endsWith('.veryresto.com') || hostname === 'veryresto.com') {
    return '.veryresto.com';
  }
  return hostname;
};

const isLocalHostOrIP = (hostname: string): boolean => {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
};

class CookieStorage implements SupportedStorage {
  private domain: string;
  private isLocalOrIP: boolean;

  constructor() {
    this.domain = getCookieDomain();
    this.isLocalOrIP = isLocalHostOrIP(this.domain);
    console.log('[CookieStorage] Initialized:', {
      detectedDomain: this.domain,
      isLocalOrIP: this.isLocalOrIP,
    });
  }

  getItem(key: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${key}=`);
    let cookieVal = null;

    if (parts.length === 2) {
      cookieVal = decodeURIComponent(parts.pop()!.split(';').shift()!);
    }

    console.log(`[CookieStorage] getItem(${key}):`, {
      cookieExists: !!cookieVal,
      valueLength: cookieVal ? cookieVal.length : 0,
    });

    if (!cookieVal) return null;

    try {
      const session = JSON.parse(cookieVal);
      // Reconstruct User object from access token JWT claims if missing
      if (session && session.access_token && !session.user) {
        const payload = parseJwt(session.access_token);
        if (payload) {
          session.user = {
            id: payload.sub,
            aud: payload.aud,
            role: payload.role,
            email: payload.email,
            phone: payload.phone,
            app_metadata: payload.app_metadata || {},
            user_metadata: payload.user_metadata || {},
            created_at: payload.created_at || new Date().toISOString(),
          };
          const reconstructedVal = JSON.stringify(session);
          console.log('[CookieStorage] Reconstructed user from JWT claims');
          return reconstructedVal;
        }
      }
    } catch (e) {
      console.error('[CookieStorage] Error parsing cookie value:', e);
    }

    return cookieVal;
  }

  setItem(key: string, value: string): void {
    let valueToStore = value;
    let originalLength = value.length;
    try {
      const session = JSON.parse(value);
      if (session && session.access_token && session.refresh_token) {
        // Strip the large user metadata object to avoid cookie size truncation (4KB limit)
        const minimalSession = {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type || 'bearer',
        };
        valueToStore = JSON.stringify(minimalSession);
      }
    } catch (e) {
      // Use original string if it is not a session JSON
    }

    const d = new Date();
    d.setTime(d.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const expires = `expires=${d.toUTCString()}`;
    const domainAttr = this.isLocalOrIP ? '' : `;domain=${this.domain}`;
    const isSecure = window.location.protocol === 'https:';
    const secureFlag = isSecure ? ';Secure' : '';

    const cookieString = `${key}=${encodeURIComponent(
      valueToStore
    )};${expires}${domainAttr};path=/;SameSite=Lax${secureFlag}`;
    document.cookie = cookieString;

    console.log(`[CookieStorage] setItem(${key}):`, {
      originalLength,
      storedLength: valueToStore.length,
      cookieStringLength: cookieString.length,
      domain: this.domain,
      isSecure,
    });
  }

  removeItem(key: string): void {
    const domainAttr = this.isLocalOrIP ? '' : `;domain=${this.domain}`;
    const isSecure = window.location.protocol === 'https:';
    const secureFlag = isSecure ? ';Secure' : '';

    document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 UTC${domainAttr};path=/;SameSite=Lax${secureFlag}`;
    console.log(`[CookieStorage] removeItem(${key})`);
  }
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'veryresto-auth',
    storage: new CookieStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
});