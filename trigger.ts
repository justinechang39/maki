// trigger.ts - Script to update SampleCountries timezone in remote database
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Interface for Country data
interface Country {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  timezone: string;
}

// Function to read countries data from JSON file
async function readCountriesData(): Promise<Country[]> {
  const filePath = path.join(__dirname, 'SampleCountries.json');
  const data = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(data) as Country[];
}

// Function to update a single country's timezone in the database
async function updateCountryTimezone(country: Country, prisma: PrismaClient): Promise<void> {
  try {
    console.log(`Updating timezone for ${country.name} (${country.id}) to ${country.timezone}...`);
    
    // Update the timezone in the SampleCountries table
    await prisma.sampleCountries.update({
      where: { id: country.id },
      data: { timezone: country.timezone }
    });
    
    console.log(`✓ Successfully updated timezone for ${country.name}`);
  } catch (error) {
    console.error(`Error updating timezone for ${country.name}:`, error);
  }
}

// Main function to process countries one at a time
async function main() {
  if (process.argv.length < 3) {
    console.error('Please provide the database URL as an argument');
    console.error('Usage: node trigger.js <database-url>');
    process.exit(1);
  }
  
  const databaseUrl = process.argv[2];
  console.log(`Using database URL: ${databaseUrl.replace(/:\/\/.*?:.*?@/, '://[username]:[password]@')}`);
  
  // Create a new Prisma client with the provided database URL
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  
  try {
    // Read countries data
    const countries = await readCountriesData();
    console.log(`Found ${countries.length} countries in the data file.`);
    
    // Process one country at a time
    for (const country of countries) {
      await updateCountryTimezone(country, prisma);
      
      // Add a small delay between requests to avoid overloading the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('All countries processed successfully!');
  } catch (error) {
    console.error('Error processing countries:', error);
  } finally {
    // Disconnect from the database
    await prisma.$disconnect();
  }
}

// Run the main function
main().catch(async (e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});