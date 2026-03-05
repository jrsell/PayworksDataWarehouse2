import * as dotenv from 'dotenv'
import OpenAI from "openai";

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getAICompletion(systemPrompt, userPrompt) {
    const completion = await openai.chat.completions.create({
        messages: [
            { "role": "system", "content": systemPrompt },
            { "role": "user", "content": userPrompt }],
        model: "gpt-4.1-mini",
    });

    return completion.choices[0].message.content;
}

export function extractSQLCodeBlock(text) {
    const regex = /```sql\n([\s\S]+?)\n```/;
    const matches = text.match(regex);

    if (matches && matches.length > 1) {
        return matches[1]; // Extracted text inside the SQL code block
    } else {
        return null; // SQL code block not found or empty
    }
}
//main();