function onSessionStart() {
  console.log("=======================TEST====onSessionStart===");
}

function onSessionRouted() {
  console.log("=======================TEST====onSessionRouted===");
}

async function onMessageReceive() {
  //console.log("Recieved Message:", $.inbound);
  let { history } = await $.store.local("history");
  history = history || [];
  history.push({
    role: "user",
    content: $.inbound.getText(),
  });
  const options = await $.session.app.options();
  console.log("====options====", options);
  let resp = await $.openai({ useGlobalConfig: true }).next(history);
  history.push({
    role: "assistant",
    content: `${resp.message().content}`,
  });
  await $.store.local.set("history", history);
  //console.log("resp", resp);
  console.log("resp.message() [", resp.message(), "]");
  await $.reply(resp.message().content);
}
