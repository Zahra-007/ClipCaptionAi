const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing job id' });

  try {
    const r = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: ASSEMBLY_KEY }
    });
    const data = await r.json();

    if (data.status === 'error') return res.json({ status: 'error', error: data.error });
    if (data.status !== 'completed') return res.json({ status: 'processing' });

    // Return SRT subtitle data for client-side rendering
    const srtRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}/srt`, {
      headers: { authorization: ASSEMBLY_KEY }
    });
    const srt = await srtRes.text();

    res.json({ status: 'done', transcript: data, srt });
  } catch(e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
}
