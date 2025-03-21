const { MilvusClient } = require("@zilliz/milvus2-sdk-node");
const { OpenAI } = require("openai");
const config = require("@bootloader/config");
const console = require("@bootloader/log4js").getLogger("clients");

const address = config.getIfPresent("milvus.url");
const token = config.getIfPresent("milvus.token");
// console.log(`milvus url = ${address}`)
// console.log(`milvus token = ${token}`)
const vectorDb = address && token ? new MilvusClient({ address, token }) : null;

if (!vectorDb) {
  console.warn("===== MMILVUS NOT INITIALIAZED");
}

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

module.exports = { vectorDb, openai };
