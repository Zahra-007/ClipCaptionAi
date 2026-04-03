export const config = { api: { bodyParser: true } };

const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audio_url } = req.body;
  if (!audio_url) return res.status(400).json({ error: 'No audio_url provided' });

  try {
    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { authorization: ASSEMBLY_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ audio_url, punctuate: true })
    });
    const transcript = await transcriptRes.json();
    if (!transcript.id) return res.status(500).json({ error: 'Failed to start transcription' });

    res.status(200).json({ job_id: transcript.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
