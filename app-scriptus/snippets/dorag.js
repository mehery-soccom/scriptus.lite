import ajax from "../../@core/ajax";
import ChainedPromise from "../../@core/lib/ChainedPromise";
import { rephraseWithContext, saveConversation, getRecentWebChats , formatChatHistory , formatChatHistoryForIntent } from "../services/webChat";
import { performRagopenAi } from "../services/rag";
import { getModelResponse } from "../services/gpt";
import { webChatSchema } from "../models/WebChatModel";
module.exports = function ($, { session, execute, contactId }) {
  class DoRagPromise extends ChainedPromise {
    constructor(executor = (resolve) => resolve(0)) {
      super(executor);
    }
    getHistory(sessionId) {
      return this.chain(async function (parentResp) {
        const rawHistory = await getRecentWebChats(sessionId);
        return rawHistory
      });
    }
    getHistoryForIntent(rawHistory){
      return this.chain(async function (parentResp) {
        const histForIntent = formatChatHistoryForIntent(rawHistory);
        return histForIntent
      });
    }

    rephrase(message) {
      return this.chain(async function (parentResp) {
        console.log(`message in dorag snippet: ${JSON.stringify(message)}`);
        const { rephrase_system_prompt , rephrase_user_prompt } = await $.app.options.custom();
        const rephrasedQuestion = await rephraseWithContext(message.userquestion , message.rawHistory , rephrase_system_prompt , rephrase_user_prompt );
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
    askllm(context) {
      return this.chain(async function (parentResp) {
        const { ask_llm_system_prompt , ask_llm_user_prompt } = await $.app.options.custom();
        const answer = await getModelResponse(context.relevantInfo, context.rephrasedQuestion , ask_llm_system_prompt , ask_llm_user_prompt );
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
    return new DoRagPromise();
  };
};
