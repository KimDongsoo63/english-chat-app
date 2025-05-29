import OpenAI from 'openai';
import { Message } from '../types/chat';

const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

const SYSTEM_PROMPT = `You are a friendly English conversation partner. 
Your goal is to help the user practice English conversation. 
Please follow these guidelines:
1. Keep responses conversational and natural
2. Gently correct any major grammar mistakes
3. Use simple, clear language
4. Ask follow-up questions to keep the conversation going
5. Be encouraging and supportive`;

export const sendMessage = async (messages: Message[]): Promise<string> => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ],
    });

    return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw error;
  }
}; 