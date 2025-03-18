const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
const { OpenAI } = require("openai");
const mongoose = require('mongoose');
const config = require("@bootloader/config")

const address = config.get("milvus.url")
const token = config.get("milvus.token")
// console.log(`milvus url = ${address}`)
// console.log(`milvus token = ${token}`)
const vectorDb = new MilvusClient({address, token});

const openAiToken = config.get("openai.token")
const openai = new OpenAI({ apiKey: openAiToken });



const clientId = config.get("client.id");
const clientApiKey = config.get("client.apikey");

const mongoUri = config.get("mongo.uri");
const mongoDbName = config.get("mongo.db")
const secrets = {
  client : {
    id : clientId,
    apiKey : clientApiKey
  },
  mongo : {
    uri : mongoUri,
    dbName : mongoDbName
  }
}

const connectDB = async () => {
  try {
    const mongoURI = secrets.mongo.uri; 
    const dbName = secrets.mongo.dbName;

    if (!mongoURI) {
      throw new Error('MONGO_URI environment variable is not defined.');
    }
    if(!dbName){
        throw new Error('DB_NAME environment variable is not defined.')
    }

    const connection = await mongoose.connect(mongoURI, { dbName : dbName });
    console.log(`MongoDB Connected: ${connection.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1); // Exit process with failure
  }
};

module.exports = { vectorDb , openai , connectDB };