const { requireOptional } = require("@bootloader/utils");
// const { openai } = require("../models/clients");
const { getExeTime } = require("../../@core/utils/exetime");
const { pipeline } = requireOptional("@huggingface/transformers");
const OpenAIService = require("../../@core/scriptus/clients/OpenAIService")


async function generateEmbeddingAllMini(text) {
  try {
    let start = Date.now();
    // const { pipeline } = await import('@xenova/transformers');
    // const extractor = await pipeline(
    //   "feature-extraction",
    //   "Xenova/all-MiniLM-L6-v2"
    // );
    const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    const output = await extractor([text], { pooling: "mean", normalize: true });
    await getExeTime("AllMini", start);
    // console.log(Array.from(response.data));
    return Array.from(output.data);
  } catch (error) {
    console.error("Error while generating embedding with all mini : ", error);
    throw error;
  }
}

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
  You can reach out to us on email: Help@almullaexchange.com .`;
}

async function getModelResponse(relevantInfo, rephrasedQuestion) {
  let start = Date.now();
//   const systemPrompt = `
// You are an AI assistant for Al Mulla Exchange.
// Answer the user's question using only the provided information.
// If the information indirectly answers the question, still answer.
// If the information is insufficient, trigger information_not_available().
// Never invent information.
// `;
  const systemPrompt = `You are an AI assistant for Al Mulla Exchange.  
Use the provided information to answer the user's question.  

- If the retrieved information contains an answer that matches the meaning of the user’s question, respond using that information.  
- If the wording differs but the meaning is the same, still answer using the retrieved data.  
- If no relevant information is found, trigger information_not_available() function provided as a tool.  
- Do not require an exact wording match to provide an answer.  

Never invent information. Prioritize using retrieved knowledge.  
`
  const userPrompt = `
### Relevant Information
${relevantInfo}

### User Question
${rephrasedQuestion}

Answer the user’s question using **the most relevant retrieved information from the Relevant Information above**.  
- If a retrieved FAQ answers the question (even if wording differs), provide that answer.  
- If no relevant information is found, trigger 'information_not_available()' function provided as tool.  
`;
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

module.exports = { generateEmbeddingOpenAi, generateEmbeddingAllMini, getModelResponse };
