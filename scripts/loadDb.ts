import { DataAPIClient } from '@datastax/astra-db-ts';
import { PuppeteerWebBaseLoader } from '@langchain/community/document_loaders/web/puppeteer';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { GoogleGenAI } from '@google/genai';

import 'dotenv/config';

type SimilarityMetric = 'dot_product' | 'cosine' | 'euclidean';

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  GOOGLE_API_KEY,
} = process.env;

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY! });

// Pause execution for the given number of milliseconds
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Embed with automatic retry on 429 (rate limit) using exponential backoff
async function embedWithRetry(text: string, attempt = 1): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
    });
    return response.embeddings?.[0]?.values ?? [];
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    if (status === 429 && attempt <= 5) {
      // Parse retryDelay from error details if available, otherwise use exponential backoff
      const retryAfterMs = (err?.message?.match(/\d+\.\d+s/) 
        ? parseFloat(err.message.match(/(\d+\.\d+)s/)[1]) * 1000 
        : Math.pow(2, attempt) * 10000); // 20s, 40s, 80s...
      console.log(`⏳ Rate limit hit. Waiting ${Math.round(retryAfterMs / 1000)}s before retry (attempt ${attempt}/5)...`);
      await sleep(retryAfterMs + 2000); // add 2s buffer
      return embedWithRetry(text, attempt + 1);
    }
    throw err;
  }
}

const f1Data = [
  'https://en.wikipedia.org/wiki/Chess_opening',
  'https://en.wikibooks.org/wiki/Chess_Opening_Theory',
  'https://en.wikipedia.org/wiki/List_of_chess_players',
  'https://en.wikipedia.org/wiki/World_Chess_Championship',
  'https://simple.wikipedia.org/wiki/List_of_World_Chess_Champions',
  'https://en.wikipedia.org/wiki/Chess',
  'https://en.wikipedia.org/wiki/List_of_chess_games',
  'https://www.chess.com/article/view/the-best-chess-games-of-all-time',
  'https://www.wikihow.com/Play-Chess',
  'https://en.wikipedia.org/wiki/List_of_chess_players_by_peak_FIDE_rating',
  'https://en.wikipedia.org/wiki/Comparison_of_top_chess_players_throughout_history',
];

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!);
const db = client.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE! });

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100,
});

const createCollection = async (
  similarityMetric: SimilarityMetric = 'dot_product'
) => {
  const res = await db.createCollection(ASTRA_DB_COLLECTION!, {
    vector: {
      dimension: 3072, // gemini-embedding-001 outputs 3072-dimensional vectors
      metric: similarityMetric,
    },
  });

  console.log('Collection created:', res);
};

const loadSampleData = async () => {
  const collection = await db.collection(ASTRA_DB_COLLECTION!);
  for await (const url of f1Data) {
    const content = await scrapePage(url);
    const chunks = await splitter.splitText(content);
    for await (const chunk of chunks) {
      const vector = await embedWithRetry(chunk);

      await collection.insertOne({
        $vector: vector,
        text: chunk,
      });

      console.log(`Inserted chunk from ${url}`);

      // Throttle: 200ms between requests (~5 req/s) to stay well under rate limits
      await sleep(200);
    }
  }
};

const scrapePage = async (url: string) => {
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: true,
    },
    gotoOptions: {
      waitUntil: 'domcontentloaded',
    },
    evaluate: async (page, browser) => {
      const result = await page.evaluate(() => document.body.innerHTML);
      await browser.close();
      return result;
    },
  });
  return (await loader.scrape())?.replace(/<[^>]*>?/gm, '');
};

createCollection().then(() => loadSampleData());