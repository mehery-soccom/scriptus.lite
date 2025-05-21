const { MetricType } = require("@zilliz/milvus2-sdk-node");
const { vectorDb , collection_kbqa , collection_kbarticle} = require("../models/clients");
const { generateEmbeddingOpenAi, generateEmbeddingAllMini } = require("./gpt");
const { getExeTime } = require("../../@core/utils/exetime");
const { rephraseWithContext } = require("./webChat");
async function loadDb() {
  if (vectorDb) {
    await vectorDb.loadCollection({
      collection_name: collection_kbarticle,
    });
    await vectorDb.loadCollection({
      collection_name: collection_kbqa,
    });
    // await vectorDb.loadCollection({
    //   collection_name: "fast_semantic_search",
    // });
    // await vectorDb.loadCollection({
    //   collection_name: "qa_production"
    // });
  }
}
/**
 * Performs semantic search in Milvus using the provided embedding vector
 * @param {string} collectionName - Name of the Milvus collection to search in
 * @param {number[]} embedding - The embedding vector to search with
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} - Array of search results
 */

async function insertQaPairs(collection_name, data){
  return await vectorDb.insert({collection_name, data});
}
async function semanticSearch(collectionName, embedding, output_fields, field_name, topK = 2, filter = "") {
  try {
    let start = Date.now();

    // Perform vector similarity search
    const searchResult = await vectorDb.search({
      collection_name: collectionName,
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

/**
 * Main open ai RAG function that processes a user question
 * @param {string} userQuestion - The user's question
 * @param {string} collectionName - Name of the Milvus collection
 * @returns {Promise<Array>} - Top matching context documents
 */
async function performRagopenAi(rephrasedQuestion) {
  try {
    // 1. Generate embedding for the user question
    let start = Date.now();

    const questionEmbedding = await generateEmbeddingOpenAi(rephrasedQuestion);

    // 2. Perform semantic search to find similar questions
    console.log("Performing semantic search...");
    const searchResults = await semanticSearch(
      "qaSchema",
      questionEmbedding,
      ["question", "answer"],
      "question_dense_vector"
    );

    // 3. Format results for passing to the fine-tuned model
    const topMatches = searchResults.map((result) => ({
      question: result.question,
      answer: result.answer,
      score: result.score,
    }));

    console.log(`Found ${topMatches.length} relevant matches`);
    await getExeTime("RagOpenAi", start);
    return topMatches;
  } catch (error) {
    console.error("Error in RAG pipeline:", error);
    throw error;
  }
}
async function performRagAllMini(userQuestion, collectionName, contactId) {
  try {
    // 1. Generate embedding for the user question
    let start = Date.now();
    console.log("Generating embedding for user question...");
    const rephrasedQuestion = await rephraseWithContext(contactId, userQuestion);
    const questionEmbedding = await generateEmbeddingAllMini(userQuestion);

    // 2. Perform semantic search to find similar questions
    console.log("Performing semantic search...");
    const park = "kedar_mehery_xyz";
    const searchResults = await semanticSearch(
      collectionName,
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
    return { topMatches, rephrasedQuestion };

    // The caller can then pass these top matches to their fine-tuned model
  } catch (error) {
    console.error("Error in RAG pipeline:", error);
    throw error;
  }
}
module.exports = { performRagopenAi, performRagAllMini, semanticSearch, loadDb , insertQaPairs };
