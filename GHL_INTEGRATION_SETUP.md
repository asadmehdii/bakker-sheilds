# GoHighLevel Integration Setup Guide

This guide will help you set up the GoHighLevel marketplace integration for CheckinAI.

## 📋 Prerequisites

1. A GoHighLevel account with marketplace app developer access
2. CheckinAI deployed with Supabase backend
3. Access to your production environment variables

---

## 🔧 Step 1: Register Your GHL Marketplace App

1. **Go to GHL Marketplace Developer Portal**
   - Visit: [https://marketplace.gohighlevel.com/](https://marketplace.gohighlevel.com/)
   - Sign in with your GHL account

2. **Create New App**
   - Click "Create New App"
   - Fill in the following details:
     - **App Name**: CheckinAI
     - **App Description**: Automatic check-in collection from GHL forms and surveys
     - **Category**: CRM / Automation
     - **App Icon**: Upload your CheckinAI logo
     - **Support Email**: your-support@email.com
     - **Privacy Policy URL**: your-privacy-policy-url
     - **Terms of Service URL**: your-terms-url

3. **Configure OAuth Settings**
   - **Redirect URI**: `https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/ghl-oauth-callback`
   - **Scopes Required**:
     - `contacts.readonly` - Read contact information
     - `forms.readonly` - Read forms and form submissions
     - `webhooks.write` - Create and manage webhooks

4. **Save and Get Credentials**
   After saving, you'll receive:
   - **Client ID**: (looks like: `64a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5`)
   - **Client Secret**: (looks like: `p1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0`)
   
   ⚠️ **IMPORTANT**: Save these credentials securely. You'll need them in Step 2.

---

## 🛠️ Step 2: Configure Environment Variables

### Supabase Edge Functions Environment

Run these commands in your terminal (replace with your actual values):

```bash
# Set GHL Client ID
supabase secrets set GHL_CLIENT_ID=your-ghl-client-id-here

# Set GHL Client Secret
supabase secrets set GHL_CLIENT_SECRET=your-ghl-client-secret-here

# Set GHL Redirect URI (must match what you entered in GHL)
supabase secrets set GHL_REDIRECT_URI=https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/ghl-oauth-callback

# Set your app URL for redirects
supabase secrets set APP_URL=https://your-checkin-ai-domain.com
```

### Frontend Environment Variables

Add these to your `.env` file (or your hosting provider's environment variables):

```bash
# GHL OAuth Credentials (same as above)
VITE_GHL_CLIENT_ID=your-ghl-client-id-here
VITE_GHL_CLIENT_SECRET=your-ghl-client-secret-here

# Redirect URI (must match Supabase function URL)
VITE_GHL_REDIRECT_URI=https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/ghl-oauth-callback
```

---

## 🗄️ Step 3: Deploy Database Migration

Run the migration to create GHL-specific tables:

```bash
cd /Users/macbook/Desktop/checkin-ai
supabase db push
```

This creates:
- `ghl_form_selections` - Stores which forms users want to monitor
- `ghl_webhook_subscriptions` - Tracks active webhook subscriptions
- Indexes for performance

---

## ☁️ Step 4: Deploy Edge Functions

Deploy the GHL-specific edge functions:

```bash
# Deploy OAuth callback handler
supabase functions deploy ghl-oauth-callback

# Deploy webhook handler for form submissions
supabase functions deploy ghl-webhook-handler

# Deploy form fetching service
supabase functions deploy ghl-get-forms
```

Verify deployment:
```bash
supabase functions list
```

You should see:
- ✅ ghl-oauth-callback
- ✅ ghl-webhook-handler
- ✅ ghl-get-forms

---

## 🚀 Step 5: Deploy Frontend Updates

Build and deploy your frontend with the new GHL integration:

```bash
# Build the app
npm run build

# Deploy to your hosting provider (Netlify, Vercel, etc.)
# Example for Netlify:
netlify deploy --prod

# Example for Vercel:
vercel --prod
```

---

## ✅ Step 6: Test the Integration

### 6.1 Connect GHL Account

1. Log into your CheckinAI app
2. Navigate to **Integrations** page
3. Click **"Add Integration"**
4. Select **"GoHighLevel"**
5. Click **"Connect GoHighLevel"**
6. You'll be redirected to GHL OAuth
7. Select the location you want to connect
8. Authorize the app
9. You'll be redirected back to CheckinAI

### 6.2 Select Forms

1. After successful connection, you'll see your GHL integration
2. Click on the integration to open settings
3. Click **"Manage Forms"**
4. Select which forms should send submissions to CheckinAI
5. Click **"Save Selection"**

### 6.3 Test Form Submission

1. Go to your GHL account
2. Find one of the forms you selected
3. Submit a test response with:
   - Name
   - Email and/or Phone
   - Some check-in content
4. Go back to CheckinAI dashboard
5. You should see a new check-in appear!

---

## 🔍 Troubleshooting

### OAuth Redirect Issues

**Problem**: After authorizing, I get a 404 error

**Solution**:
- Verify your `GHL_REDIRECT_URI` matches exactly in:
  1. GHL Marketplace App settings
  2. Supabase edge function environment
  3. Frontend .env file
- Make sure `ghl-oauth-callback` function is deployed

### No Forms Appearing

**Problem**: Form selection modal shows "No forms found"

**Solution**:
- Verify the `ghl-get-forms` function is deployed
- Check that your GHL account has active forms
- Verify the OAuth token has `forms.readonly` scope

### Webhooks Not Working

**Problem**: Form submissions don't create check-ins

**Solution**:
1. Check webhook subscription in GHL:
   - Go to GHL Settings → Webhooks
   - Verify webhook URL is your Supabase function URL
   - Test the webhook manually

2. Check Supabase function logs:
   ```bash
   supabase functions logs ghl-webhook-handler
   ```

3. Verify form is selected:
   - Go to integration settings
   - Check that the form appears in "Selected Forms"

### Client Matching Issues

**Problem**: Check-ins created but clients not matched correctly

**Solution**:
- Go to Account Settings → Webhook Settings
- Configure client matching preferences:
  - Primary identifier (phone or email)
  - Fallback identifier
  - Auto-create clients toggle
- Ensure GHL forms collect the identifier you're using

---

## 📊 How It Works

1. **User Connects**:
   - User clicks "Connect GoHighLevel"
   - Redirected to GHL OAuth
   - Grants permissions
   - GHL sends authorization code
   - `ghl-oauth-callback` exchanges code for access token
   - Tokens stored in `user_integrations` table
   - Webhook subscription created automatically

2. **User Selects Forms**:
   - User opens integration settings
   - Clicks "Manage Forms"
   - `ghl-get-forms` fetches available forms from GHL API
   - User selects specific forms
   - Selections stored in `ghl_form_selections` table

3. **Form Submission Flow**:
   - User submits form in GHL
   - GHL webhook fires to `ghl-webhook-handler`
   - Handler checks if form is selected
   - Extracts contact info and form data
   - Creates or matches client
   - Creates check-in with AI embedding
   - Check-in appears in dashboard

---

## 🔐 Security Notes

- **Never commit** `.env` files to git
- **Rotate secrets** if they're exposed
- GHL access tokens are stored encrypted in Supabase
- Webhook requests are verified against selected forms
- RLS policies ensure users only access their own data

---

## 📝 Support

If you encounter issues:

1. Check Supabase function logs:
   ```bash
   supabase functions logs ghl-oauth-callback --follow
   supabase functions logs ghl-webhook-handler --follow
   ```

2. Verify environment variables:
   ```bash
   supabase secrets list
   ```

3. Contact support with:
   - Error messages
   - Function logs
   - Steps to reproduce

---

## 🎉 Success!

Once everything is set up:
- ✅ Users can connect their GHL accounts with one click
- ✅ Select specific forms to monitor
- ✅ Form submissions automatically create check-ins
- ✅ Client matching works automatically
- ✅ AI analysis runs on every check-in

Your CheckinAI + GoHighLevel integration is now live! 🚀

