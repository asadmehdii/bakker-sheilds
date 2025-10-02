# GHL Credentials Setup Instructions

## ✅ Your GHL App Details

**App Name**: check_in_ai  
**Client ID**: `6865bcfcab9df9e44ea847ed-mg67y07i`  
**Client Secret**: `4a8d7c33-a284-498a-a679-c2d206fae9df`

---

## 🔧 Step 1: Create .env File

Create a file named `.env.local` in the root of your project with these contents:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://xakmijacmllazbmnaxeg.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here

# GoHighLevel OAuth Configuration
VITE_GHL_CLIENT_ID=6865bcfcab9df9e44ea847ed-mg67y07i
VITE_GHL_CLIENT_SECRET=4a8d7c33-a284-498a-a679-c2d206fae9df
VITE_GHL_REDIRECT_URI=https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/ghl-oauth-callback
```

**Note**: Replace `your-supabase-anon-key-here` with your actual Supabase anon key if you don't have it already set.

---

## ☁️ Step 2: Set Supabase Secrets

Run these commands in your terminal to configure the edge functions:

```bash
cd /Users/macbook/Desktop/checkin-ai

# Set GHL Client ID
supabase secrets set GHL_CLIENT_ID=6865bcfcab9df9e44ea847ed-mg67y07i

# Set GHL Client Secret
supabase secrets set GHL_CLIENT_SECRET=4a8d7c33-a284-498a-a679-c2d206fae9df

# Set OAuth Redirect URI
supabase secrets set GHL_REDIRECT_URI=https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/ghl-oauth-callback

# Set App URL (update with your actual domain after deployment)
supabase secrets set APP_URL=http://localhost:5173
```

**After deployment**, update APP_URL:
```bash
supabase secrets set APP_URL=https://your-production-domain.com
```

---

## 🚀 Step 3: Deploy Everything

### 3.1 Deploy Database Migration

```bash
supabase db push
```

This creates the GHL integration tables.

### 3.2 Deploy Edge Functions

```bash
# Deploy all GHL functions
supabase functions deploy ghl-oauth-callback
supabase functions deploy ghl-webhook-handler
supabase functions deploy ghl-get-forms
```

### 3.3 Deploy Frontend

```bash
# Build the app
npm run build

# Deploy to your hosting provider
# Example for Netlify:
netlify deploy --prod

# Example for Vercel:
vercel --prod
```

---

## ✅ Step 4: Update GHL Marketplace App Settings

⚠️ **IMPORTANT**: Go back to your GHL Marketplace app and verify:

1. **OAuth Redirect URL** is set to:
   ```
   https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/ghl-oauth-callback
   ```

2. **Scopes** include:
   - ✅ `contacts.readonly`
   - ✅ `forms.readonly`
   - ✅ `webhooks.write`

3. **App is published** or set to the correct environment (development/production)

---

## 🧪 Step 5: Test the Integration

### Local Testing (Development)

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Open browser to `http://localhost:5173`

3. Go to **Integrations** page

4. Click **"Add Integration"** → **"GoHighLevel"**

5. Click **"Connect GoHighLevel"**

6. You should be redirected to GHL OAuth page

7. Select a location and authorize

8. You should be redirected back with success message

9. Open the integration settings and click **"Manage Forms"**

10. You should see your GHL forms listed

11. Select a form and save

12. Submit a test response in GHL

13. Check your CheckinAI dashboard for the new check-in!

---

## 🔍 Troubleshooting

### If OAuth fails:

```bash
# Check function logs
supabase functions logs ghl-oauth-callback --follow
```

### If forms don't appear:

```bash
# Check get-forms function
supabase functions logs ghl-get-forms --follow
```

### If webhooks don't work:

```bash
# Check webhook handler
supabase functions logs ghl-webhook-handler --follow
```

### Verify secrets are set:

```bash
supabase secrets list
```

You should see:
- GHL_CLIENT_ID
- GHL_CLIENT_SECRET
- GHL_REDIRECT_URI
- APP_URL

---

## 📋 Quick Start Commands

Copy and paste this entire block:

```bash
cd /Users/macbook/Desktop/checkin-ai

# Set Supabase secrets
supabase secrets set GHL_CLIENT_ID=6865bcfcab9df9e44ea847ed-mg67y07i
supabase secrets set GHL_CLIENT_SECRET=4a8d7c33-a284-498a-a679-c2d206fae9df
supabase secrets set GHL_REDIRECT_URI=https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/ghl-oauth-callback
supabase secrets set APP_URL=http://localhost:5173

# Deploy database
supabase db push

# Deploy functions
supabase functions deploy ghl-oauth-callback
supabase functions deploy ghl-webhook-handler
supabase functions deploy ghl-get-forms

# Start dev server
npm run dev
```

Then test at http://localhost:5173 🚀

---

## 🎉 You're All Set!

Once deployed, users can:
1. Connect their GHL account with one click
2. Select specific forms to monitor
3. Get automatic check-ins from form submissions

Need help? Check the logs with the troubleshooting commands above!

