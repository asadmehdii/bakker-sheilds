// Update Google Forms integration to include user ID in form URL
// This will be added to IntegrationSetupModal.tsx

// Add this function to handle Google Forms with user ID
const handleGoogleFormsConnect = async () => {
  if (!user) {
    console.error('User not authenticated');
    return;
  }

  setIsConnecting(true);

  try {
    // Create integration record first
    const result = await userService.createIntegration({
      type: 'google_forms',
      name: integrationName || 'Google Forms',
      config: {
        user_id: user.id, // Store user ID in config
        created_at: new Date().toISOString()
      }
    });

    if (result.success && result.integration) {
      // Generate Google Form URL with user ID as hidden field
      const formUrl = `https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?entry.USER_ID=${user.id}`;
      
      // Show success message with instructions
      alert(`✅ Google Forms integration created!
      
📋 Next Steps:
1. Create a Google Form
2. Add a hidden field with your user ID: ${user.id}
3. Connect your form to Pipedream
4. Use the dynamic Pipedream code provided

Your User ID: ${user.id}`);

      onSave(result.integration);
      onClose();
    } else {
      throw new Error(result.error || 'Failed to create integration');
    }
  } catch (error) {
    console.error('Error creating Google Forms integration:', error);
    alert('Failed to create Google Forms integration. Please try again.');
  } finally {
    setIsConnecting(false);
  }
};

// Update the Google Forms form URL generation in FormSelectionDropdown.tsx
const generateGoogleFormUrl = (formId: string, userId: string) => {
  // Add user ID as a hidden field parameter
  return `https://docs.google.com/forms/d/e/${formId}/viewform?entry.USER_ID=${userId}`;
};

// In FormSelectionDropdown.tsx, update the Google Forms case:
case 'google_forms':
  // Get real submission count from checkins table for Google Forms
  const { data: allGoogleCheckins } = await supabase
    .from('checkins')
    .select('id, date, raw_data')
    .eq('coach_id', user.id)
    .order('date', { ascending: false });

  // Filter by source in JavaScript
  const googleCheckins = allGoogleCheckins?.filter(checkin => 
    checkin.raw_data?.source === 'google_forms'
  ) || [];

  const googleCount = googleCheckins.length;
  const lastGoogleSubmission = googleCheckins[0]?.date;

  realForms = [
    {
      id: '1FAIpQLSfsSLkDRf6KVdBs_psdoaTaNrlAcikzL33FptG8CGZrb878_w',
      name: 'Client Check-in Form',
      url: generateGoogleFormUrl('1FAIpQLSfsSLkDRf6KVdBs_psdoaTaNrlAcikzL33FptG8CGZrb878_w', user.id),
      submission_count: googleCount,
      last_submission: lastGoogleSubmission
    }
  ];
  break;
