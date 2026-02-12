# Auth Flow Root Cause Analysis

## The Problem
Users who signed up successfully cannot login. They get "Authentication failed" and are redirected to signup. If they try to signup, they correctly see "Account already exists."

## Root Cause: Split Database State

Before PR #141, the MongoDBAdapter was writing to the **default database** from the connection string (`test`), while our custom code was writing to the **configured database** (`tripti` via `DB_NAME`).

**Current state:**
```
test database:
  - accounts: 1 document (OAuth account links)
  - users: 1 document (NextAuth adapter user)

tripti database:
  - accounts: 0 documents ← ADAPTER LOOKS HERE NOW
  - users: 14 documents (our custom users with id field)
```

## Why Login Fails

1. User clicks "Sign in with Google" on login page
2. Cookie `tripti_auth_mode=login` is set
3. OAuth redirect to Google, user selects account
4. NextAuth callback receives OAuth response
5. **signIn callback runs**: finds user in `tripti.users` ✓, returns `true`
6. **MongoDBAdapter runs**: looks for OAuth account in `tripti.accounts`
7. **No account found!** (it's in `test.accounts`)
8. Adapter tries to create new user+account, but user email already exists
9. **Error thrown** → redirects to `/signup?error=...`
10. Signup page shows generic "Authentication failed" message

## Why Signup "Works" (shows correct error)

1. User clicks "Sign up with Google" on signup page
2. Cookie `tripti_auth_mode=signup` is set
3. OAuth redirect, user selects account
4. signIn callback runs: finds user in `tripti.users`, authMode is 'signup'
5. **Returns `/login?error=AccountExists`** before adapter runs
6. User sees correct "Account already exists" message

The key difference: signup's signIn callback returns a redirect BEFORE the adapter runs, so the adapter error never occurs.

## The Architectural Problem

We have **two conflicting user management systems**:

1. **MongoDBAdapter**: NextAuth's built-in adapter that manages:
   - `users` collection (NextAuth schema: `_id, name, email, image, emailVerified`)
   - `accounts` collection (OAuth account links)
   - `sessions` collection (not used with JWT strategy)

2. **Our custom code in jwt callback**: manages:
   - `users` collection (our schema: `id, email, name, googleId, createdAt`)
   - Generates custom JWT tokens for API auth

These two systems are fighting over the same `users` collection with different schemas, and the `accounts` collection was created in the wrong database.

## Solution Options

### Option A: Migrate accounts collection (Quick fix)
- Copy `accounts` from `test` to `tripti` database
- Pros: Minimal code changes
- Cons: Doesn't fix the architectural mess, future issues likely

### Option B: Remove MongoDBAdapter entirely (Recommended)
- Remove the adapter from NextAuth config
- Handle all user management in our callbacks
- Pros: Clean architecture, no more conflicts
- Cons: Need to ensure our callbacks handle all cases

### Option C: Replace our custom code with adapter (Alternative)
- Stop creating users in jwt callback
- Use adapter's user schema everywhere
- Pros: Standard NextAuth pattern
- Cons: Major refactor of API auth, user schema changes

## Recommended Solution: Option B (Remove Adapter)

Since we:
1. Use JWT strategy (not database sessions)
2. Have our own user schema with custom `id` field
3. Generate our own JWT tokens for API auth
4. Already manage user creation/lookup in callbacks

The adapter is just adding complexity and causing conflicts. Remove it.

### Implementation Plan

**Step 1: Remove adapter from NextAuth config**
```javascript
// lib/auth.js
export const authOptions = {
  // adapter: MongoDBAdapter(...),  ← REMOVE THIS
  providers: [...],
  callbacks: {...},
  ...
}
```

**Step 2: Update signIn callback to handle account linking**
```javascript
async signIn({ user, account, profile }) {
  if (account?.provider === 'google') {
    const db = await getDb()

    // Find user by email
    let existingUser = await db.collection('users').findOne({
      email: user.email.toLowerCase()
    })

    // Also check by googleId for returning users
    if (!existingUser) {
      existingUser = await db.collection('users').findOne({
        googleId: account.providerAccountId
      })
    }

    // Auth mode validation
    const authMode = getAuthModeCookie()

    if (authMode === 'login' && !existingUser) {
      return '/signup?error=AccountNotFound'
    }

    if (authMode === 'signup' && existingUser) {
      return '/login?error=AccountExists'
    }

    return true
  }
  return true
}
```

**Step 3: Update jwt callback to always create/update user**
```javascript
async jwt({ token, user, account }) {
  if (account?.provider === 'google' && user) {
    const db = await getDb()

    // Find or create user
    let dbUser = await db.collection('users').findOne({
      $or: [
        { email: user.email.toLowerCase() },
        { googleId: account.providerAccountId }
      ]
    })

    if (!dbUser) {
      // Create new user
      dbUser = {
        id: uuidv4(),
        email: user.email.toLowerCase(),
        name: user.name,
        googleId: account.providerAccountId,
        createdAt: new Date().toISOString(),
      }
      await db.collection('users').insertOne(dbUser)
    } else {
      // Ensure googleId is set (migration for old users)
      if (!dbUser.googleId) {
        await db.collection('users').updateOne(
          { _id: dbUser._id },
          { $set: { googleId: account.providerAccountId } }
        )
      }
      // Ensure custom id exists
      if (!dbUser.id) {
        const newId = uuidv4()
        await db.collection('users').updateOne(
          { _id: dbUser._id },
          { $set: { id: newId } }
        )
        dbUser.id = newId
      }
    }

    token.userId = dbUser.id
    token.email = dbUser.email
    token.name = dbUser.name
    token.customToken = jwt.sign({ userId: dbUser.id }, JWT_SECRET, { expiresIn: '7d' })
  }
  return token
}
```

**Step 4: Add googleId index for efficient lookups**
```javascript
// One-time migration
db.collection('users').createIndex({ googleId: 1 }, { sparse: true })
```

**Step 5: Migrate existing users to have googleId**
```javascript
// Script: migrate-add-googleId.js
// For users who don't have googleId, we can't automatically add it
// They'll need to re-authenticate, which will add it
```

### Testing Checklist
- [ ] New user signup
- [ ] New user login (should fail with AccountNotFound)
- [ ] Existing user login
- [ ] Existing user signup (should fail with AccountExists)
- [ ] User with multiple Google accounts
- [ ] Logout and login with different account
- [ ] Token expiration and refresh

### Rollback Plan
If issues occur, re-add the adapter and migrate accounts collection as a temporary fix:
```javascript
// Migrate accounts from test to tripti
db.getSiblingDB('test').accounts.find().forEach(doc => {
  db.getSiblingDB('tripti').accounts.insertOne(doc)
})
```
