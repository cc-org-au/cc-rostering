# Authentication & Role-Based Access Control Implementation

## Summary

This document outlines the complete authentication system with role-based access control (RBAC) implemented for the Roster Manager application.

## Key Features

### 1. **Authentication System**
- Supabase Auth integration with email/password flow
- Session management with automatic 30-minute inactivity timeout
- Password reset/recovery flow
- "Remember me" checkbox on login
- Account signup with role assignment on first user (admin role)

### 2. **User Roles**
- **Admin** (👑): Full system access, user management, audit logs
- **Manager** (📋): Create/edit projects, rosters, view reports
- **Dispatcher** (📦): Read-only roster view, schedule management
- **Employee** (👤): View own assignments, submit availability changes

### 3. **User Profile & Settings**
- Edit full name and profile information
- Change password with current password verification
- Email notification preferences (SMS extensible)
- Recent activity audit log (personal or all admins)

### 4. **User Management (Admin Only)**
- Invite users via email with role selection
- View all users and their roles
- Update user roles
- Deactivate users (removes access)
- View complete audit logs of all system actions

### 5. **Security & Authorization**
- Row-Level Security (RLS) on all tables
- Policy-based access control:
  - Users can view/edit their own profile
  - Admins can view/edit all users and audit logs
- JWT-based session tokens (handled by Supabase)
- No hardcoded credentials or passwords
- Audit trail logging for all authentication events

## Database Schema Changes

### New Tables

#### `app_users`
```sql
CREATE TABLE app_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'dispatcher', 'employee')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### `auth_audit_logs`
```sql
CREATE TABLE auth_audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### RLS Policies
- Users can view/update their own profile
- Admins can view/update all user profiles
- Users can view their own audit logs
- Admins can view all audit logs

## New Files Created

### Core Authentication
- **`lib/useAuth.js`** — `useAuth()` hook and `AuthProvider` context
  - Session management
  - Login/signup/logout functions
  - Password management
  - User profile updates
  - Admin functions (invite, deactivate, etc.)
  - Permission helper methods
  - Audit logging

### Components
- **`app/components/AuthScreen.jsx`** — Authentication UI
  - Login form
  - Signup form with role selection (admin only for first user)
  - Password reset flow
  - Invite completion flow
  - "Remember me" checkbox
  
- **`app/components/UserMenu.jsx`** — User profile menu
  - Display user avatar and name with role badge
  - Edit profile (full name)
  - Change password
  - Notification settings
  - Recent activity audit log
  - Sign out button

- **`app/components/AdminPanel.jsx`** — Admin management interface
  - Invite new users with role assignment
  - View all users table
  - Change user roles
  - Deactivate users
  - View complete audit logs
  - (Extensible for CSV bulk import)

## Modified Files

- **`supabase/schema.sql`** — Added auth tables and RLS policies
- **`app/page.jsx`** — Integrated AuthProvider and conditional rendering
- **`app/RosterApp.jsx`** — Added role-based tab visibility and UserMenu header
- **`app/components/shared.jsx`** — Already had needed UI primitives

## Testing the Auth Flow

### 1. **First User (Admin) Setup**

1. Navigate to `http://localhost:3000`
2. Click "Don't have an account? Sign up"
3. Enter:
   - Full name: "Admin User"
   - Email: "admin@example.com"
   - Password: "password123" (6+ characters)
4. Click "Create account"
5. You'll see: "Account created! Check your email to confirm, then log in."
6. Go back to "Sign in"
7. Enter admin email and password
8. ✅ You're logged in as admin (you'll see all tabs including "Admin")

### 2. **Admin Panel - Invite Users**

1. Click "Admin" tab
2. In "Invite new user" section:
   - Email: "manager@example.com"
   - Role: "Manager"
   - Click "Send Invite"
3. ✅ Message shows invite sent
4. Repeat for different roles (Dispatcher, Employee)

### 3. **User Signup via Invite**

*Note: Email verification is skipped in development with `confirmationEmailRedirect` disabled. In production, set redirect URLs in Supabase Auth settings.*

1. Click "Back to sign in"
2. Click "Don't have an account? Sign up"
3. Create account as "manager@example.com" with role "Manager"
4. ✅ Logged in as Manager
5. Verify Manager sees: Projects, Employees, Roster, Capacity, Summary (no Admin tab)

### 4. **User Profile & Settings**

1. Click user avatar in top-right
2. **Profile tab:**
   - View profile info
   - Click "Edit Profile"
   - Change name → Save ✅
3. **Password tab:**
   - Enter current password: (your login password)
   - Enter new password: "newpass456"
   - Confirm: "newpass456"
   - Click "Update Password" ✅
   - Sign out and log back in with new password
4. **Alerts tab:**
   - Toggle email notifications ✅
5. **Activity tab:**
   - Click "Refresh" to see recent actions (login, profile_update, password_changed, etc.) ✅

### 5. **Admin User Management**

1. Log in as admin
2. Click "Admin" tab
3. **Invite section:**
   - Add multiple users with different roles
4. **Users table:**
   - See all invited users
   - Click "Change role" on any user
   - Select new role → Update ✅
   - Try "Deactivate" on a user (cannot deactivate yourself)
   - ✅ Message shows user deactivated
5. **Activity tab:**
   - See all system actions: logins, invites, role changes, deactivations
   - Filter by viewing as admin (all events)

### 6. **Role-Based Access Control**

| Role | Projects | Employees | Roster | Capacity | Summary | Admin |
|------|----------|-----------|--------|----------|---------|-------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Dispatcher | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Employee | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 7. **Inactivity Timeout**

1. Log in as any user
2. Wait 30 minutes of no mouse/keyboard activity
3. ✅ Auto-logged out (page redirects to login)
4. Or manually: Close browser → Reopen → Already logged out ✅

### 8. **Session Persistence**

1. Log in with "Remember me" checked ✅
2. Refresh page
3. ✅ Still logged in (session restored from browser storage)
4. Close and reopen browser
5. ✅ Still logged in (session token in cookies)

### 9. **Password Reset**

1. Click "Back to sign in"
2. Click "Forgot password?"
3. Enter your email
4. ✅ "Password reset email sent..."
5. *In development, reset link goes to email redirect URL (Supabase dashboard)*

## Implementation Details

### Hooks & Patterns

**`useAuth()` hook returns:**
- `user` — Current Supabase auth user
- `profile` — User profile from app_users table
- `loading` — Initial auth state loading
- `handleLogin(email, password)` — Sign in
- `handleSignup(email, password, fullName, role)` — Create account
- `handleLogout()` — Sign out + audit log
- `changePassword(newPassword)` — Update password
- `updateProfile(updates)` — Save profile changes
- `inviteUser(email, role)` — Admin: Send invitation
- `updateUserRole(userId, newRole)` — Admin: Change role
- `deactivateUser(userId)` — Admin: Remove user
- `getAuditLogs(limit)` — Fetch audit trail
- Permission helpers: `canEdit()`, `canViewReports()`, `canManageUsers()`, `canSubmitAvailability()`

**`AuthProvider` context:**
- Wraps entire app to provide auth state
- Automatic session restoration on mount
- Inactivity timer with configurable timeout (30 min default)
- Audit logging on every auth action

### Security Checklist

✅ RLS enabled on all auth tables  
✅ Policies enforce role-based access  
✅ No passwords stored in localStorage  
✅ JWT tokens in secure httpOnly cookies (Supabase default)  
✅ Session timeout prevents unauthorized access  
✅ Audit logging tracks all actions  
✅ Admin panel requires role check  
✅ Email verification (in production)  

## Future Enhancements

1. **CSV Bulk Import** — AdminPanel can add CSV upload for bulk user creation
2. **Two-Factor Auth** — Supabase TOTP support
3. **SSO** — Google/GitHub/Microsoft login
4. **Avatar Upload** — File storage via Supabase Storage
5. **Notifications** — Email alerts for roster changes (Supabase Edge Functions)
6. **API Tokens** — For external integrations
7. **Activity Filters** — Filter audit logs by date, action, user
8. **Rate Limiting** — Prevent brute force on auth endpoints

## Troubleshooting

**Problem:** "Missing Supabase env vars"
- **Solution:** Ensure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Problem:** Auth state not persisting across page reload
- **Solution:** Check browser cookies are enabled; clear cache if needed

**Problem:** "Only admins can..." error but user claims they're admin
- **Solution:** Check app_users table — role might not be set correctly; admin panel shows actual role

**Problem:** RLS "row level security" violation
- **Solution:** Verify policies in Supabase dashboard; ensure user has SELECT policy for their own rows

**Problem:** Password reset email not received
- **Solution:** Check spam folder; in dev, redirects to dashboard; production requires email provider setup

## Deployment Checklist

- [ ] Test auth flow in staging
- [ ] Configure email provider (SendGrid, etc.)
- [ ] Set password reset redirect URL
- [ ] Enable email confirmation
- [ ] Review and update RLS policies
- [ ] Set secure session cookie flags
- [ ] Enable CORS headers properly
- [ ] Test role-based access on each page
- [ ] Monitor audit logs for anomalies
- [ ] Brief team on invite workflow
