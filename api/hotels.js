// Vercel serverless function: GET/PUT the shared hotel list.
// Persistence model: data/hotels.json in this GitHub repo, read and written
// through the GitHub Contents API. No database, no login — anyone hitting
// this endpoint reads/writes the same file. Concurrent writes are
// last-write-wins on the full `hotels` array.

const GITHUB_API = 'https://api.github.com';
const FILE_PATH = 'data/hotels.json';

function isConfigured() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

function branch() {
  return process.env.GITHUB_BRANCH || 'main';
}

async function githubRequest(path, options = {}) {
  return fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
}

async function readFile() {
  const res = await githubRequest(
    `/repos/${process.env.GITHUB_REPO}/contents/${FILE_PATH}?ref=${branch()}`
  );
  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const content = Buffer.from(json.content, 'base64').toString('utf-8');
  return { data: JSON.parse(content), sha: json.sha };
}

async function writeFile(data, sha) {
  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf-8').toString(
    'base64'
  );
  const res = await githubRequest(`/repos/${process.env.GITHUB_REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Update hotel tracker (${data.hotels.length} stays)`,
      content,
      sha,
      branch: branch(),
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (!isConfigured()) {
    res.status(503).json({
      error: 'not_configured',
      message: 'GITHUB_TOKEN / GITHUB_REPO env vars are not set on this deployment.',
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      const { data } = await readFile();
      res.status(200).json(data);
      return;
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.hotels)) {
        res.status(400).json({ error: 'invalid_payload', message: 'Body must include a hotels array.' });
        return;
      }
      const { data: current, sha } = await readFile();
      const updated = {
        ...current,
        hotels: body.hotels,
        updated_at: body.updated_at || new Date().toISOString(),
      };
      await writeFile(updated, sha);
      res.status(200).json(updated);
      return;
    }

    res.setHeader('Allow', 'GET, PUT, PATCH');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
}
