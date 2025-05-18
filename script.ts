import * as fs from 'fs/promises';
import path from 'path';

// ------ SETTINGS ------
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_ID = 'openai/gpt-4.1-mini';
const COUNTRIES_PATH = path.join(__dirname, 'SampleCountries.json');
const SYSTEM_PROMPT = `You are a timezone file assistant. You will receive entries for countries as plain JSON objects, including name and country code. Only respond with the IANA timezone string for the main timezone of that country (for example: "Europe/Paris"). Do not provide any explanations. Only return the raw IANA timezone string. If there is more than one standard timezone, pick the capital's or most populous city's timezone.`;

interface CountryEntry {
  id: string;
  name: string;
  code: string; // ISO alpha-2
  createdAt: string;
  updatedAt: string;
  timezone?: string;
}

async function getCountryTimezone(country: CountryEntry): Promise<string> {
  // Prepare messages
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Country entry: ${JSON.stringify({ name: country.name, code: country.code })}` }
  ];
  // Compose API payload
  const payload = {
    model: MODEL_ID,
    messages,
    temperature: 0.0
  };
  // Make the API request
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://openrouter.ai/'
    },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  // Parse and return exact string
  if (!resp.ok || !data.choices || !data.choices[0] || !data.choices[0].message?.content) {
    console.error('LLM Error:', data);
    throw new Error('LLM did not return a valid timezone');
  }
  const timezoneRaw = data.choices[0].message.content.trim();
  // Defensive: never output empty strings
  if (!timezoneRaw || timezoneRaw.length < 3) {
    throw new Error(`Received strange timezone output: ${timezoneRaw}`);
  }
  // Only return 1st line, stripped of quotes
  return timezoneRaw.replace(/^"|"$/g, '').split('\n')[0];
}

async function main() {
  const raw = await fs.readFile(COUNTRIES_PATH, 'utf-8');
  const arr: CountryEntry[] = JSON.parse(raw);
  let writeCount = 0;
  for (let i = 0; i < arr.length; ++i) {
    const country = arr[i];
    try {
      process.stdout.write(`Processing ${country.name}... `);
      const timezone = await getCountryTimezone(country);
      arr[i].timezone = timezone;
      console.log(`✅ ${timezone}`);
      ++writeCount;
      // Optional: Write partially every N countries for large datasets
      if (writeCount % 10 === 0) {
        await fs.writeFile(COUNTRIES_PATH, JSON.stringify(arr, null, 2));
        console.log(`Checkpoint write at ${writeCount} entries.`);
      }
    } catch (err: any) {
      arr[i].timezone = '';
      console.error(`❌ (${country.name}): ${err.message}`);
    }
  }
  await fs.writeFile(COUNTRIES_PATH, JSON.stringify(arr, null, 2));
  console.log('\nAll done! Timezones should be updated in SampleCountries.json.');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
