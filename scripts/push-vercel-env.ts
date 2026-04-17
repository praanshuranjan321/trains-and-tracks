import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const envVars = new Map<string, string>();
for (const rawLine of envText.split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  envVars.set(m[1], val);
}

const EXCLUDE = new Set([
  'SUPABASE_ACCESS_TOKEN',
  'VERCEL_TOKEN',
  'GITHUB_TOKEN',
  'DIRECT_URL',
]);

const project = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8')) as {
  projectId: string;
  orgId: string;
};
const VERCEL_TOKEN = envVars.get('VERCEL_TOKEN');
if (!VERCEL_TOKEN) {
  console.error('VERCEL_TOKEN missing from .env.local');
  process.exit(1);
}

async function push(key: string, value: string) {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${project.projectId}/env?teamId=${project.orgId}&upsert=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        target: ['production', 'preview'],
        type: 'encrypted',
      }),
    },
  );
  const body = await res.text();
  if (res.ok) {
    console.log(`PASS: ${key}`);
  } else {
    console.log(`FAIL: ${key} — ${res.status} ${body.slice(0, 120)}`);
  }
}

(async () => {
  const keys = Array.from(envVars.keys()).filter((k) => !EXCLUDE.has(k));
  console.log(`Pushing ${keys.length} vars to project ${project.projectId}`);
  for (const k of keys) {
    await push(k, envVars.get(k)!);
  }
})();
