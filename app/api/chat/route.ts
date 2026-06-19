import { GoogleGenAI } from '@google/genai';
import { DataAPIClient } from '@datastax/astra-db-ts';

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  GOOGLE_API_KEY,
} = process.env;

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY! });

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!);
const db = client.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE! });

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1]?.content;

    let docContext = '';

    // gemini-embedding-001 works on v1beta — no API version workaround needed
    const embeddingResponse = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: latestMessage,
    });

    const embeddingValues = embeddingResponse.embeddings?.[0]?.values ?? [];

    try {
      const collection = await db.collection(ASTRA_DB_COLLECTION!);
      const cursor = collection.find({}, {
        sort: { $vector: embeddingValues },
        limit: 10,
      });

      const documents = await cursor.toArray();
      const docsMap = documents?.map((doc) => doc.text);
      docContext = JSON.stringify(docsMap);
    } catch (err) {
      console.log('Error querying DB:', err);
      docContext = '';
    }

    const conversationHistory = messages
      .map((msg: any) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const prompt = `
You are an AI assistant who knows everything about **Chess**.

Use the context below to help answer the question. The context may contain Wikipedia data, chess articles, and recent updates.

If the context doesn't help, use your own knowledge. Always format your answers using **Markdown** and avoid returning any images.

---

## 📄 Context

\`\`\`
${docContext}
\`\`\`

---

## 💬 Conversation History

${conversationHistory}

---

## 🧠 Instructions

- Respond in a clear and structured way.
- Use **lists**, **bold**, and **headings** where helpful.
- Format rules or definitions in **bullet points** or tables if needed.
- Consider the full conversation history when responding.
- Only respond to the latest message, but use previous context for better understanding.
`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = result.text ?? '';

    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error: any) {
    console.error('Error handling POST:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}