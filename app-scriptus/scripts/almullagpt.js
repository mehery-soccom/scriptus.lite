var apiEndPoint = "https://apid-kwt.amxremit.com/bot/ext";

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

/*
async function onMessageReceive() {
  console.log("onMessageReceive");
  let resp = await $.reply(`Response(${$.inbound.getText()})`).listen(listenHandler);
  console.log("Response:", resp);
}
async function listenHandler() {
  console.log("listenHandler");
  let resp = await $.reply(`2 Response(${$.inbound.getText()})`);
  console.log("Response:", resp);
}
*/

async function onMessageReceive() {
  //return await onHandleDefault();
  let inputCode = ($.inbound.getCode() || "").toUpperCase();
  //console.log("handleInput",inputCode);
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
  let { history } = await $.store.local("history");
  history = history || [];
  history.push({
    role: "user",
    content: $.inbound.getText(),
  });
  let prompt = await create_intent(history);
  let resp = await $.openai.next(prompt, functions);
  console.log("resp", resp);
  console.log("resp.message()", resp.message());
  console.log("resp.isError()", resp.isError());
  console.log("resp.error()", resp.error());

  resp.function_call &&
    resp
      .function_call(function ({ content }) {
        //console.log("intentResponse", content);
        //const match = content.match(/intent\((?<intent>\w+)(:(?<params>[\w\d]+))?\)/i);
        const match = content.match(/intent\((?<intent>\w+)(:(?<params>.+?))?\)/);
        if (match && match.groups) {
          //console.log("MATCHED")
          let arg1 = match.groups.params ? match.groups.params.trim() : null;
          let cleanedContent = content.replace(match[0], "").trim();
          //console.log("cleanedContent=",cleanedContent)
          return {
            name: match.groups.intent,
            arguments: {
              currency: arg1,
              response: cleanedContent || content,
            },
          };
        } else if (["faq_query", "exchange_rates", "connect_agent"].indexOf(content) > -1) {
          return {
            name: content,
            arguments: {},
          };
        }
        return {
          // name: "greetings", arguments: {}
        };
      })
      .on("connect_agent", async function ({ name, arguments }) {
        console.log("INTENT:connect_agent", name, arguments);
        await assignToAgent(history, arguments.response);
      })
      .on("exchange_rates", async function ({ name, arguments }) {
        console.log("INTENT:exchange_rates", name, arguments);
        let text = "";
        if (arguments.currency === "unknown" || !arguments.currency) {
          text = await showExchangeRate();
        } else {
          text = await showExchangeRate(arguments.currency);
        }
        await respond(text, history, true);
      })
      .on("*", async function ({ content }) {
        console.log("INTENT:faq_query");
        const options = await $.session.app.options();
        console.log("code : options.knowbase", options.knowbase);
        let knowledgeBase = await $.master.knowbase({ code: options.knowbase });
        let knowledgeBaseStr = knowledgeBase
          .map(function (nb) {
            return `
            ${nb.title}
            ${nb.content}
          `;
          })
          .join("");
        //knowledgeBaseStr = "";
        // console.log("response.config", response.config)
        let prompt = await create_prompt(
          [
            `${options.knowbase_prompt}
          ${knowledgeBaseStr}
          `,
          ],
          history
        );
        let resp2 = await $.openai.next(prompt);
        //console.log("resp2.message()", resp2.message());
        await respond(resp2.message().content, history);
      })
      // .on(async function ({ content  }) {
      //   console.log("INTENT:DEFAULT");
      //   const options = await $.session.app.options();
      //   console.log("code : options.knowbase", options.knowbase);
      //   let knowledgeBase = await $.master.knowbase({ code: options.knowbase });
      //   let knowledgeBaseStr = knowledgeBase
      //     .map(function (nb) {
      //       return `
      //         ${nb.title}
      //         ${nb.content}
      //       `;
      //     })
      //     .join("");
      //   //knowledgeBaseStr = "";
      //   // console.log("response.config", response.config)
      //   let prompt = await create_prompt(
      //     [
      //       `${options.knowbase_prompt}
      //       ${knowledgeBaseStr}
      //       `,
      //     ],
      //     history
      //   );
      //   let resp2 = await $.openai.next(prompt);
      //   //console.log("resp2.message()", resp2.message());
      //   await respond(resp2.message().content, history);
      // })
      // .on("greetings", async function ({ name, arguments,content }) {
      //   console.log("INTENT:greetings",arguments);
      //   await respond(arguments.response || content, history);
      // })
      .on(async function ({ content }) {
        console.log("INTENT:DEFAULT");
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

async function create_intent(history) {
  const options = await $.session.app.options();
  return await create_prompt(
    [
      `
    ${options.intent_prompt}
    
The user will provide input, and you must classify it as one of the following intents :- 
- "faq_query" if they have any query related to application or remittance
- "exchange_rates" if they want exchange rate information or live rates
- "connect_agent" if they want to talk to a live agent
- For general greetings do not give any intent

Respond in the format:
intent(<intent_name>:<params>)
- If the intent is "exchange_rates", <params> should always be the **target currency ISO code** (e.g., USD, EUR) extracted from the user input. The base currency is **always KWD**.
- If the user mentions the target currency explicitly (like USD, EUR, etc.), return that currency as <params>.
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

Note: Keep asking more questions until intent is not clear  
- If customer asks "what are rates today" it is exchange_rates inquiry
- You MUST return the response ONLY in the exact format: intent(<intent_name>:<params>). Any deviation from this format is strictly prohibited."
Remember Customer's Language Preference
- While transferrig to human/live agent always append intent(connect_agent) in specified format.
    `,
      options.escalation_prompt,
    ],
    history
  );
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
    console.log("note", resp2.message().content);
    await $.session.route.to.agent({
      note: resp2.message().content,
    }); // Redirect to human agent
  } catch (e) {
    console.log("eee===");
  }
}

async function showExchangeRate(currency) {
  //console.log("showExchangeRate", currency);
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
