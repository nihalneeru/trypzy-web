# Auth Flow Comprehensive Fix Plan

## Overview
This document outlines all issues found in the Google OAuth signup/login flow and the plan to fix them.

---

## CRITICAL ISSUES

### 1. Logout doesn't clear NextAuth session
**File:** `components/common/AppHeader.tsx`
**Problem:** Only clears localStorage, NextAuth session cookie persists. Dashboard re-syncs session on next visit.
**Fix:**
```tsx
import { signOut } from 'next-auth/react'

const handleLogout = async () => {
  localStorage.removeItem('tripti_token')
  localStorage.removeItem('tripti_user')
  // Clear the auth mode cookie
  document.cookie = 'tripti_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  // Sign out from NextAuth (clears session cookie)
  await signOut({ redirect: false })
  router.replace('/')
}
```

### 2. JWT callback errors fail silently
**File:** `lib/auth.js`
**Problem:** Catch block only logs, doesn't propagate error. User left in broken state.
**Fix:** Set error indicator in token that session callback can detect:
```javascript
} catch (error) {
  console.error('[Auth] Error in JWT callback:', error)
  token.authError = error.message
}
// In session callback:
if (token.authError) {
  session.error = token.authError
}
```
Then client can check `session.error` and show appropriate message.

### 3. Error query params ignored
**Files:** `app/signup/page.jsx`, `app/login/page.jsx`
**Problem:** Neither page reads `?error=AccountNotFound` or `?error=AccountExists`
**Fix:** Add useSearchParams and show toast on mount:
```jsx
import { useSearchParams } from 'next/navigation'

const searchParams = useSearchParams()

useEffect(() => {
  const error = searchParams.get('error')
  if (error === 'AccountNotFound') {
    toast.error('No account found with that email. Please sign up first.')
  } else if (error === 'AccountExists') {
    toast.error('An account already exists with that email. Please log in.')
  }
}, [searchParams])
```

### 4. Auth mode cookie never cleared
**Files:** `app/signup/page.jsx`, `app/login/page.jsx`, `app/dashboard/page.js`
**Problem:** Cookie persists, causes wrong behavior on subsequent auth attempts
**Fix:** Clear cookie after successful auth in dashboard's session sync:
```javascript
// After syncing session to localStorage
document.cookie = 'tripti_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
```

---

## HIGH SEVERITY

### 5. User cannot switch Google accounts
**Problem:** Logout doesn't clear NextAuth session, so same account auto-selected
**Fix:** Fixed by #1 (signOut clears session)

### 6. Login page missing useSession
**File:** `app/login/page.jsx`
**Problem:** Can't detect OAuth callback state or handle session sync
**Fix:** Add useSession and handle post-OAuth flow like signup page:
```jsx
const { data: session, status } = useSession()

useEffect(() => {
  const storedSecret = sessionStorage.getItem('login_beta_secret')

  if (status === 'authenticated' && session?.accessToken && storedSecret) {
    localStorage.setItem('tripti_token', session.accessToken)
    localStorage.setItem('tripti_user', JSON.stringify({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name
    }))
    sessionStorage.removeItem('login_beta_secret')
    document.cookie = 'tripti_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    router.replace('/dashboard')
  }
}, [session, status, router])
```

### 7. Token expiration mismatch
**File:** `lib/auth.js`
**Problem:** Custom JWT expires in 7 days, NextAuth session default is 30 days
**Fix:** Align them:
```javascript
session: {
  strategy: 'jwt',
  maxAge: 7 * 24 * 60 * 60, // 7 days - match our custom token
},
```

### 8. Google prompt should show account picker explicitly
**File:** `lib/auth.js`
**Problem:** `prompt: 'consent'` may not always show account picker clearly
**Fix:** Use both prompts:
```javascript
authorization: {
  params: {
    prompt: 'select_account consent',
    access_type: 'offline',
    response_type: 'code',
  },
},
```

---

## MEDIUM SEVERITY

### 9. Dead code in jwt callback
**File:** `lib/auth.js` lines 102-116
**Problem:** MongoDBAdapter creates user before jwt callback, so `if (!existingUser)` never true
**Fix:** Remove adapter entirely since we use JWT strategy and manage users ourselves. This simplifies the flow significantly.

Actually, on second thought - removing adapter is a bigger change. For now, just add a comment explaining the flow.

### 10. sessionStorage not cleared on error paths
**Files:** `app/signup/page.jsx`, `app/login/page.jsx`
**Problem:** If OAuth fails, beta secret remains in sessionStorage
**Fix:** Clear on error:
```jsx
} catch (error) {
  sessionStorage.removeItem('signup_beta_secret') // or login_beta_secret
  toast.error(error.message || 'Failed to sign in with Google')
  setGoogleLoading(false)
}
```

### 11. Already authenticated user visiting signup/login
**Files:** `app/signup/page.jsx`, `app/login/page.jsx`
**Problem:** User with valid session visits auth pages - confusing UX
**Fix:** Redirect to dashboard if already authenticated:
```jsx
useEffect(() => {
  if (status === 'authenticated' && session?.accessToken) {
    // User is already logged in, redirect to dashboard
    router.replace('/dashboard')
  }
}, [status, session, router])
```

---

## LOW SEVERITY

### 12. Console logging in production
**File:** `lib/auth.js`
**Fix:** Wrap in development check or use proper logging
```javascript
if (process.env.NODE_ENV === 'development') {
  console.log('[Auth] signIn callback:', {...})
}
```

### 13. No rate limiting on beta secret validation
**File:** `app/api/auth/validate-beta-secret/route.js`
**Fix:** Defer to public launch - add rate limiting with Upstash/Redis

### 14. Loading state stuck if popup blocked
**Files:** `app/signup/page.jsx`, `app/login/page.jsx`
**Problem:** signIn with redirect:true may not return if popup blocked
**Fix:** Add timeout fallback:
```jsx
// Set a timeout to reset loading state
const timeoutId = setTimeout(() => {
  setGoogleLoading(false)
}, 30000) // 30 second timeout

try {
  await signIn('google', { callbackUrl: '/signup', redirect: true })
} catch (error) {
  clearTimeout(timeoutId)
  // ...
}
```

---

## Implementation Order

1. **Critical first:**
   - Fix logout (AppHeader.tsx)
   - Fix error param handling (signup + login pages)
   - Fix cookie clearing (dashboard + logout)
   - Fix JWT error propagation (lib/auth.js)

2. **High severity:**
   - Add useSession to login page
   - Align session/token expiration
   - Update Google prompt params

3. **Medium severity:**
   - Clear sessionStorage on errors
   - Handle already-authenticated users
   - Add explanatory comments

4. **Low severity:**
   - Development-only logging
   - Loading timeout fallback

---

## Testing Checklist

After fixes, test these scenarios:

- [ ] Fresh signup with valid beta secret
- [ ] Fresh signup with invalid beta secret
- [ ] Login with existing account
- [ ] Login with non-existent account (should show error)
- [ ] Signup with existing account (should redirect to login with message)
- [ ] Logout and verify cannot access dashboard
- [ ] Logout and login with DIFFERENT Google account
- [ ] Multiple Google accounts - verify account picker shown
- [ ] Close popup mid-OAuth - verify page recovers
- [ ] Refresh page during OAuth flow
- [ ] Visit /signup while already logged in
- [ ] Visit /login while already logged in
- [ ] Token expiration after 7 days
