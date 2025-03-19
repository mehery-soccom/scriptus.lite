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
const secrets = {
  client : {
    id : clientId,
    apiKey : clientApiKey
  }
}



module.exports = { vectorDb , openai };