import ajax from "../../@core/ajax";
import ChainedPromise from "../../@core/lib/ChainedPromise";
import { rephraseWithContext , saveConversation } from "../services/webChat";
import { performRagopenAi } from "../services/rag";
import { getModelResponse } from "../services/gpt";
import { webChatSchema } from "../models/WebChatModel";
module.exports = function ($, { session, execute , contactId}) {
  class DoRagPromise extends ChainedPromise {
    constructor(executor = (resolve) => resolve(0)) {
      super(executor);
    }
    rephrase(message) {
      return this.chain(async function (parentResp) {
        console.log(`message in dorag snippet: ${JSON.stringify(message)}`)
        
        const rephrasedQuestion = await rephraseWithContext(message.sessionId , message.userquestion );
        console.log(`rephrased question : ${rephrasedQuestion}`);
        return rephrasedQuestion;
      });
    }
    rag(rephrasedQuestion) {
      return this.chain(async function (parentResp) {
        const topMatches = await performRagopenAi(rephrasedQuestion);
        return topMatches;
      });
    }
    askllm( context ) {
      return this.chain(async function (parentResp) {
        const answer = await getModelResponse(context.relevantInfo, context.rephrasedQuestion);
        return answer;
      });
    }  
    saveConvo(convo){
      return this.chain(async function (parentResp) {
        return await saveConversation(convo);
      });
    }
  }
  return function () {
    return new DoRagPromise();
  };
};
