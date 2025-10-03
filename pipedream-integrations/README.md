# 🔗 Pipedream Integrations for CheckinAI

This directory contains ready-to-use Pipedream workflow templates that connect popular form providers to your CheckinAI webhook system.

## 🚀 Quick Setup Guide

### Step 1: Get Your CheckinAI Webhook URL

1. Log into your CheckinAI app
2. Go to Account Settings → Webhook Settings
3. Copy your webhook URL (format: `https://your-supabase-url.supabase.co/functions/v1/webhook-checkin/{coach_id}/{webhook_token}`)

### Step 2: Create Pipedream Workflow

1. **Sign up/Login** at [pipedream.com](https://pipedream.com)
2. **Create new workflow**
3. **Choose your trigger** (Typeform, Google Forms, etc.)
4. **Add Code Step** and paste the appropriate template code
5. **Configure the webhook URL** in the props

### Step 3: Test the Integration

1. **Submit a test form** in your form provider
2. **Check Pipedream logs** to see if data flows correctly
3. **Verify in CheckinAI** that the check-in appears in your dashboard

## 📋 Supported Form Providers

### ✅ Typeform
- **File**: `typeform-checkinai.js`
- **Features**: Full field mapping, choice handling, rich question types
- **Setup**: Connect Typeform app + configure field mappings

### ✅ Google Forms  
- **File**: `google-forms-checkinai.js`
- **Features**: Smart keyword matching, automatic field detection
- **Setup**: Connect Google Forms app + adjust keyword mappings

### ✅ JotForm
- **File**: `jotform-checkinai.js`
- **Features**: Handles JotForm's complex field structure
- **Setup**: Connect JotForm app + webhook trigger

### 🔄 Coming Soon
- Wufoo
- Formstack
- Gravity Forms
- Contact Form 7

## ⚙️ Configuration Options

Each workflow includes configurable field mappings:

```javascript
field_mappings: {
  name_keywords: ["name", "full name", "your name"],
  email_keywords: ["email", "email address"], 
  phone_keywords: ["phone", "mobile", "cell"]
}
```

## 🎯 How Client Matching Works

Your CheckinAI webhook uses the client matching system you configured:

1. **Primary Identifier**: Phone or Email (as configured)
2. **Fallback Identifier**: Email or Phone (as configured)  
3. **Auto-Create**: New clients created automatically
4. **Smart Matching**: Phone numbers normalized, emails matched exactly

## 📊 Data Flow

```
Form Submission → Pipedream → CheckinAI Webhook → Database
                   ↓
              Field Mapping &
              Data Transformation
```

## 🔧 Customization

### Adding Custom Fields

You can capture additional form data by modifying the `checkinData` object:

```javascript
const checkinData = {
  client_name: nameAnswer?.text,
  client_email: emailAnswer?.email,
  client_phone: phoneAnswer?.phone_number,
  transcript: transcript,
  
  // Add custom fields
  custom_field_1: findAnswer('special_question')?.text,
  tags: ['form_submission', 'typeform'],
  
  // Metadata
  source: 'typeform',
  form_id: formResponse.form_id,
  raw_data: formResponse
};
```

### Error Handling

All workflows include error handling and logging:
- Failed webhook calls are retried automatically
- Full error details logged in Pipedream
- Original form data preserved for debugging

## 🚨 Troubleshooting

### Common Issues

1. **Webhook URL Wrong Format**
   - ✅ Correct: `https://xyz.supabase.co/functions/v1/webhook-checkin/user123/token456`
   - ❌ Wrong: Missing coach_id or webhook_token

2. **Field Mapping Issues**
   - Check the field names in your form
   - Update keyword mappings in the workflow
   - Test with Pipedream's built-in testing tools

3. **Client Not Created**
   - Verify client matching settings in CheckinAI
   - Check if phone/email format is valid
   - Ensure auto_create_clients is enabled

### Testing Tips

1. **Use Pipedream's Test Mode** to see exactly what data flows through
2. **Check CheckinAI logs** in Supabase Functions for webhook processing
3. **Start with simple forms** then add complexity

## 💡 Pro Tips

### Form Design Best Practices

1. **Use clear field labels** that match your keyword mappings
2. **Always include name/email/phone** for proper client matching
3. **Keep forms focused** - too many fields create noise
4. **Use required fields** for essential client data

### Optimization

1. **Batch multiple forms** into single workflows if similar
2. **Use conditional logic** to handle different form types
3. **Add data validation** before sending to CheckinAI
4. **Include form metadata** for better tracking

## 🔐 Security Notes

- Webhook URLs contain sensitive tokens - keep them secret
- Use Pipedream's secret fields for storing URLs
- Monitor webhook usage in your Supabase dashboard
- Regularly rotate webhook tokens if needed

## 📞 Support

If you need help setting up integrations:

1. Check the Pipedream workflow logs for errors
2. Verify your CheckinAI webhook settings
3. Test with simple data first
4. Review the client matching configuration

---

🎉 **You're all set!** Your forms will now automatically create check-ins in CheckinAI with proper client matching and attribution.