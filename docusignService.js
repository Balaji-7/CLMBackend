require('dotenv').config();
const fs = require('fs');
const docusign = require('docusign-esign');

// const privateKey = fs.readFileSync(process.env.DOCUSIGN_PRIVATE_KEY_PATH);
const privateKey = process.env.DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, '\n');
const supabase = require('./supabaseService');

async function getAccessToken() {
  const jwtLifeSec = 10 * 60; // 10 minutes

  const dsApiClient = new docusign.ApiClient();
  dsApiClient.setOAuthBasePath(process.env.DOCUSIGN_AUTH_SERVER);

  const results = await dsApiClient.requestJWTUserToken(
    process.env.DOCUSIGN_INTEGRATION_KEY,
    process.env.DOCUSIGN_USER_ID,
    'signature impersonation',
    privateKey,
    jwtLifeSec
  );

  return results.body.access_token;
}

// async function createEnvelope(data) {
//   const accessToken = await getAccessToken();

//   const dsApiClient = new docusign.ApiClient();
//   dsApiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH);
//   dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

//   const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

//   const envelopeDefinition = new docusign.EnvelopeDefinition();
//   envelopeDefinition.templateId = process.env.DOCUSIGN_TEMPLATE_ID;
//   envelopeDefinition.status = "sent";

//   const templateRole = new docusign.TemplateRole();
//   templateRole.email = data.clientEmail;
//   templateRole.name = data.clientName;
//   templateRole.roleName = "Client";

//   templateRole.tabs = {
//     textTabs: [
//       { tabLabel: "Agreement Title", value: data.title },
//       { tabLabel: "Agreement Date", value: data.startDate },
//       { tabLabel: "Contract Value", value: data.contractValue }
//     ]
//   };

//   envelopeDefinition.templateRoles = [templateRole];

//   const results = await envelopesApi.createEnvelope(
//     process.env.DOCUSIGN_ACCOUNT_ID,
//     { envelopeDefinition }
//   );

//   return results;
// }

// ------------------ CREATE ENVELOPE + SIGN URL ------------------

async function createEnvelope(data) {
  const accessToken = await getAccessToken();

  const dsApiClient = new docusign.ApiClient();
  dsApiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH);
  dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  // 1️⃣ Create Envelope
  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.templateId = process.env.DOCUSIGN_TEMPLATE_ID;
  envelopeDefinition.status = "sent";

  const templateRole = new docusign.TemplateRole();
  templateRole.email = data.clientEmail;
  templateRole.name = data.clientName;
  templateRole.roleName = "Client";
  templateRole.clientUserId = "1000"; // IMPORTANT for embedded signing

  // Use a structured approach for tabs
const tabs = docusign.Tabs.constructFromObject({
  textTabs: [
    { tabLabel: "Agreement Title", value: data.title },
    { tabLabel: "Agreement Date", value: data.startDate },
    { tabLabel: "Contract Value", value: data.contractValue },
    { tabLabel: "Client Name", value: data.clientName }
  ]
});

  templateRole.tabs = tabs

  envelopeDefinition.templateRoles = [templateRole];

  const envelopeResults = await envelopesApi.createEnvelope(
    process.env.DOCUSIGN_ACCOUNT_ID,
    { envelopeDefinition }
  );
  const envelopeId = envelopeResults.envelopeId;

  // 🔥 SAVE TO SUPABASE (RIGHT HERE)
  const { error } = await supabase.from('contracts').insert([
    {
      envelope_id: envelopeId,
      client_name: data.clientName,
      client_email: data.clientEmail,
      title: data.title,
      contract_value: data.contractValue,
      status: envelopeResults.status
    }
  ]);

  if (error) {
    console.error("Supabase Insert Error:", error);
  }

  // 2️⃣ Create Embedded Signing URL
  const viewRequest = new docusign.RecipientViewRequest();
  viewRequest.returnUrl = "http://localhost:4200/signing-complete";
  viewRequest.authenticationMethod = "none";
  viewRequest.email = data.clientEmail;
  viewRequest.userName = data.clientName;
  viewRequest.clientUserId = "1000";

  const viewResults = await envelopesApi.createRecipientView(
    process.env.DOCUSIGN_ACCOUNT_ID,
    envelopeId,
    { recipientViewRequest: viewRequest }
  );

  return {
    envelopeId,
    signingUrl: viewResults.url
  };
}


module.exports = { createEnvelope };
