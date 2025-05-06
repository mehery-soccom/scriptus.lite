const { KbqaSchema } = require("../models/KbqaSchema");
const mongon = require("@bootloader/mongon");
const crypto = require('crypto');

/**
 * Hashes a string using SHA-256
 * @param {string} input
 * @returns {string}
 */
function hashString(input) {
  return crypto.createHash('sha256').update(input || '').digest('hex');
}

/**
 * Converts an array of documents by flattening fields and adding hashes
 * @param {Array<Object>} docs
 * @returns {Array<Object>}
 */
function convertDocs(docs) {
  return docs.map(doc => {
    const { id, $meta, ...rest } = doc;

    if (!$meta || !$meta.question || !$meta.answer || !$meta.knowledgebase) {
      throw new Error(`Missing required $meta fields in document with id: ${id}`);
    }

    return {
      ...rest,
      docId: id,
      knowledgebase: $meta.knowledgebase,
      question: $meta.question,
      answer: $meta.answer,
    };
  });
}

async function saveFaqs(docs) {
  const KbqaModel = mongon.model(KbqaSchema);
  // console.log(`docs : ${JSON.stringify(docs)}`);
  // const convertedDocs = convertDocs(docs);
  const savedDocs = await KbqaModel.insertMany(docs, { ordered: false });
  return savedDocs;
}

async function fetchDocsByIds(docIds) {
  const KbqaModel = mongon.model(KbqaSchema);
  try {
    const fetchedDocs = await KbqaModel.find({ _id: { $in: docIds } })
      .select({
        question: 1,
        kb_id: 1,
        answer: 1,
        // article_id: 1,
        tenant_partition_key : 1,
        // docId: 1,
        // _id: 0 // Exclude the _id field
      });

    return fetchedDocs;
  } catch (error) {
    console.error("Error fetching documents:", error);
    throw error; // Re-throw the error for the calling function to handle
  }
}

async function getDocsUpdateStatus(updateDocs, fetchedDocs) {
  // Create a hash map of fetchedDocs for faster lookup
  const fetchedDocsMap = fetchedDocs.reduce((acc, doc) => {
    acc[doc._id] = doc;
    return acc;
  }, {});

  return updateDocs.map(updateDoc => {
    const fetchedDoc = fetchedDocsMap[updateDoc._id];
    return {
      _id : updateDoc._id,
      question: updateDoc.question,
      answer: updateDoc.answer,
      kb_id : fetchedDoc.kb_id,
      // article_id : fetchedDoc.article_id,
      tenant_partition_key : fetchedDoc.tenant_partition_key,
      knowledgebase : `Question : ${updateDoc.question} \n Answer : ${updateDoc.answer}`
    };
  });
}

async function updateQaDocs(newDocs){
  const KbqaModel = mongon.model(KbqaSchema);
  const bulkOps = newDocs.map(doc => {
    const { _id , ...fieldsToUpdate } = doc;
    return {
      updateOne : {
        filter : { _id },
        update : { $set : fieldsToUpdate }
      }
    };
  });
  try{
    const result = KbqaModel.bulkWrite(bulkOps);
    return result;
  }catch(e){
    console.log("Error updating : ",e);
  }
}

async function getPaginatedDocs(tenant_partition_key, cursor = null , pageSize = 25 , page) {
  
  const KbqaModel = mongon.model(KbqaSchema);

  // Filter base
  const baseFilter = {
    tenant_partition_key,
  };

  // Add cursor condition
  if (page>1) {
    baseFilter._id = { $gt: cursor }; // fetch next page after this docId
  }

  // Fetch paginated data
  const docs = await KbqaModel.find(baseFilter)
    .sort({ _id : 1 }) // ascending order
    .limit(pageSize)
    .lean();

  // Get total count for this tenant (for pagination metadata)
  const totalCount = await KbqaModel.countDocuments({
    tenant_partition_key,
  });

  // Determine next cursor
  const nextCursor = docs.length === pageSize ? docs[docs.length - 1]._id : null;

  return {
    data: docs,
    nextCursor,
    totalPages: Math.ceil(totalCount / pageSize),
    totalCount,
  };
}

async function deleteKbqaDocs(ids, tenant_partition_key){
  const KbqaModel = mongon.model(KbqaSchema);
  return await KbqaModel.deleteMany({ _id: { $in: ids } });
}
module.exports = { saveFaqs , fetchDocsByIds , getDocsUpdateStatus , deleteKbqaDocs , getPaginatedDocs , updateQaDocs };