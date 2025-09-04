# CheckinAI Deployment Guide

## Prerequisites

1. **Supabase Project**: Create a new Supabase project for CheckinAI
2. **Netlify Account**: For hosting the frontend
3. **OpenAI API Key**: For AI functionality

## Environment Setup

### 1. Supabase Configuration

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Database Setup

Run the migrations in the `/supabase/migrations/` directory:

```bash
supabase db reset
```

### 3. Edge Functions Deployment

Deploy the Supabase Edge Functions:

```bash
supabase functions deploy openai-checkin-analysis
supabase functions deploy openai-checkin-chat  
supabase functions deploy webhook-checkin
```

Set the OpenAI API key secret:

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
```

### 4. Netlify Deployment

1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Webhook Configuration

The CheckinAI webhook endpoint will be available at:
```
https://your-netlify-site.netlify.app/webhook-checkin/[userId]/[webhookToken]
```

This endpoint:
1. Receives check-in data via POST requests
2. Processes the data through Supabase Edge Functions
3. Stores check-ins in the database
4. Triggers AI analysis

## Testing Deployment

1. **Build locally**: `npm run build`
2. **Preview build**: `npm run preview`
3. **Test webhook**: Send a POST request to the webhook endpoint
4. **Verify database**: Check that check-ins are stored correctly
5. **Test AI features**: Ensure analysis and chat work properly

## Production Checklist

- [ ] Supabase project created and configured
- [ ] Database migrations applied
- [ ] Edge Functions deployed with OpenAI API key
- [ ] Netlify site deployed with environment variables
- [ ] Webhook endpoint tested and working
- [ ] User authentication functioning
- [ ] AI analysis and chat features working
- [ ] Team management and permissions working

## Monitoring

- Monitor Supabase Edge Function logs for errors
- Check Netlify function logs for webhook processing
- Monitor database usage and performance
- Track OpenAI API usage and costs

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure Supabase CORS is configured correctly
2. **Webhook not working**: Check Netlify function deployment
3. **AI not responding**: Verify OpenAI API key is set correctly
4. **Auth issues**: Check Supabase Auth configuration

### Logs

- Supabase Dashboard > Edge Functions > Logs
- Netlify Dashboard > Functions > Logs
- Browser Developer Tools > Console for frontend errors