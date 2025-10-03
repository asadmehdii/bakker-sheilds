// Pipedream Connect Template: Google Forms → CheckinAI
// This is the template that gets deployed when users click "Connect Google Forms"

export default defineComponent({
  name: "google-forms-checkinai-connect",
  version: "1.0.0",
  description: "Automatically send Google Forms responses to CheckinAI as check-ins",
  props: {
    google_forms: {
      type: "app",
      app: "google_forms",
    },
    checkinai_webhook_url: {
      type: "string",
      label: "CheckinAI Webhook URL",
      description: "Your CheckinAI webhook endpoint (provided automatically)",
      secret: true
    }
  },
  async run({ steps, $ }) {
    const formResponse = steps.trigger.event;
    
    if (!formResponse) {
      throw new Error('No form response data received');
    }

    console.log('Processing Google Forms submission');
    
    // Helper function to find fields by keywords (case-insensitive)
    const findFieldByKeywords = (keywords) => {
      for (const [question, answer] of Object.entries(formResponse)) {
        if (!question || !answer) continue;
        
        const questionLower = question.toLowerCase();
        for (const keyword of keywords) {
          if (questionLower.includes(keyword.toLowerCase())) {
            return String(answer).trim();
          }
        }
      }
      return null;
    };

    // Extract client information using smart keyword matching
    const clientName = findFieldByKeywords([
      'name', 'full name', 'your name', 'client name', 'first name', 'last name'
    ]) || 
    // Try combining first and last name fields
    `${findFieldByKeywords(['first name', 'first']) || ''} ${findFieldByKeywords(['last name', 'last', 'surname']) || ''}`.trim() ||
    'Unknown';

    const clientEmail = findFieldByKeywords([
      'email', 'e-mail', 'email address', 'contact email', 'your email'
    ]);

    const clientPhone = findFieldByKeywords([
      'phone', 'mobile', 'cell', 'telephone', 'phone number', 'contact number'
    ]);

    // Build comprehensive transcript from all form fields
    const transcript = Object.entries(formResponse)
      .filter(([question, answer]) => {
        // Filter out metadata and empty fields
        return question && 
               answer && 
               answer !== '' &&
               !question.toLowerCase().includes('timestamp') &&
               !question.startsWith('_') &&
               question !== 'id';
      })
      .map(([question, answer]) => {
        // Clean up the question and answer
        const cleanQuestion = question.trim();
        const cleanAnswer = String(answer).trim();
        return `${cleanQuestion}: ${cleanAnswer}`;
      })
      .join('\n');

    // Prepare CheckinAI payload
    const checkinData = {
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      transcript: transcript || 'Form submitted (no responses)',
      date: new Date().toISOString(),
      source: 'google_forms',
      
      // Metadata for tracking
      timestamp: formResponse.Timestamp || formResponse.timestamp || new Date().toISOString(),
      
      // Tags for organization
      tags: ['google_forms', 'form_submission'],
      
      // Store original data for reference
      raw_data: {
        form_response: formResponse,
        response_count: Object.keys(formResponse).length
      }
    };

    console.log('Sending check-in data to CheckinAI:', {
      client_name: checkinData.client_name,
      client_email: checkinData.client_email,
      client_phone: checkinData.client_phone,
      has_transcript: !!checkinData.transcript,
      field_count: Object.keys(formResponse).length
    });

    // Send to CheckinAI
    try {
      const response = await fetch(this.checkinai_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Pipedream-GoogleForms-CheckinAI/1.0'
        },
        body: JSON.stringify(checkinData)
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        throw new Error(`CheckinAI webhook failed: ${response.status} - ${responseText}`);
      }

      console.log('✅ Successfully sent to CheckinAI');
      
      return {
        success: true,
        status: response.status,
        checkin_data: checkinData,
        response: responseText,
        message: `Check-in created for ${clientName}`
      };

    } catch (error) {
      console.error('❌ Error sending to CheckinAI:', error);
      
      // Re-throw for Pipedream to handle retries
      throw new Error(`Failed to send to CheckinAI: ${error.message}`);
    }
  }
});