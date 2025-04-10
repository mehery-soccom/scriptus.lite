var apiEndPoint = "https://apid-kwt.amxremit.com/bot/ext";

function get_intent_prompt() {
  return [
    `You are Customer Support Agent for a money exchange or remittance company named Al Mulla Exchange, based in Kuwait and involved in international money transfer.
    You will not refer to Al Mulla Exchange as a third person in a conversation. You can strictly do below activities:
- Only answer customer queries about international money remittances based on the provided knowledge base and as per the knowledgebase prompt. 
If information about money transfers to any specific country, country and currency combination, or country - currency - payout combination is not available in the knowledgebase, explicitly state that the particular combination is not available. 
Do **not** assume or infer details. Do not provide responses for countries, for which remittances are not stated as available in the knowledgebase
- Answer Customer queries related to live exchange rates, only if the customer explicitly asks for the exchange rate and not just the mere mention of a currency.
- Transfer to a human agent only if the customer explicitly asks for it, when customer uploads any file, if the customer is being abusive, or if their request cannot be handled using the available knowledge base.
The user will provide input, and you must classify it as one of the following intents :- 
- "faq_query" if they have any query on international money transfers (remittance), originating from Kuwait
- "exchange_rates" if they specifically ask for exchange rate
- "connect_agent" if they want to talk to a live agent
- For general greetings do not give any intent

Respond in the format:
intent(<intent_name>:<params>)
- If the intent is ONLY “exchange_rates", <params> should always be the **target currency ISO code** (e.g., USD, EUR) extracted from the user input. The base currency is **always KWD**.
- If the user mentions the target currency explicitly (like USD, EUR, etc.), return that currency as <params>.
- If the user mentions currency and country return: intent(faq_query)
- If no valid currency is mentioned (like when asking "What are the rates today?"), return 'intent(exchange_rates:unknown)'.

Examples:
- User Input: "Do you transfer money to Nepal"
Response: intent(faq_query)
- User Input: "How can I send money to Australia"
Response: intent(faq_query)
- User Input: "What is the exchange rate for USD?"  
Response: intent(exchange_rates:USD)
- User Input: "Tell me the rate for EUR."  
Response: intent(exchange_rates:EUR)
- User Input: "What are the rates today?" 
Response (If no currency is mentioned): intent(exchange_rates:unknown)  
- User Input: "I have a question about transfer times."  
Response: intent(faq_query)
- User Input: "Can I talk to an agent?"  
Response: intent(connect_agent)
- User Input: “Do you transfer (or remit) USD to Afghanistan?”
Response: intent(faq_query)

Note: Keep asking more questions until intent is not clear  
- If customer asks "what are rates today" it is exchange_rates inquiry
- You MUST return the response ONLY in the exact format: intent(<intent_name>:<params>). Any deviation from this format is strictly prohibited."
Remember Customer's Language Preference
- While transferrig to human/live agent always append intent(connect_agent) in specified format.`
  ];
}

const functions = [
  {
    name: "connect_agent",
    description: "Transfers the conversation to a live agent",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "exchange_rates",
    description: "Get Currency Exchange rates against KWD",
    parameters: {
      type: "object",
      properties: {
        currency: {
          type: "string",
          description: "target currency ISO code",
        },
      },
    },
  },
  {
    name: "faq_query",
    description: "Handles general customer inquiries or FAQs",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "User's question or inquiry",
        },
      },
    },
  },
];

function onSessionStart() {
  console.log("=======================almullagpt====onSessionStart===");
}

function onSessionRouted() {
  console.log("=======================almullagpt====onSessionRouted===");
}

/*
async function onMessageReceive() {
  console.log("=======================almullagpt====onMessageReceive===");
  await $.reply(`Response(${$.inbound.getText()})`).listen(listenHandler);
}
async function listenHandler() {
  console.log("listenHandler");
  await $.reply(`2 Response(${$.inbound.getText()})`);
}
*/

async function onMessageReceive() {
  //return await onHandleDefault();
  let inputCode = ($.inbound.getCode() || "").toUpperCase();
  //$.logger.log("handleInput", inputCode);
  //$.console.log("handleInput", inputCode);
  switch (inputCode) {
    case "C":
    case "#":
      await assignToAgent();
      break;
    case "M":
    case "*":
      await $.reply({
        template: "main_menu",
      });
      break;
    case "E":
      //console.log()
      return $.session.close();
    default:
      return await onHandleDefault();
  }
}

async function onHandleDefault() {
  //console.log("onHandleDefault");
  const isOpenAi = true;
  // console.log(`message : ${JSON.stringify(inboundMessage)}`)
  const {
    bot_introduction,
    no_info_response,
    rephrasing_rules,
    rephrasing_conflict_resolution_rules,
    rephrasing_examples,
    answer_llm,
    answer_llm_system_prompt_temp,
    answer_llm_user_prompt_temp
  } = await $.session.app.options();
  let {
    history,
    rawHistory,
    sessionId,
    function_call,
    message,
    userText: userquestion,
  } = await $.dorag().getIntentWithContext({
    systemPrompts: get_intent_prompt(),
    functions,
  });

  console.log("resp.message()", message());

  function_call &&
    function_call(function ({ content }) {
      console.log("intentResponse", content);
      //const match = content.match(/intent\((?<intent>\w+)(:(?<params>[\w\d]+))?\)/i);
      const match = content?.match(/intent\((?<intent>\w+)(:(?<params>.+?))?\)/);
      if (match && match.groups) {
        //console.log("function_call:MATCHED")
        let arg1 = match.groups.params ? match.groups.params.trim() : null;
        let cleanedContent = content.replace(match[0], "").trim();
        //console.log("cleanedContent=",cleanedContent)
        return {
          name: match.groups.intent,
          args: {
            currency: arg1,
            response: cleanedContent || content,
          },
        };
      } else if (["faq_query", "exchange_rates", "connect_agent"].indexOf(content) > -1) {
        //console.log("function_call:MAPPED")
        return {
          name: content,
          args: {},
        };
      }
      //console.log("function_call:NONE")
      return {
        // name: "greetings", args: {}
      };
    })
      .on("connect_agent", async function ({ name, args }) {
        console.log("INTENT:connect_agent", name, args);
        await assignToAgent(history, args.response);
      })
      .on("exchange_rates", async function ({ name, args }) {
        console.log("INTENT:exchange_rates", name, args);
        let text = "";
        if (args.currency === "unknown" || !args.currency) {
          text = await showExchangeRate();
        } else {
          text = await showExchangeRate(args.currency);
        }

        const convo = {
          sessionId,
          rephrasedQuestion: userquestion,
          messages: {
            user: userquestion,
            assistant: text,
          },
        };

        const savedChat = await $.dorag().saveConvo(convo);
        await respond(text, history, true);
      })
      .on("*", async function ({ content }) {
        console.log(`CONTENT : ${JSON.stringify(content)}`);
        console.log("INTENT:faq_query");
        console.log(`sessionId: ${sessionId}`);
        console.log(`userquestion: ${userquestion}`);

        // const rephrasedQuestion = await $.dorag().rephrase(message);
        // const topMatches = await $.dorag().rag(rephrasedQuestion);
        const { rephrasedQuestion, relevantInfo, matches } = await $.dorag().rephraseWithRag({
          userquestion,
          rawHistory,
          rephrasingRules: rephrasing_rules,
          rephrasingConflict: rephrasing_conflict_resolution_rules,
          rephrasingExamples: rephrasing_examples,
        });
        console.log(`relevant info : ${relevantInfo}`);
        const sys_prompt = answer_llm_system_prompt_temp;
        const user_prompt = answer_llm_user_prompt_temp;
        const answer = await $.dorag().askllm({
          botIntroduction: bot_introduction,
          relevantInfo,
          rephrasedQuestion,
          noInfoResponse: no_info_response,
          sys_prompt,
          user_prompt,
          model: answer_llm,
        });
        const convo = {
          sessionId,
          rephrasedQuestion,
          matches,
          messages: {
            user: userquestion,
            assistant: answer.ans,
          },
        };

        const savedChat = await $.dorag().saveConvo(convo);
        if (answer.valid) {
          await respond(answer.ans, history);
        } else {
          await assignToAgent(history, answer.ans);
        }
      })
      .on(async function ({ content }) {
        console.log("INTENT:DEFAULT");
        console.log(`default content : ${JSON.stringify(content)}`);
        const convo = {
          sessionId,
          rephrasedQuestion : userquestion,
          messages : {
            user : userquestion,
            assistant : content
          }
        }
        const savedChat = await $.dorag().saveConvo(convo);
        await respond(content, history);
      });
}

async function create_prompt(systemContents, history, instructions) {
  instructions = instructions || [];
  let x = [
    ...systemContents.map(function (content) {
      return { role: "system", content: content };
    }),
    ...history,
    ...instructions.map(function (content) {
      return { role: "user", content: content };
    }),
  ];
  //console.log("x",x)
  return x;
}

async function respond(answer, history, dummy) {
  //console.log("Responding", answer);
  history.push({
    role: "assistant",
    content: `${answer}`,
  });
  await $.store.local.set("history", history);
  if (!dummy)
    await $.reply({
      text: { body: `${answer}` },
      // options: {
      //   buttons: [
      //     {
      //       code: "#",
      //       label: "Chat with Agent",
      //     },
      //     {
      //       code: "E",
      //       label: "Exit Chat",
      //     },
      //   ],
      // },
    });
}

async function assignToAgent(history, response) {
  if (!history) {
    let historyResp = await $.store.local("history");
    history = historyResp.history || [];
  }
  //console.log("Escalation triggered. Routing to human agent...");
  const options = await $.session.app.options();
  let prompt = await create_prompt([options.assistant_prompt], history, [
    `
        ${options.conversation_summary_prompt}
      `,
  ]);
  let resp2 = await $.openai.next(prompt);
  if (response) {
    await respond(response, history);
  }
  try {
    console.log("note >", resp2.message().content);
    await $.session.route.to.agent({
      note: resp2.message().content,
    }); // Redirect to human agent
    console.log("agent call success");
  } catch (e) {
    console.log("agent call failure", e);
  }
}

async function showExchangeRate(currency) {
  console.log("showExchangeRate", currency);
  try {
    if (currency)
      return await $.rest({
        url: `${apiEndPoint}/webchat/exchangeRate?currencyCode=${currency}&getPredecidedExchRates=false`,
      })
        .get()
        .json(showExchangeRateResults);
    else {
      return await $.rest({
        url: `${apiEndPoint}/webchat/exchangeRate?getPredecidedExchRates=true`,
      })
        .get()
        .json(showExchangeRateResults);
    }
  } catch (e) {
    console.log("----", e);
    let message = `Unable to fetch exchange rates. Please try again later.`;
    await $.reply({
      text: {
        body: message,
      },
    });
    return message;
  }
}

async function showExchangeRateResults(json) {
  //console.log("showExchangeRateResults");
  let template = null;

  switch (json.statusKey) {
    case "Exchange Rate Not Found":
      switch (json.status) {
        case "Missing currency code input":
          template = "exchange_rate_entry_error";
          //Sorry, we did not receive any input. Please enter the 3-letter currency code for getting rates. Eg.: USD for US Dollar
          break;
        case "Invalid Currency Input":
          template = "exchange_rate_entry_error";
          //The Currency Code entered is invalid. Please enter a valid 3 Letter Currency Code to get the rate. Eg.: USD for US Dollars
          break;
        default:
          if (json.status.indexOf("Setup Missing") > -1) {
            console.log("showExchangeRateResults", json.status);
          }
          template = "exchange_rate_is_not_available";
        // Sorry, this Exchange Rate is not available at this point of time. Please try again later.
      }
      break;
    default:
      template = json.results.length > 1 ? "exchange_rate_bulk" : "exchange_rate_single";
  }

  await $.reply({
    template: {
      code: template,
      data: json.results.reduce(
        function (r, n, i) {
          r["dc" + i] = n.localIsoCurrencyCode;
          r["da" + i] = n.localAmount;
          r["fc" + i] = n.foreignIsoCurrencyCode;
          r["fa" + i] = n.foreignAmount;
          return r;
        },
        { message: "" }
      ),
    },
  });
  return json.results.map(function (res) {
    return `${res.localIsoCurrencyCode} ${res.localAmount} = ${res.foreignIsoCurrencyCode} ${res.foreignAmount}`;
  }).join(`
  `);
}
