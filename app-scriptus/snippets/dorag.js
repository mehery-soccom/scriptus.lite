import ajax from "../../@core/ajax";
import ChainedPromise from "../../@core/lib/ChainedPromise";
import {
  rephraseWithContext,
  saveConversation,
  getRecentWebChats,
  formatChatHistory,
  formatChatHistoryForIntent,
} from "../services/webChat";
// import { performRagopenAi } from "../services/rag";
import { getModelResponse } from "../services/gpt";
import { webChatSchema } from "../models/WebChatModel";
import { collection_name } from "../models/clients";
import { generateEmbeddingOpenAi } from "../services/gpt";
import { vectorDb } from "../models/clients"
import { MetricType } from "@zilliz/milvus2-sdk-node";
import { getExeTime } from "../../@core/utils/exetime";
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

    rephrase(message) {
      return this.chain(async function (parentResp) {
        console.log(`message in dorag snippet: ${JSON.stringify(message)}`);
        const { rephrase_system_prompt, rephrase_user_prompt } = await $.app.options.custom();
        const rephrasedQuestion = await rephraseWithContext(
          message.userquestion,
          message.rawHistory,
          rephrase_system_prompt,
          rephrase_user_prompt
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
    askllm(context) {
      return this.chain(async function (parentResp) {
        const { ask_llm_system_prompt, ask_llm_user_prompt } = await $.app.options.custom();
        const answer = await getModelResponse(
          context.relevantInfo,
          context.rephrasedQuestion,
          ask_llm_system_prompt,
          ask_llm_user_prompt
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
