var apiEndPoint = "https://apid-kwt.amxremit.com/bot/ext";

function get_intent_prompt() {
  return [
    `You are a Customer Support Assistant for al mulla exchange that handles faq queries about international money transfers (remittance) originating from Kuwait,
exchange rate queries, greeting and connect to agent requests. 
** Your current task : **
You MUST classify the user input into one of the following categories and respond **only** in the exact format:  
intent(<intent_name>:<params>)  
Any deviation from this format is strictly prohibited. Based in the guidelines, examples and instructions provided below.

The possible intents are:

1. **faq_query**  
- If the user's query is about international money transfers (remittance), including queries about sending money to a specific country, a country-currency combination, or payout details.  
- These will be handled by a RAG system, so your job is only to return the intent.

2. **exchange_rates**  
- If the user explicitly asks for exchange rates (e.g., “What is the exchange rate for USD?”).  
- Do NOT classify as "exchange_rates" if the user only mentions a currency without explicitly asking for the rate.  
- The <params> must be the **target currency ISO code** (e.g., USD, EUR).  
- If the currency is not mentioned, use: "intent(exchange_rates:unknown)".  
- The base currency is always KWD.

3. **connect_agent**  
- Use this intent if the user explicitly asks to speak to a human/live agent, uploads a file, or if the user is abusive or their request cannot be fulfilled via the system.

4. **greeting**    
- For greetings like "hi","hello","how are you ?", "what can you do ?", "what are you ?" or introductory messages, choose an appropriate helpful response.
- In the appropriate message describe yourself.  
  The format must be: "intent(greeting:<appropriate message>)"

5. **No Intent**  
- If none of the above categories match, return nothing. Do not invent or assume intent.

---

Examples:

- User Input: "Do you transfer money to Nepal?"  
  Response: intent(faq_query)

- User Input: "What is the exchange rate for USD?"  
  Response: intent(exchange_rates:USD)

- User Input: "Can I speak to a human?"  
  Response: intent(connect_agent)

- User Input: "Do you transfer EUR to Canada?"  
  Response: intent(faq_query)

- User Input: "What are the rates today?"  
  Response: intent(exchange_rates:unknown)

---

IMPORTANT RULES:
- Do not refer to Al Mulla Exchange in third person.
- Do not assume or infer any remittance availability — that will be handled by the retrieval system.
- Only return a single line in the required format. No explanations or extra text.
- Keep asking follow-up questions **only if** the intent is unclear AND no intent has been returned yet.`
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
    name: "greeting",
    description: "Respond to a greeting message from user",
    parameters: {
      type: "object",
      properties: {
        currency: {
          type: "string",
          description: "Appropriate response to users greeting",
        },
      },
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
    answer_llm
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
        console.log("function_call:MATCHED")
        let arg1 = match.groups.params ? match.groups.params.trim() : null;
        let cleanedContent = content.replace(match[0], "").trim();
        //console.log("cleanedContent=",cleanedContent)
        console.log(`matched name : ${match.groups.intent}`);
        console.log(`matched response : ${cleanedContent || content}`);
        console.log(`matched arg1 : ${arg1}`);
        return {
          name: match.groups.intent,
          args: {
            currency: arg1,
            response: cleanedContent || content,
          },
        };
      } else if (["faq_query", "exchange_rates", "connect_agent", "greeting"].indexOf(content) > -1) {
        console.log("function_call:MAPPED")
        return {
          name: content,
          args: {},
        };
      }
      console.log("function_call:NONE")
      return {
        // name: "greetings", args: {}
      };
    })
      .on("greeting", async function ( { name , args } ) {
        console.log("INTENT:greeting", name, args);
        const convo = {
          sessionId,
          rephrasedQuestion : userquestion,
          messages : {
            user : userquestion,
            assistant : args.currency
          }
        }
        const savedChat = await $.dorag().saveConvo(convo);
        await respond(args.currency, history); 
      } )
      .on("connect_agent", async function ({ name, args }) {
        console.log("INTENT:connect_agent", name, args);
        const willing_fileUpload_or_abusive_connect_agent = `We are transfering to a agent as per your request. Please be patient`
        await assignToAgent(history, willing_fileUpload_or_abusive_connect_agent);
      })
      .on("exchange_rates", async function ({ name, args }) {
        console.log("INTENT:exchange_rates", name, args);
        let text = "";
        if (args.currency === "unknown" || !args.currency) {
          text = await showExchangeRate();
        } else {
          text = await showExchangeRate(args.currency);
        }

        try{
          const convo = {
            sessionId,
            rephrasedQuestion: userquestion,
            messages: {
              user: userquestion,
              assistant: text || `Unable to fetch exchange rates. Please try again later.`,
            },
          };
          const savedChat = await $.dorag().saveConvo(convo);
        }catch(e){
          console.log("Error saving exchange rate : ",e);
        }
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
        
        const sys_prompt = 
`- If the retrieved information contains an answer that directly or indirectly addresses the user's question, respond using that information.
- This includes cases where the information implies a negative answer (e.g., if a currency, channel of transfer or service is not listed as available for a country, 
answer that it's not available).
- Compare lists carefully - if a user asks if X is possible and X is not in the list of possibilities, answer "no" based on the retrieved data.
- If no relevant information is found to either confirm or deny the user's question, trigger information_not_available() function provided as a tool.
- Do not require an exact wording match to provide an answer.
- Do not omit any information while answering.
- If place of transfer isnt a country. Respond with No we 
Never invent information. Prioritize using retrieved knowledge.`;
        const user_prompt = 
`Answer the user's question using the most relevant retrieved information from the Relevant Information above.
- If a retrieved FAQ directly answers the question, provide that answer.
- If the information implies a negative answer (e.g. a currency, channel of transfer, service not being in a list of supported currencies, channels of transfer, services for a country means 
it's not supported), clearly state this negative conclusion.
- When comparing lists, be thorough - if something is not in a list where it would be if it were allowed/supported, conclude it's not allowed/supported.
- If no information can be found that either confirms or denies the user's question, trigger 'information_not_available()' function provided as tool.`;
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
        const default_case_response = `I am a Customer Support Assistant for al mulla exchange that handles faq queries about international money transfers (remittance) originateing from Kuwait, 
exchange rate queries, greeting and connect to agent requests.
How may I help you ?`
        const convo = {
          sessionId,
          rephrasedQuestion : userquestion,
          messages : {
            user : userquestion,
            assistant : default_case_response
          }
        }
        const savedChat = await $.dorag().saveConvo(convo);
        await respond(default_case_response, history);
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
