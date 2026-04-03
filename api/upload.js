export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;
  
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { 
        'authorization': ASSEMBLY_KEY,
        'content-type': 'application/octet-stream'
      },
      body: buffer
    });
    
    const data = await uploadRes.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
