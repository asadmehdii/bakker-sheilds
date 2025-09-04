# CheckinAI

AI-powered client check-in analysis and coaching platform.

## Features

- **Smart Check-in Analysis**: AI-powered analysis of client check-in transcripts
- **Coaching Insights**: Get intelligent recommendations and insights for coaching responses
- **Webhook Integration**: Automatically receive check-ins from external systems
- **Response Management**: Craft and send personalized responses to clients
- **Team Collaboration**: Multi-user support with role-based permissions
- **Real-time Chat**: AI-assisted conversations for developing coaching responses

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Functions, Storage)
- **AI**: OpenAI GPT integration via Supabase Edge Functions
- **Deployment**: Netlify with serverless functions
- **UI**: Lucide React icons, responsive design

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- OpenAI API key

### Environment Variables

Create a `.env` file with:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Deploy

Deploy to Netlify by connecting your repository or using the Netlify CLI.

## Supabase Setup

1. Create a new Supabase project
2. Run the migrations in `/supabase/migrations/`
3. Deploy the Edge Functions in `/supabase/functions/`
4. Configure environment variables

## Webhook Integration

CheckinAI supports webhook integration for automatically receiving client check-ins:

1. Configure webhook settings in Account Settings
2. Use the generated webhook URL in your client systems
3. Check-ins will automatically appear in the dashboard

## Team Management

- **Coach**: Full access to all features
- **Admin**: Can manage team settings and access all check-ins
- **Assistant Coach**: Can view and respond to check-ins

## AI Features

- **Transcript Analysis**: Automatic analysis of check-in content
- **Smart Recommendations**: AI-powered coaching suggestions
- **Response Assistance**: AI-assisted response drafting
- **Pattern Recognition**: Identify trends and patterns in client progress

## License

Private - All rights reserved