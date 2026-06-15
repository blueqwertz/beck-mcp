import { BeckClient } from './beck-client';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const username = process.env.BECK_USERNAME;
  const password = process.env.BECK_PASSWORD;

  if (!username || !password) {
    console.error('ERROR: BECK_USERNAME and BECK_PASSWORD environment variables are not set.');
    console.error('Create a .env file with your credentials to run this test.');
    process.exit(1);
  }

  console.log('Initializing client and logging in...');
  const client = new BeckClient(username, password);

  try {
    await client.initialize();
    console.log('Initialization and login completed.');

    const query = 'NIS-2';
    console.log(`Running search test for "${query}"...`);
    const results = await client.search(query);
    console.log(`Found ${results.length} results.`);

    if (results.length > 0) {
      console.log('First search result:', JSON.stringify(results[0], null, 2));

      const firstVpath = results[0].vpath;
      console.log(`Running getDocument test for vpath: "${firstVpath}"...`);
      const doc = await client.getDocument(firstVpath);
      console.log('Document fetched successfully!');
      console.log('Title:', doc.title);
      console.log('Citation:', doc.citation || 'None');
      console.log('Content preview (first 500 chars):\n');
      console.log(doc.markdownContent.substring(0, 500));
      console.log('\n...');
    } else {
      console.log('No search results found to test document fetching.');
    }
  } catch (error) {
    console.error('Test encountered an error:', error);
  } finally {
    console.log('Closing client...');
    await client.close();
    console.log('Client closed.');
  }
}

main();
