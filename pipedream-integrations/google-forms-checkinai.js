// Pipedream Workflow: Google Forms → CheckinAI
// Copy this code into a new Pipedream workflow

export default defineComponent({
  name: "google-forms-to-checkinai",
  version: "0.1.0",
  props: {
    google_forms: {
      type: "app", 
      app: "google_forms",
    },
    checkinai_webhook_url: {
      type: "string",
      label: "CheckinAI Webhook URL", 
      description: "Format: https://your-supabase-url.supabase.co/functions/v1/webhook-checkin/{coach_id}/{webhook_token}",
      secret: true
    },
    field_mappings: {
      type: "object",
      label: "Field Mappings",
      description: "Map Google Forms question text to CheckinAI fields",
      default: {
        name_keywords: ["name", "full name", "your name"],
        email_keywords: ["email", "email address", "e-mail"],
        phone_keywords: ["phone", "phone number", "mobile", "cell"]
      }
    }
  },
  async run({ steps, $ }) {
    const formResponse = steps.trigger.event;
    
    // Helper function to find field by keywords
    const findFieldByKeywords = (keywords) => {
      for (const [question, answer] of Object.entries(formResponse)) {
        const questionLower = question.toLowerCase();
        if (keywords.some(keyword => questionLower.includes(keyword.toLowerCase()))) {
          return answer;
        }
      }
      return null;
    };
    
    // Extract client data using keyword matching
    const clientName = findFieldByKeywords(this.field_mappings.name_keywords);
    const clientEmail = findFieldByKeywords(this.field_mappings.email_keywords);
    const clientPhone = findFieldByKeywords(this.field_mappings.phone_keywords);
    
    // Build transcript from all form fields
    const transcript = Object.entries(formResponse)
      .filter(([question, answer]) => 
        // Filter out metadata fields
        !question.startsWith('_') && 
        question !== 'Timestamp' &&
        answer !== null && 
        answer !== undefined && 
        answer !== ''
      )
      .map(([question, answer]) => `${question}: ${answer}`)
      .join('\n');
    
    // Prepare CheckinAI payload
    const checkinData = {
      client_name: clientName || 'Unknown',
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      transcript: transcript,
      date: new Date().toISOString(),
      source: 'google_forms',
      timestamp: formResponse.Timestamp || new Date().toISOString(),
      raw_data: formResponse // Store complete original data
    };
    
    console.log('Sending to CheckinAI:', checkinData);
    
    // Send to CheckinAI webhook
    try {
      const response = await fetch(this.checkinai_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checkinData)
      });
      
      const responseData = await response.text();
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} - ${responseData}`);
      }
      
      return { 
        success: true, 
        status: response.status,
        checkin_data: checkinData,
        response: responseData
      };
      
    } catch (error) {
      console.error('CheckinAI webhook error:', error);
      throw error;
    }
  }
});