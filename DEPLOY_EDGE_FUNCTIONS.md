# 🚀 Deploy Edge Functions - Simple Copy & Paste Guide

Follow these steps to deploy all 3 GHL edge functions to Supabase.

---

## 📍 Where to Deploy

Go to: **https://supabase.com/dashboard/project/xakmijacmllazbmnaxeg/functions**

---

## 🔧 Function 1: ghl-oauth-callback

### Steps:
1. Click **"Create a new function"**
2. **Name**: `ghl-oauth-callback`
3. **Paste this code** (see below)
4. Click **"Deploy"**

### Code to paste:
```typescript
// Copy from: supabase/functions/ghl-oauth-callback/index.ts
// OR run: cat supabase/functions/ghl-oauth-callback/index.ts
```

✅ **Function 1 deployed!**

---

## 🔧 Function 2: ghl-webhook-handler

### Steps:
1. Click **"Create a new function"**
2. **Name**: `ghl-webhook-handler`
3. **Paste this code** (see below)
4. Click **"Deploy"**

### Code to paste:
```typescript
// Copy from: supabase/functions/ghl-webhook-handler/index.ts
// OR run: cat supabase/functions/ghl-webhook-handler/index.ts
```

✅ **Function 2 deployed!**

---

## 🔧 Function 3: ghl-get-forms

### Steps:
1. Click **"Create a new function"**
2. **Name**: `ghl-get-forms`
3. **Paste this code** (see below)
4. Click **"Deploy"**

### Code to paste:
```typescript
// Copy from: supabase/functions/ghl-get-forms/index.ts
// OR run: cat supabase/functions/ghl-get-forms/index.ts
```

✅ **Function 3 deployed!**

---

## ✅ Verify Deployment

After deploying all 3, you should see them listed at:
https://supabase.com/dashboard/project/xakmijacmllazbmnaxeg/functions

You should see:
- ✅ ghl-oauth-callback (Status: Active)
- ✅ ghl-webhook-handler (Status: Active)
- ✅ ghl-get-forms (Status: Active)

---

## 🎯 Quick Copy Commands

Run these in your terminal to get the code:

```bash
# Function 1
cat supabase/functions/ghl-oauth-callback/index.ts

# Function 2
cat supabase/functions/ghl-webhook-handler/index.ts

# Function 3
cat supabase/functions/ghl-get-forms/index.ts
```

Then copy each output and paste into Supabase dashboard.

---

## 🆘 Troubleshooting

**If function won't deploy:**
- Make sure you're logged into the correct Supabase project
- Check that secrets are set (GHL_CLIENT_ID, GHL_CLIENT_SECRET, etc.)
- Try refreshing the page

**If you get errors:**
- Check the function logs in Supabase dashboard
- Make sure the code is complete (all helper functions included)

---

## 📋 Next Steps

After deploying:
1. ✅ Set environment secrets (if not done already)
2. ✅ Run database migration
3. ✅ Test the integration!

Good luck! 🎉

