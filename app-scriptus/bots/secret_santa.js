function onSessionStart() {
  console.log("=======================TEST====onSessionStart===");
}

function onSessionRouted() {
  console.log("=======================TEST====onSessionRouted===");
}

async function onMessageReceive() {
  //console.log("Recieved Message:", $.inbound);
  let testresp = await $.calc(200).add(50).multiply(4).substract(500);
  console.log("testresp", testresp);

  let resp = await $.reply(`Response(${$.inbound.getText()})`);
  console.log("Response:", resp);
}
