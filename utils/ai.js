const { GoogleGenAI } = require('@google/genai');

/**
 * Generates an AI market analysis based on live price data.
 * @param {Object} rawPriceData - Live price data from CoinGecko
 * @returns {Promise<Array>} - Array of 3 formatted pick objects
 */
async function generateMarketAnalysis(rawPriceData) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables.');
    }

    const ai = new GoogleGenAI({ apiKey });

    // Format the prompt
    const prompt = `
      You are an elite cryptocurrency trading AI oracle. 
      Analyze the following current market data for top cryptocurrencies:
      ${JSON.stringify(rawPriceData)}
      
      Pick the top 3 best cryptocurrencies to invest in right now based on this data. 
      For each pick, you must provide:
      1. id: the lowercase coin id (e.g. "bitcoin")
      2. symbol: the uppercase symbol (e.g. "BTC")
      3. name: The full name of the coin
      4. score: A score out of 100 representing confidence
      5. risk: "Low", "Medium", or "High"
      6. momentum: A short 3-5 word string describing the trend (e.g. "Bullish breakout expected")
      
      You must respond ONLY with a valid JSON array containing exactly 3 objects with these exact keys. 
      Do not include any markdown formatting like \`\`\`json. Just the raw JSON string.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const textResponse = response.text().trim();
    
    // Attempt to parse the JSON. 
    // Sometimes the model can still wrap it in markdown despite instructions.
    let jsonStr = textResponse;
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    
    const picks = JSON.parse(jsonStr.trim());
    return picks;

  } catch (error) {
    console.error('Gemini AI Generation Error:', error.message);
    throw error;
  }
}

module.exports = {
  generateMarketAnalysis
};
