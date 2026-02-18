require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createEnvelope } = require('./docusignService');
const supabase = require('./supabaseService');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/send-contract', async (req, res) => {
  try {
    const result = await createEnvelope(req.body);
    res.json(result);
  } catch (error) {

    console.error("FULL ERROR:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});
app.post('/docusign-webhook', async (req, res) => {
  try {
    console.log("Webhook received:", JSON.stringify(req.body, null, 2));

    const envelopeId = req.body?.data?.envelopeId;
    const status = req.body?.data?.envelopeSummary?.status;

    if (!envelopeId) {
      console.log("No envelopeId found");
      return res.status(200).send("No envelopeId");
    }

    await supabase
      .from('contracts')
      .update({
        status: status,
        updated_at: new Date()
      })
      .eq('envelope_id', envelopeId);

    console.log("Updated contract:", envelopeId, status);

    res.status(200).send("OK");

  } catch (error) {
    console.error("Webhook error:", error);
    res.status(200).send("Error handled"); 
    // IMPORTANT: still return 200 so DocuSign stops retrying
  }
});


app.get('/contracts', async (req, res) => {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json(error);

  res.json(data);
});
app.get('/contracts/:envelopeId', async (req, res) => {
  const { envelopeId } = req.params;

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('envelope_id', envelopeId)
    .single();

  if (error) return res.status(500).json(error);

  res.json(data);
});

app.post('/test-supabase', async (req, res) => {
  try {
    const { name, email } = req.body;

    const { data, error } = await supabase
      .from('contracts')
      .insert([
        {
          envelope_id: "test-envelope-123",
          client_name: name,
          client_email: email,
          status: 'testing'
        }
      ])
      .select();

    if (error) {
      return res.status(400).json({ error });
    }

    res.json({
      message: 'Inserted successfully',
      data
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Server running on 3000'));
