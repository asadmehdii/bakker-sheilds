// Pipedream Workflow: JotForm → CheckinAI
// Copy this code into a new Pipedream workflow

export default defineComponent({
  name: "jotform-to-checkinai",
  version: "0.1.0",
  props: {
    jotform: {
      type: "app",
      app: "jotform",
    },
    checkinai_webhook_url: {
      type: "string",
      label: "CheckinAI Webhook URL",
      description: "Format: https://your-supabase-url.supabase.co/functions/v1/webhook-checkin/{coach_id}/{webhook_token}",
      secret: true
    }
  },
  async run({ steps, $ }) {
    const formData = steps.trigger.event;
    
    // JotForm sends data with field IDs, need to extract readable values
    const answers = formData.pretty || formData.rawRequest || formData;
    
    // Helper function to find field by common patterns
    const findFieldByPattern = (patterns) => {
      for (const [key, value] of Object.entries(answers)) {
        const keyLower = key.toLowerCase();
        if (patterns.some(pattern => keyLower.includes(pattern.toLowerCase()))) {
          return value;
        }
      }
      return null;
    };
    
    // Extract client information
    const clientName = findFieldByPattern(['name', 'full name', 'first name', 'last name']) || 
                      `${answers['first name'] || ''} ${answers['last name'] || ''}`.trim() ||
                      'Unknown';
    
    const clientEmail = findFieldByPattern(['email', 'e-mail', 'email address']);
    const clientPhone = findFieldByPattern(['phone', 'mobile', 'cell', 'telephone']);
    
    // Build transcript from all form fields
    const transcript = Object.entries(answers)
      .filter(([key, value]) => 
        // Filter out JotForm metadata
        !key.startsWith('submission') && 
        !key.includes('id') &&
        key !== 'created_at' &&
        value !== null && 
        value !== undefined && 
        value !== ''
      )
      .map(([question, answer]) => {
        // Clean up question formatting
        const cleanQuestion = question.replace(/([A-Z])/g, ' $1').trim();
        return `${cleanQuestion}: ${answer}`;
      })
      .join('\n');
    
    // Prepare CheckinAI payload
    const checkinData = {
      client_name: clientName,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      transcript: transcript,
      date: new Date().toISOString(),
      source: 'jotform',
      form_id: formData.formID || null,
      submission_id: formData.submissionID || null,
      raw_data: formData // Store complete original data
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