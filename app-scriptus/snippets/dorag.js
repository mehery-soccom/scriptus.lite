import ajax from "../../@core/ajax";
import ChainedPromise from "../../@core/lib/ChainedPromise";
import { webChatSchema } from "../models/WebChatModel";
import { collection_name } from "../models/clients";
import { vectorDb } from "../models/clients"
import { MetricType } from "@zilliz/milvus2-sdk-node";
import { getExeTime } from "../../@core/utils/exetime";
import mongon from "@bootloader/mongon";
import { context } from "@bootloader/utils";
const OpenAIService = require("../../@core/scriptus/clients/OpenAIService")

async function generateEmbeddingOpenAi(text, dims = 512) {
  try {
    let service = new OpenAIService({ useGlobalConfig : true })
    let { client:openai , config } = await service.init()
    let start = Date.now();
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small", // You can replace with your preferred embedding model
      input: text,
      encoding_format: "float",
      dimensions: dims,
    });
    await getExeTime("getEmbeddingOpenAi", start);
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding with open ai:", error);
    throw error;
  }
}

async function information_not_available() {
  return `Information you are asking for is not available currently.
  For more information: You can WhatsApp or Call us: +965 1840 123. 
  For more information, please contact us on 1840123 . 
  You can reach out to us on email: Help@almullaexchange.com.
  For better understanding of your query we will transfer to agent.`;
}

async function getModelResponse(relevantInfo, rephrasedQuestion,bot_introduction) {
  let start = Date.now();
  const systemPrompt = `${bot_introduction}
- If the retrieved information contains an answer that matches the meaning of the user's question, respond using that information.  
- If the wording differs but the meaning is the same, still answer using the retrieved data.  
- If no relevant information is found, trigger information_not_available() function provided as a tool.  
- Do not require an exact wording match to provide an answer.  
- Do not omit any information while answering.
Never invent information. Prioritize using retrieved knowledge.`;
  const userPrompt = `
### Relevant Information
${relevantInfo}

### User Question
${rephrasedQuestion}

Answer the user's question using **the most relevant retrieved information from the Relevant Information above**.  
- If a retrieved FAQ answers the question (even if wording differs), provide that answer.  
- If no relevant information is found, trigger 'information_not_available()' function provided as tool.`;
  // console.log(`SYStem prompt : ${systemPrompt}`);
  console.log(`user prompt  : ${userPrompt}`);
  let service = new OpenAIService({ useGlobalConfig : true })
  let { client:openai , config } = await service.init()
  const completion = await openai.chat.completions.create({
    model: "ft:gpt-4o-mini-2024-07-18:personal:remittance-bot-v2:B4QmFVQU",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "information_not_available",
          description: "Generates a default information_not_available message",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    ],
    tool_choice: "auto",
  });
  console.log(`answer final content : ${completion.choices[0].message.content}`);
  // console.log(`answer final func : ${completion.choices[0].message.tool_calls[0].function.name || null}`);

  if (completion.choices[0].message.content === null) {
    const ans = await information_not_available();
    const answer = {
      ans : ans,
      valid : false
    }
    console.log(completion.usage);
    await getExeTime("GPT", start);
    return answer;
  }

  console.log(completion.usage);
  await getExeTime("GPT", start);
  const answer = {
    ans : completion.choices[0].message.content , 
    valid : true 
  }
  return answer;
}

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
  if(chats.length >= 3){
    chats
    .slice(2) // Skip the first 2 elements
    .forEach((chat) => { // Use forEach instead of map to push into the array
      arr.push({ role: "user", content: chat.rephrasedQuestion });
      arr.push({ role: "assistant", content: chat.messages.assistant });
    });
  } else {
    chats
    .forEach((chat) => { // Use forEach instead of map to push into the array
      arr.push({ role: "user", content: chat.rephrasedQuestion });
      arr.push({ role: "assistant", content: chat.messages.assistant });
    });
  }
  
  return arr;
}
/**
 * Rephrases the current user question using OpenAI based on chat history
 * @param {string} contactId - User's contact ID
 * @param {string} currentQuestion - The current question from the user
 * @returns {Promise<string>} The rephrased question
 */
async function rephraseWithContext(currentQuestion, rawHistory, rephrasing_rules, rephrasing_conflict_resolution_rules, rephrasing_examples ) {
  try {
    // Get recent chat history
    // console.log(`in rephraser : ${sessionId}`);
    console.log(`in rephraser : ${currentQuestion}`);
    // const recentChats = await getRecentWebChats(sessionId);
    // console.log(`recent chats : ${JSON.stringify(recentChats)}`);
    if (rawHistory.length === 0) return currentQuestion;
    // Format chat history as string
    const chatHistoryString = formatChatHistory(rawHistory);
    
    const systemPrompt = `Your task is to rephrase the user's current question in a context-aware manner using the provided chat history.  
    ### **Rephrasing Rules:**
    ${rephrasing_rules}
    
    ### **Conflict Resolution:** 
    ${rephrasing_conflict_resolution_rules}

    ### **Examples:**  
    #### Correct Behavior:
    ${rephrasing_examples}
    `
    const userPrompt = `### Chat History  
${chatHistoryString}  

### Current User Question  
${currentQuestion}  
Rephrase the user's question using the provided context.

- Prioritize user intent and clarity while ensuring the question remains concise.  
- Avoid fabricating information or assuming context where none exists.`
// ${rephrase_user_prompt} 

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

async function semanticSearch(embedding, output_fields, field_name, topK = 2, filter = "") {
  try {
    let start = Date.now();

    // Perform vector similarity search
    const searchResult = await vectorDb.search({
      collection_name : collection_name,
      vector: embedding,
      filter: filter,
      field_name,
      limit: topK,
      output_fields,
      metric_type: MetricType.COSINE,
    });
    console.log(`SEARCH RESULTS : `, JSON.stringify(searchResult));
    await getExeTime("VectorSearch", start);
    return searchResult.results;
  } catch (error) {
    console.error("Error performing semantic search:", error);
    throw error;
  }
}

async function performRag(rephrasedQuestion) {
  try {
    // 1. Generate embedding for the user question
    let start = Date.now();
    const questionEmbedding = await generateEmbeddingOpenAi(rephrasedQuestion);

    // 2. Perform semantic search to find similar questions
    console.log("Performing semantic search...");
    // if in production
    // const park = context.getTenant();
    // else hard code it
    const park = "almullaexchange";
    const searchResults = await semanticSearch(
      questionEmbedding,
      ["knowledgebase"],
      "fast_dense_vector",
      2,
      `tenant_partition_key == "${park}"`
    );

    // 3. Format results for passing to the fine-tuned model
    const topMatches = searchResults.map((result) => ({
      knowledgebase: result.knowledgebase,
      score: result.score,
    }));

    console.log(`Found ${topMatches.length} relevant matches`);
    await getExeTime("RagAllMini", start);
    return topMatches;

    // The caller can then pass these top matches to their fine-tuned model
  } catch (error) {
    console.error("Error in RAG pipeline:", error);
    throw error;
  }
}

// ONCE PER PROEJCT START
// SCOPE : PROJECT
module.exports = function ($, { session, execute, contactId }) {
  // ONCE PER PROEJCT MESSAE INBOUND
  // SCOPE : MESSAGE
  let SOME_VARIABLE = 0; // THIS VARIABLE CAN BE CHANGED AND MAINTAINED for ONE INBOUND MESSAGES
  class DoRagPromise extends ChainedPromise {
    constructor(executor = (resolve) => resolve(0)) {
      super(executor);
    }
    getHistory(sessionId) {
      return this.chain(async function (parentResp) {
        const rawHistory = await getRecentWebChats(sessionId);
        return rawHistory;
      });
    }
    getHistoryForIntent(rawHistory) {
      return this.chain(async function (parentResp) {
        const histForIntent = formatChatHistoryForIntent(rawHistory);
        return histForIntent;
      });
    }
    getHistoryWithIntent(sessionId){
      return this.chain(async function (parentResp) {
        const rawHistory = await getRecentWebChats(sessionId);
        const history = formatChatHistoryForIntent(rawHistory);
        // console.log(`history dorag : ${JSON.stringify(history)}`)
        return { history , rawHistory };
      });
    }

    rephrase(message) {
      return this.chain(async function (parentResp) {
        console.log(`message in dorag snippet: ${JSON.stringify(message)}`);
        // const { rephrase_system_prompt, rephrase_user_prompt } = await $.app.options.custom();
        const { rephrasing_rules , rephrasing_conflict_resolution_rules , rephrasing_examples } = await $.app.options.custom();
        const rephrasedQuestion = await rephraseWithContext(
          message.userquestion,
          message.rawHistory,
          rephrasing_rules,
          rephrasing_conflict_resolution_rules,
          rephrasing_examples
        );
        console.log(`rephrased question : ${rephrasedQuestion}`);
        return rephrasedQuestion;
      });
    }
    rag(rephrasedQuestion) {
      return this.chain(async function (parentResp) {
        const topMatches = await performRag(rephrasedQuestion);
        return topMatches;
      });
    }
    rephraseWithRag(message) {
      return this.chain(async function (parentResp) {
        console.log(`message in dorag snippet: ${JSON.stringify(message)}`);
        // const { rephrase_system_prompt, rephrase_user_prompt } = await $.app.options.custom();
        const { rephrasing_rules , rephrasing_conflict_resolution_rules , rephrasing_examples } = await $.app.options.custom();
        const rephrasedQuestion = await rephraseWithContext(
          message.userquestion,
          message.rawHistory,
          rephrasing_rules,
          rephrasing_conflict_resolution_rules,
          rephrasing_examples
        );
        console.log(`rephrased question : ${rephrasedQuestion}`);
        const topMatches = await performRag(rephrasedQuestion);
        return { rephrasedQuestion , topMatches };
      });
    }
    askllm(context) {
      return this.chain(async function (parentResp) {
        const { bot_introduction } = await $.app.options.custom();
        const answer = await getModelResponse(
          context.relevantInfo,
          context.rephrasedQuestion,
          bot_introduction
        );
        return answer;
      });
    }
    saveConvo(convo) {
      return this.chain(async function (parentResp) {
        return await saveConversation(convo);
      });
    }
  }
  return function () {
    //EVERY TIME FUNCTION IS CALLED
    // SCOPE : FUNCTION
    return new DoRagPromise();
  };
};
