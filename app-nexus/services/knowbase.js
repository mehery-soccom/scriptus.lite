const { KbqaSchema } = require("../models/KbqaSchema");
const mongon = require("@bootloader/mongon");
const crypto = require("crypto");
const { KnowBaseSchema } = require("../models/KnowBaseSchema");


function createRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);
  randomArray.forEach((number) => {
    result += chars[number % chars.length];
  });
  return result;
}

async function createKbs(type,category,title) {
  const code = createRandomString(11);
  const KnowBaseModel = mongon.model(KnowBaseSchema);
  console.log(`type knowbase : ${type}`)
  console.log(`title knowbase : ${title}`)
  console.log(`category knowbase : ${category}`)
  const new_kb = new KnowBaseModel({
      code:code,
      type:type,
      category:category,
      title:title
  });
  const savedNode = await new_kb.save();
  return savedNode;
}
async function getAllKbs() {
  const KnowBaseModel = mongon.model(KnowBaseSchema);
  const result = await KnowBaseModel.find({ parentId : { $in : [null , undefined]}});
  return result;
}
async function saveDocs(docs) {
  const KnowBaseModel = mongon.model(KnowBaseSchema);
  // console.log(`docs : ${JSON.stringify(docs)}`);
  // const convertedDocs = convertDocs(docs);
  const savedDocs = await KnowBaseModel.insertMany(docs, { ordered: false });
  return savedDocs;
}
async function getPaginatedArticleDocs(kb_id, cursor = null, pageSize = 25, page) {
  const KnowBaseModel = mongon.model(KnowBaseSchema);

  // Filter base
  const baseFilter = {
    parentId : kb_id,
    // tenant_partition_key
  };

  // Add cursor condition
  if (page > 1) {
    baseFilter._id = { $gt: cursor }; // fetch next page after this docId
  }

  // Fetch paginated data
  const docs = await KnowBaseModel.find(baseFilter)
    .sort({ _id: 1 }) // ascending order
    .limit(pageSize)
    .lean();

  // Get total count for this tenant's selected knowledgebase (for pagination metadata)
  const totalCount = await KnowBaseModel.countDocuments({
    parentId : kb_id,
    // tenant_partition_key,
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
async function deleteArticleDocs(ids, tenant_partition_key, kb_id) {
  const KnowBaseModel = mongon.model(KnowBaseSchema);
  return await KnowBaseModel.deleteMany({
    _id: { $in: ids },
    parentId: kb_id,
    // tenant_partition_key: tenant_partition_key,
  });
}
async function fetchArticlesByIds(docIds, kb_id, tenant_partition_key) {
  const KnowBaseModel = mongon.model(KnowBaseSchema);
  try {
    const fetchedDocs = await KnowBaseModel.find({
      _id: { $in: docIds },
      kb_id: kb_id,
      // topic_id: topic_id,
      tenant_partition_key: tenant_partition_key,
    }).select({
      title: 1,
      kb_id: 1,
      content: 1,
      // topic_id: 1,
      // article_id: 1,
      // tenant_partition_key: 1,
      // docId: 1,
      // _id: 0 // Exclude the _id field
    });
    // console.log(`fetchedDocs : ${JSON.stringify(fetchedDocs)}`);
    return fetchedDocs;
  } catch (error) {
    console.error("Error fetching documents:", error);
    throw error; // Re-throw the error for the calling function to handle
  }
}
async function getArticleUpdateStatus(updateDocs, fetchedDocs) {
  // Create a hash map of fetchedDocs for faster lookup
  const fetchedDocsMap = fetchedDocs.reduce((acc, doc) => {
    acc[doc._id] = doc;
    return acc;
  }, {});
  console.log(`fetched docs : ${JSON.stringify(fetchedDocs)}`);
  return updateDocs.map((updateDoc) => {
    const fetchedDoc = fetchedDocsMap[updateDoc._id];
    return {
      _id: updateDoc._id,
      title: updateDoc.title,
      content: updateDoc.content,
      kb_id: fetchedDoc.parentId,
      // topic_id: fetchedDoc.topic_id,
      // article_id : fetchedDoc.article_id,
      // tenant_partition_key: fetchedDoc.tenant_partition_key,
    };
  });
}
async function updateArticleDocs(newDocs) {
  const KnowBaseModel = mongon.model(KnowBaseSchema);
  const bulkOps = newDocs.map((doc) => {
    const { _id, ...fieldsToUpdate } = doc;
    return {
      updateOne: {
        filter: { _id },
        update: { $set: fieldsToUpdate },
      },
    };
  });
  try {
    const result = KnowBaseModel.bulkWrite(bulkOps);
    return result;
  } catch (e) {
    console.log("Error updating : ", e);
  }
}
module.exports = {
  createRandomString,
  createKbs,
  getAllKbs,
  saveDocs,
  getPaginatedArticleDocs,
  deleteArticleDocs,
  fetchArticlesByIds,
  getArticleUpdateStatus,
  updateArticleDocs
};