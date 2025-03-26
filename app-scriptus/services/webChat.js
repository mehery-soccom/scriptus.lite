const { sebChatSchema, webChatSchema } = require("../models/WebChatModel");
// const { openai } = require("../models/clients");
const mongon = require("@bootloader/mongon");
const OpenAIService = require("../../@core/scriptus/clients/OpenAIService")
async function saveConversation(convo) {
  const WebChat = mongon.model(webChatSchema);
  const newWebChat = new WebChat(convo);
  const savedChat = await newWebChat.save();
  return savedChat;
}
/**
 * Retrieves the 5 most recent web chats for a specific contact
 * @param {string} contactId - The ID of the contact to retrieve chats for
 * @returns {Promise<Array>} Array of recent web chats with selected fields
 */
async function getRecentWebChats(sessionId) {
  try {
    const WebChat = mongon.model(webChatSchema);
    const recentChats = await WebChat.find(
      { sessionId },
      {
        // Explicitly select only the desired fields
        contactId: 1,
        messages: 1,
        timestamp: 1,
        rephrasedQuestion: 1,
        _id: 0,
      }
    )
      .sort({ timestamp: 1 }) // Sort by most recent first
      .limit(5); // Limit to 5 most recent chats

    return recentChats;
  } catch (error) {
    console.error("Error retrieving recent web chats:", error);
    throw error; // Re-throw to allow caller to handle
  }
}
/**
 * Formats chat history into a string for context
 * @param {Array} chats - Array of chat objects
 * @returns {string} Formatted chat history
 */
function formatChatHistory(chats) {
  return chats
    .map((chat, index) => {
      const date = new Date(chat.timestamp).toLocaleString();
      return `Conversation ${index + 1} (${date}):\nUser: ${chat.rephrasedQuestion}\nAssistant: ${
        chat.messages.assistant
      }\n`;
    })
    .join("\n");
}

function formatChatHistoryForIntent(chats){
  const arr = [];
  chats
    .slice(2) // Skip the first 2 elements
    .forEach((chat) => { // Use forEach instead of map to push into the array
      arr.push({ role: "user", content: chat.rephrasedQuestion });
      arr.push({ role: "assistant", content: chat.messages.assistant });
    });
  return arr;
}
/**
 * Rephrases the current user question using OpenAI based on chat history
 * @param {string} contactId - User's contact ID
 * @param {string} currentQuestion - The current question from the user
 * @returns {Promise<string>} The rephrased question
 */
async function rephraseWithContext(currentQuestion, rawHistory) {
  try {
    // Get recent chat history
    // console.log(`in rephraser : ${sessionId}`);
    console.log(`in rephraser : ${currentQuestion}`);
    // const recentChats = await getRecentWebChats(sessionId);
    // console.log(`recent chats : ${JSON.stringify(recentChats)}`);
    if (rawHistory.length === 0) return currentQuestion;
    // Format chat history as string
    const chatHistoryString = formatChatHistory(rawHistory);

    // Construct the system and user messages
    // const systemPrompt = `
    // Your task is to rephrase the user's current question in a context-aware manner using the provided chat history.
    
    // ### Rephrasing Rules:
    // - If the question is about sending money (charges, deductions, transfer, etc.), always infer the **latest country** from chat history — even if earlier contexts mention a different country.
    // - Ignore frequency of mentions; always prioritize the **most recent country** in context.
    // - If the user's question is about services, products, or remittance methods (like Visa card, bank deposit), do NOT inject any country unless explicitly mentioned.
    // - Avoid hallucinating or assuming context beyond chat history.
    // - Never provide an answer — only output the rephrased question.
    
    // ### Conflict Resolution:
    // - If multiple countries appear in the chat history, always default to the **latest mentioned country**.
    // - If no country is mentioned, leave the question unchanged.
    
    // ### Examples:
    // - Q: What are the charges for sending money?  
    //   ✅ Rephrased: What are the charges for sending money to Bhutan?
    
    // - Q: What is Visa card remittance service?  
    //   ✅ Rephrased: What is Visa card remittance service? (Do not inject any country)
    // `;
    const systemPrompt = `Your task is to rephrase the user's current question in a context-aware manner using the provided chat history.  

### **Rephrasing Rules:**  
- If the question **explicitly mentions a country**, keep that country unchanged.  
- If no country is mentioned, infer the **most recent country from chat history** and insert it.  
- If the question is about services, products, or remittance methods (Visa card, bank deposit), **do NOT inject any country** unless explicitly mentioned.  
- Never hallucinate or assume context beyond chat history.  
- Never modify a country that the user **explicitly states in the question**.  

### **Conflict Resolution:**  
- If the user's question and chat history contain different countries, **use the one in the current question**.  
- If no country is mentioned, default to the **most recently mentioned country in chat history**.  
- If multiple countries appear in chat history, choose the **latest one mentioned**.  

### **Examples:**  
#### ✅ Correct Behavior:  
- **Q: What are the charges for sending money?**  
  **Rephrased:** "What are the charges for sending money to Bhutan?" *(Uses latest country from chat history)*  

- **Q: Can I send money to Bangladesh?**  
  **Rephrased:** "Can I send money to Bangladesh?" *(User explicitly mentioned it—do not override!)*  

- **Q: What is Visa card remittance service?**  
  **Rephrased:** "What is Visa card remittance service?" *(No country added unless explicitly mentioned)*  
`
//     const userPrompt = `
// ### Chat History
// ${chatHistoryString}

// ### Current User Question
// ${currentQuestion}

// Rephrase the user's question using the provided context.

// - If the question is about sending money (charges, deductions, transfer, etc.), use the most recent country in context — even if older countries exist.
// - If the question is about services, products, or remittance methods (like Visa card, bank deposit), do NOT inject any country unless explicitly mentioned.
// - Always prioritize the user's intent and keep the question clear and concise.
// - Avoid fabricating information or assuming context where none exists.
// - In case of conflicting countries, default to the latest mentioned country.
// `;
    const userPrompt = `### Chat History  
${chatHistoryString}  

### Current User Question  
${currentQuestion}  

Rephrase the user's question using the provided context.  

- **If the user explicitly states a country, do NOT change it.**  
- **If no country is mentioned, use the most recent one from chat history.**  
- If the question is about services, products, or remittance methods, do NOT inject any country unless explicitly mentioned.  
- Prioritize user intent and clarity while ensuring the question remains concise.  
- Avoid fabricating information or assuming context where none exists.  
- In case of conflicting countries, **default to the country mentioned in the user's latest question**.  
`
    console.log(`rephrase user prompt : ${userPrompt}`);
    // Make API call to OpenAI
    let service = new OpenAIService({ useGlobalConfig : true })
    let { client:openai , config } = await service.init()
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Or another model like gpt-3.5-turbo
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more focused output
      max_tokens: 150, // Limit tokens for concise rephrasing
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rephrase_question_response",
          schema: {
            type: "object",
            properties: {
              rephrasedQuestion: { type: "string" },
            },
            required: ["rephrasedQuestion"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    });

    // Extract the rephrased question
    // const rephrasedQuestion = completion.choices[0].message.content.trim();

    const rephrasedQuestion = JSON.parse(completion.choices[0].message.content).rephrasedQuestion;
    console.log(`Original: "${currentQuestion}"\nRephrased: "${rephrasedQuestion}"`);
    console.log(completion.usage);
    return rephrasedQuestion;
  } catch (error) {
    console.error("Error rephrasing question:", error);
    return currentQuestion; // Fall back to original question on error
  }
}

module.exports = { getRecentWebChats, rephraseWithContext , saveConversation , formatChatHistoryForIntent , formatChatHistory };
