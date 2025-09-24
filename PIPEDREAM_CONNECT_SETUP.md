# 🔌 Pipedream Connect Integration Setup

This guide explains how to set up Pipedream Connect for CheckinAI to enable one-click user integrations.

## 🎯 Overview

**Pipedream Connect** allows CheckinAI users to connect THEIR Typeform/Google Forms accounts to our platform through our Pipedream project. Users authorize CheckinAI (via Pipedream) to access their accounts, and Pipedream creates workflows in our project that send their form data to our CheckinAI webhooks.

**Key Concept**: We create ONE Pipedream Connect project, users connect THEIR accounts through our project.

## 🛠️ Setup Steps

### 1. Initialize Pipedream Connect Project

```bash
# Install Pipedream CLI
brew install pipedreamhq/pd-cli/pipedream

# Login and initialize Connect project
pd login
pd init connect
```

This creates a Pipedream project with OAuth credentials that CheckinAI users will connect through.

### 2. Create Backend API Endpoint

Create `/api/pipedream/setup-integration` endpoint that uses pre-built components:

```javascript
// Example Node.js/Express endpoint
import { PipedreamClient } from "@pipedream/sdk";

app.post('/api/pipedream/setup-integration', async (req, res) => {
  const { user_id, integration_type, webhook_url, integration_name } = req.body;
  
  try {
    const client = new PipedreamClient({
      projectEnvironment: "production",
      clientId: process.env.PIPEDREAM_CLIENT_ID,
      clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
      projectId: process.env.PIPEDREAM_PROJECT_ID
    });

    // Create Connect token for user authentication
    const { token } = await client.tokens.create({
      externalUserId: user_id
    });

    // Generate Connect URL for the specific app
    const connectUrl = `https://connect.pipedream.com/oauth/accounts?` + 
      new URLSearchParams({
        app: integration_type === 'typeform' ? 'typeform' : 'google_forms',
        token: token,
        external_user_id: user_id,
        redirect_uri: `${process.env.APP_URL}/integrations/callback`,
        state: JSON.stringify({ user_id, webhook_url, integration_name })
      });

    // Store integration metadata in your database
    const integration_id = await saveIntegration({
      user_id,
      integration_type,
      integration_name,
      webhook_url,
      status: 'pending'
    });

    res.json({ 
      connect_url: connectUrl,
      integration_id 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to setup integration' });
  }
});

// Handle Connect callback
app.post('/api/pipedream/connect-callback', async (req, res) => {
  const { account_id, external_user_id, app } = req.body;
  
  try {
    // User successfully connected their account
    // Now set up the component to monitor their data
    
    const client = new PipedreamClient({
      projectEnvironment: "production",
      clientId: process.env.PIPEDREAM_CLIENT_ID,
      clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
      projectId: process.env.PIPEDREAM_PROJECT_ID
    });

    // Create component instance using pre-built trigger
    if (app === 'typeform') {
      await client.components.create({
        component: 'typeform-new-response',
        account_id: account_id,
        props: {
          // Monitor all forms for this user
          form_id: undefined // Will monitor all forms
        },
        webhook_url: getUserWebhookUrl(external_user_id) // User's CheckinAI webhook
      });
    } else if (app === 'google_forms') {
      await client.components.create({
        component: 'google-forms-new-response', 
        account_id: account_id,
        props: {
          form_id: undefined // Will monitor all forms
        },
        webhook_url: getUserWebhookUrl(external_user_id)
      });
    }

    // Update integration status
    await updateIntegrationStatus(external_user_id, app, 'connected', account_id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to setup component' });
  }
});
```

### 3. User Connection Flow

The updated frontend implementation uses pre-built components:

1. **User clicks "Connect Typeform"**
2. **Frontend calls `/api/pipedream/setup-integration`** to create integration and get Connect URL
3. **Opens Pipedream Connect auth flow** where user authorizes CheckinAI to access their account
4. **User connects THEIR Typeform account** to CheckinAI via Pipedream
5. **Pipedream callback triggers component setup** using pre-built Typeform triggers
6. **Component automatically monitors user's forms** and sends data to their CheckinAI webhook

### Key Differences from Custom Workflows

**❌ Old Approach (Custom Workflows)**:
- Create custom workflow templates
- User connects → creates workflow instance
- More complex setup and maintenance

**✅ New Approach (Pre-Built Components)**:
- Use Pipedream's pre-built components
- User connects → creates component instance
- Simpler, more reliable, maintained by Pipedream

### 3. Set Up Webhook URL Generation

Update the webhook URL generation in `IntegrationSetupModal.tsx`:

```typescript
// Replace with actual user context
const { user } = useAuth(); // Your auth context
const webhookToken = user?.webhook_token || 'generate-token-here';

const webhookUrl = `https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/webhook-checkin/${user.id}/${webhookToken}`;
```

### 4. Add Integration Callback Route

Create a callback route to handle Pipedream Connect responses:

```typescript
// Add to App.tsx routes
<Route path="/integrations/callback" element={
  <ProtectedRoute>
    <IntegrationCallbackPage />
  </ProtectedRoute>
} />
```

### 5. Handle Pipedream Connect Messages

The modal listens for postMessage events from the Pipedream Connect popup:

```javascript
const handleMessage = (event: MessageEvent) => {
  if (event.origin !== 'https://pipedream.com') return;
  
  if (event.data.type === 'pipedream-connect-success') {
    // Integration connected successfully
    const integration = {
      id: event.data.workflow_id,
      type: integrationType,
      name: integrationName,
      status: 'connected',
      config: {
        workflow_id: event.data.workflow_id,
        webhook_url: webhookUrl
      }
    };
    onSave(integration);
  }
};
```

## 🎨 UI Components

### Integration Setup Modal

The modal provides three integration options:

1. **Typeform** - One-click connect via Pipedream
2. **Google Forms** - One-click connect via Pipedream  
3. **Custom Webhook** - Manual webhook URL setup

### Features

- **🎯 One-click setup** for popular platforms
- **🔐 Secure authentication** via Pipedream OAuth
- **📋 Custom webhook fallback** for other platforms
- **📊 Integration management** with status tracking
- **🗑️ Easy deletion** and management

## 🔧 Backend Integration

### Webhook Token Management

You'll need to add webhook token generation to your user service:

```sql
-- Add webhook token to user profiles
ALTER TABLE user_profiles 
ADD COLUMN webhook_token VARCHAR(255) DEFAULT gen_random_uuid();

-- Create index for webhook lookups
CREATE INDEX idx_user_profiles_webhook_token ON user_profiles(webhook_token);
```

### Integration Storage

Store integration configs in your database:

```sql
CREATE TABLE user_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'typeform', 'google_forms', 'custom_webhook'
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'connected', -- 'connected', 'disconnected', 'error'
  config JSONB NOT NULL, -- Stores workflow_id, webhook_url, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🧪 Testing the Integration

### 1. Test Typeform Integration

1. Create a test Typeform with name, email, and question fields
2. Click "Connect Typeform" in your app
3. Authorize the connection in the popup
4. Submit a test form response
5. Verify the check-in appears in CheckinAI

### 2. Test Google Forms Integration

1. Create a test Google Form with name, email, and question fields
2. Click "Connect Google Forms" in your app
3. Authorize the connection in the popup  
4. Submit a test form response
5. Verify the check-in appears in CheckinAI

### 3. Test Custom Webhook

1. Click "Custom Webhook" in your app
2. Copy the webhook URL
3. Use curl or Postman to send a test payload:

```bash
curl -X POST "your-webhook-url" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "client_email": "test@example.com",
    "transcript": "How are you feeling?: Great!\nAny concerns?: None",
    "source": "test"
  }'
```

## 🔐 Security Considerations

### Webhook Token Security

- **Generate unique tokens** for each user
- **Rotate tokens** if compromised
- **Validate tokens** in your webhook handler
- **Log webhook usage** for monitoring

### Pipedream Connect Security

- **Validate origin** of postMessage events
- **Use HTTPS** for all webhook URLs
- **Store sensitive config** securely
- **Monitor integration usage**

## 📊 Monitoring & Analytics

Track integration usage:

```sql
-- Add to your analytics
INSERT INTO integration_events (
  user_id,
  integration_id, 
  event_type, -- 'connected', 'submission_received', 'error'
  event_data,
  created_at
) VALUES (...);
```

## 🔧 What You Build in Pipedream (Updated)

### **Nothing! Use Pre-Built Components**

With the new approach, you **don't need to build anything in Pipedream**:

1. **No custom workflows needed** - Use pre-built components
2. **No templates to create** - Pipedream provides them
3. **No code to write** - Components handle everything

### **What Pipedream Provides Out-of-the-Box**

- ✅ **Typeform "New Response" trigger component**
- ✅ **Google Forms "New Response" trigger component** 
- ✅ **Automatic data transformation**
- ✅ **Webhook delivery to your endpoints**
- ✅ **Error handling and retries**
- ✅ **User account management**

### **What You Configure**

1. **Setup Pipedream Connect project** (`pd init connect`)
2. **Enable Typeform and Google Forms apps** in project settings
3. **Implement backend endpoints** for setup and callbacks
4. **Configure webhook URLs** to point to CheckinAI

### **Simple Setup Process**

```bash
# 1. Initialize Connect project
pd init connect

# 2. That's it! No custom code needed in Pipedream
```

The pre-built components automatically:
- Monitor user's forms
- Transform response data
- Send to your webhook endpoints
- Handle errors and retries

## 🚨 Troubleshooting

### Common Issues

1. **Popup blocked** - Ensure popup blockers allow Pipedream
2. **Wrong webhook URL** - Verify user ID and token in URL
3. **CORS errors** - Check your Supabase edge function CORS settings
4. **Field mapping issues** - Test with simple forms first

### Debug Steps

1. **Check browser console** for JavaScript errors
2. **Monitor Supabase logs** for webhook calls
3. **Use Pipedream logs** to see workflow execution
4. **Test webhook directly** with curl/Postman

## 🎉 Go Live Checklist

- [ ] Templates published to Pipedream
- [ ] Webhook tokens generated for all users
- [ ] Integration storage schema deployed
- [ ] UI components tested in production
- [ ] Error handling and logging implemented
- [ ] User documentation created
- [ ] Support team trained on troubleshooting

---

🎯 **You're all set!** Your users can now connect Typeform, Google Forms, and custom webhooks with just a few clicks.