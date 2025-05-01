const { DataType, IndexType, MetricType, MilvusClient } = require("@zilliz/milvus2-sdk-node");
const { OpenAI } = require("openai");
const config = require("@bootloader/config");
const console = require("@bootloader/log4js").getLogger("clients");
import { context } from "@bootloader/utils";
const address = config.getIfPresent("milvus.url");
const token = config.getIfPresent("milvus.token");
// console.log(`milvus url = ${address}`)
// console.log(`milvus token = ${token}`)
const vectorDb = address && token ? new MilvusClient({ address, token }) : null;

const fields = [
  {
    name: "id",
    data_type: DataType.Int64,
    is_primary_key: true,
    autoID: true,
  },
  {
    name: "tenant_partition_key",
    data_type: DataType.VarChar,
    max_length: 512,
    is_partition_key: true,
  },
  {
    name: "fast_dense_vector",
    data_type: DataType.FloatVector,
    dim: 512,
  },
  {
    name: "kb_id",
    data_type: DataType.VarChar,
    max_length: 36, // UUID length is 36 characters
  },
  {
    name: "article_id",
    data_type: DataType.VarChar,
    max_length: 36,
  },
];
const index_params = [
  {
    field_name: "id",
    index_type: IndexType.AUTOINDEX,
  },
  {
    field_name: "tenant_partition_key",
    index_type: IndexType.AUTOINDEX,
  },
  {
    field_name: "fast_dense_vector",
    index_type: IndexType.AUTOINDEX,
    metric_type: MetricType.COSINE,
  },
  {
    field_name: "kb_id",
    index_type: IndexType.AUTOINDEX, // Index for filtering knowledge base UUIDs
  },
  {
    field_name: "article_id",
    index_type: IndexType.AUTOINDEX, // Index for filtering article UUIDs
  },
];

if (!vectorDb) {
  console.warn("===== MMILVUS NOT INITIALIAZED");
}

const collection_prefix = config.getIfPresent("milvus.collection.prefix");
const collection_name = `${collection_prefix}_kbqa`;

// Function to initialize collection
async function initializeCollection(collection_name, index_params, fields) {
  try {
    // Check if collection exists
    const collections = await vectorDb.listCollections();
    const collectionExists = collections.collection_names.includes(collection_name);

    if (!collectionExists) {
      console.log(`Creating collection: ${collection_name}`);

      const res = await vectorDb.createCollection({
        collection_name,
        fields, // Enable partition key
        index_params,
        primary_field_name: "id",
        partition_key_field: "tenant_partition_key",
        enable_dynamic_field: true,
        auto_id: true,
        properties: {
          "partitionkey.isolation": true,
        },
      });

      if (res.code === 0) {
        console.log(res.error_code);
        console.log(`Collection ${collection_name} created successfully.`);
      } else {
        console.error(`Error Code : ${res.error_code}`);
        console.error(res.reason);
      }
    } else {
      console.log(`Collection ${collection_name} already exists.`);
    }

    await vectorDb.loadCollection({
      collection_name
    });
  } catch (error) {
    console.error("Error initializing Milvus collection:", error);
  }
}

// Run initialization immediately when the file is imported
initializeCollection(collection_name, index_params, fields);

const openAiToken = config.getIfPresent("openai.token");
const openai = openAiToken ? new OpenAI({ apiKey: openAiToken }) : null;

// const clientId = config.get("client.id");
// const clientApiKey = config.get("client.apikey");
// const secrets = {
//   client : {
//     id : clientId,
//     apiKey : clientApiKey
//   }
// }



module.exports = { vectorDb, openai, collection_name };
