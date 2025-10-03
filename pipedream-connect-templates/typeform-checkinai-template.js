// Pipedream Connect Template: Typeform → CheckinAI
// This is the template that gets deployed when users click "Connect Typeform"

export default defineComponent({
  name: "typeform-checkinai-connect",
  version: "1.0.0",
  description: "Automatically send Typeform submissions to CheckinAI as check-ins",
  props: {
    typeform: {
      type: "app",
      app: "typeform",
    },
    checkinai_webhook_url: {
      type: "string",
      label: "CheckinAI Webhook URL",
      description: "Your CheckinAI webhook endpoint (provided automatically)",
      secret: true
    }
  },
  async run({ steps, $ }) {
    const formResponse = steps.trigger.event.form_response;
    
    if (!formResponse) {
      throw new Error('No form response data received');
    }

    const answers = formResponse.answers || [];
    
    console.log(`Processing Typeform submission: ${formResponse.token}`);
    
    // Smart field extraction based on common patterns
    const extractField = (patterns, type = 'text') => {
      for (const pattern of patterns) {
        const answer = answers.find(a => {
          const title = (a.field?.title || '').toLowerCase();
          const ref = (a.field?.ref || '').toLowerCase();
          return title.includes(pattern.toLowerCase()) || ref.includes(pattern.toLowerCase());
        });
        
        if (answer) {
          switch (type) {
            case 'email': return answer.email;
            case 'phone': return answer.phone_number;
            case 'text': return answer.text;
            case 'choice': return answer.choice?.label;
            case 'number': return answer.number;
            default: return answer.text || answer.email || answer.phone_number || answer.choice?.label;
          }
        }
      }
      return null;
    };

    // Extract client information using smart patterns
    const clientName = extractField(['name', 'full name', 'your name', 'client name', 'first name']) ||
                      `${extractField(['first name', 'first']) || ''} ${extractField(['last name', 'last', 'surname']) || ''}`.trim() ||
                      'Unknown';

    const clientEmail = extractField(['email', 'e-mail', 'email address', 'contact email'], 'email');
    const clientPhone = extractField(['phone', 'mobile', 'cell', 'telephone', 'phone number'], 'phone');

    // Build comprehensive transcript
    const transcript = answers
      .filter(answer => answer.field?.title) // Only include answers with questions
      .map(answer => {
        const question = answer.field.title;
        let response = '';
        
        // Handle different answer types
        if (answer.text) response = answer.text;
        else if (answer.email) response = answer.email;
        else if (answer.phone_number) response = answer.phone_number;
        else if (answer.choice) response = answer.choice.label;
        else if (answer.choices) response = answer.choices.map(c => c.label).join(', ');
        else if (answer.number !== undefined) response = answer.number.toString();
        else if (answer.boolean !== undefined) response = answer.boolean ? 'Yes' : 'No';
        else if (answer.date) response = answer.date;
        else if (answer.url) response = answer.url;
        else if (answer.file_url) response = 'File uploaded';
        else if (answer.payment) response = `Payment: $${answer.payment.amount}`;
        
        return response ? `${question}: ${response}` : null;
      })
      .filter(Boolean) // Remove null entries
      .join('\n');

    // Prepare CheckinAI payload
    const checkinData = {
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      transcript: transcript || 'Form submitted (no text responses)',
      date: new Date().toISOString(),
      source: 'typeform',
      
      // Metadata for tracking
      form_id: formResponse.form_id,
      response_id: formResponse.token,
      submitted_at: formResponse.submitted_at,
      
      // Tags for organization
      tags: ['typeform', 'form_submission'],
      
      // Store original data for reference
      raw_data: {
        form_response: formResponse,
        form_title: steps.trigger.event.form_title || 'Typeform Submission'
      }
    };

    console.log('Sending check-in data to CheckinAI:', {
      client_name: checkinData.client_name,
      client_email: checkinData.client_email,
      has_transcript: !!checkinData.transcript,
      form_id: checkinData.form_id
    });

    // Send to CheckinAI
    try {
      const response = await fetch(this.checkinai_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Pipedream-Typeform-CheckinAI/1.0'
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