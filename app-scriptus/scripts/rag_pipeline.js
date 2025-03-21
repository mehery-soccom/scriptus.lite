function onSessionStart() {
  console.log("=======================TEST====onSessionStart===");
}

function onSessionRouted() {
  console.log("=======================TEST====onSessionRouted===");
}

async function onMessageReceive() {
  const isOpenAi = true;
  const inboundMessage = $.inbound;
  // console.log(`message : ${JSON.stringify(inboundMessage)}`)
  const contactId = inboundMessage.message.contactId;
  const userquestion = inboundMessage.message.text.body;
  console.log(`user question : ${userquestion}`);
  console.log(`contact Id : ${contactId}`);
  let message = { contactId, userquestion };
  // console.log(`message in rag_pipeline script : ${JSON.stringify(message)}`)
  const rephrasedQuestion = await $.dorag().rephrase(message);
  const topMatches = await $.dorag().rag(rephrasedQuestion);

  let relevantInfo = "";
  const matches = [];
  for (let i = 0; i < topMatches.length; i++) {
    const newInfo = isOpenAi
      ? `${i + 1}. Question : ${topMatches[i].question} \n Answer : ${topMatches[i].answer} \n`
      : `${i + 1}. ${topMatches[i].knowledgebase} \n`;
    matches.push({ knowledgebase: newInfo, score: topMatches[i].score });
    relevantInfo += newInfo;
  }
  const context = { relevantInfo , rephrasedQuestion };
  const answer = await $.dorag().askllm(context);
  const convo = { contactId, rephrasedQuestion, matches,
    messages: {
      user: userquestion,
      assistant: answer
    }
  };
  const savedChat = await $.dorag().saveConvo(convo);
  let resp = await $.reply(`${answer}`);
  

  console.log("Response:", resp);
}
