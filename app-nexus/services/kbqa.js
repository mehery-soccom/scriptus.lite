const { KbqaSchema } = require("../models/KbqaSchema");
const mongon = require("@bootloader/mongon");
const crypto = require("crypto");

/**
 * Hashes a string using SHA-256
 * @param {string} input
 * @returns {string}
 */
function hashString(input) {
  return crypto
    .createHash("sha256")
    .update(input || "")
    .digest("hex");
}

/**
 * Converts an array of documents by flattening fields and adding hashes
 * @param {Array<Object>} docs
 * @returns {Array<Object>}
 */
function convertDocs(docs) {
  return docs.map((doc) => {
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

async function fetchDocsByIds(docIds, kb_id, tenant_partition_key) {
  const KbqaModel = mongon.model(KbqaSchema);
  try {
    const fetchedDocs = await KbqaModel.find({
      _id: { $in: docIds },
      kb_id: kb_id,
      tenant_partition_key: tenant_partition_key,
    }).select({
      question: 1,
      kb_id: 1,
      answer: 1,
      // article_id: 1,
      tenant_partition_key: 1,
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

  return updateDocs.map((updateDoc) => {
    const fetchedDoc = fetchedDocsMap[updateDoc._id];
    return {
      _id: updateDoc._id,
      question: updateDoc.question,
      answer: updateDoc.answer,
      kb_id: fetchedDoc.kb_id,
      // article_id : fetchedDoc.article_id,
      tenant_partition_key: fetchedDoc.tenant_partition_key,
      knowledgebase: `Question : ${updateDoc.question} \n Answer : ${updateDoc.answer}`,
    };
  });
}

async function updateQaDocs(newDocs) {
  const KbqaModel = mongon.model(KbqaSchema);
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
    const result = KbqaModel.bulkWrite(bulkOps);
    return result;
  } catch (e) {
    console.log("Error updating : ", e);
  }
}

async function getPaginatedDocs(kb_id, tenant_partition_key, cursor = null, pageSize = 25, page) {
  const KbqaModel = mongon.model(KbqaSchema);

  // Filter base
  const baseFilter = {
    kb_id,
    tenant_partition_key,
  };

  // Add cursor condition
  if (page > 1) {
    baseFilter._id = { $gt: cursor }; // fetch next page after this docId
  }

  // Fetch paginated data
  const docs = await KbqaModel.find(baseFilter)
    .sort({ _id: 1 }) // ascending order
    .limit(pageSize)
    .lean();

  // Get total count for this tenant's selected knowledgebase (for pagination metadata)
  const totalCount = await KbqaModel.countDocuments({
    kb_id,
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

async function deleteKbqaDocs(ids, tenant_partition_key, kb_id) {
  const KbqaModel = mongon.model(KbqaSchema);
  return await KbqaModel.deleteMany({ _id: { $in: ids }, kb_id: kb_id, tenant_partition_key: tenant_partition_key });
}

// Knowledge base queries
async function createNewKb(kbName, tenantPartitionKey) {
  try {
    const KbqaModel = mongon.model(KbqaSchema);
    const new_kb = new KbqaModel({
      kb_id: null,
      kb_name: kbName,
      doc: null,
      question: null,
      answer: null,
      tenant_partition_key: tenantPartitionKey,
    });
    const savedNode = await new_kb.save();
    return { success : true , savedNode , message : `New Knowledge base ${kbName} created successfully`};
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.kb_name) {
      // MongoDB duplicate key error for kb_name
      return { success: false, message: `A knowledge base with name : ${kbName} already exists` };
    } else {
      console.error("Error creating parent node:", error);
      return { success: false, message: "An unexpected error occurred while creating the knowledge base" };
    }
  }
}

async function getAllKbs(tenant_partition_key, isDetailed) {
  try {
    const KbqaModel = mongon.model(KbqaSchema);
    if (isDetailed) {
      const result = await KbqaModel.aggregate([
        {
          $match: {
            kb_id: { $in: [null, undefined] },
            tenant_partition_key: tenant_partition_key,
          },
        },
        {
          $lookup: {
            from: "kbqa",
            let: { parentIdStr: { $toString: "$_id" } }, // Convert ObjectId to string
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$kb_id", "$$parentIdStr"], // Now both are strings
                  },
                },
              },
            ],
            as: "children",
          },
        },
        {
          $project: {
            _id: 1,
            kb_name: 1,
            count: { $size: "$children" },
          },
        },
      ]);

      console.log(`detailed res : ${JSON.stringify(result)}`);
      return result;
    } else {
      const result = await KbqaModel.find({ kb_id: null, tenant_partition_key: tenant_partition_key }).select({
        kb_name: 1,
      });
      return result;
    }
  } catch (error) {
    console.log("Error fetching all Kbs : ", error);
  }
}
async function deleteKb(kb_name, kb_id, tenant_partition_key) {
  try {
    const KbqaModel = mongon.model(KbqaSchema);
    const deleteChildren = await KbqaModel.deleteMany({ kb_id: kb_id, tenant_partition_key: tenant_partition_key });
    const deleteKb = await KbqaModel.deleteOne({ _id: kb_id, tenant_partition_key: tenant_partition_key });
    return { success: true, deleteChildren, deleteKb };
  } catch (error) {
    console.log("Error fetching all Kbs : ", error);
    return { success: false, message: "An unexpected error occurred while creating the knowledge base" };
  }
}
module.exports = {
  saveFaqs,
  fetchDocsByIds,
  getDocsUpdateStatus,
  deleteKbqaDocs,
  getPaginatedDocs,
  updateQaDocs,
  createNewKb,
  getAllKbs,
  deleteKb,
};