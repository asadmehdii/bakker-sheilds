// Pipedream Workflow: Typeform → CheckinAI
// Copy this code into a new Pipedream workflow

export default defineComponent({
  name: "typeform-to-checkinai",
  version: "0.1.0",
  props: {
    typeform: {
      type: "app",
      app: "typeform",
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
      description: "Map Typeform field refs to CheckinAI fields",
      default: {
        name_field: "name",
        email_field: "email", 
        phone_field: "phone"
      }
    }
  },
  async run({ steps, $ }) {
    const formResponse = steps.trigger.event.form_response;
    const answers = formResponse.answers;
    
    // Helper function to find answer by field ref
    const findAnswer = (fieldRef) => {
      return answers.find(a => 
        a.field.ref === fieldRef || 
        a.field.title.toLowerCase().includes(fieldRef.toLowerCase())
      );
    };
    
    // Extract client data
    const nameAnswer = findAnswer(this.field_mappings.name_field);
    const emailAnswer = findAnswer(this.field_mappings.email_field);
    const phoneAnswer = findAnswer(this.field_mappings.phone_field);
    
    // Build transcript from all answers
    const transcript = answers.map(answer => {
      const question = answer.field.title;
      let response = '';
      
      if (answer.text) response = answer.text;
      else if (answer.email) response = answer.email;
      else if (answer.phone_number) response = answer.phone_number;
      else if (answer.choice) response = answer.choice.label;
      else if (answer.choices) response = answer.choices.map(c => c.label).join(', ');
      else if (answer.number) response = answer.number.toString();
      else if (answer.boolean !== undefined) response = answer.boolean ? 'Yes' : 'No';
      else if (answer.date) response = answer.date;
      
      return `${question}: ${response}`;
    }).join('\n');
    
    // Prepare CheckinAI payload
    const checkinData = {
      client_name: nameAnswer?.text || 'Unknown',
      client_email: emailAnswer?.email || null,
      client_phone: phoneAnswer?.phone_number || null,
      transcript: transcript,
      date: new Date().toISOString(),
      source: 'typeform',
      form_id: formResponse.form_id,
      response_id: formResponse.token,
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