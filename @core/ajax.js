const fetch = require("node-fetch");

const AbortController = globalThis.AbortController || require("abort-controller");
const REQUEST_TIMOUT = 5000;

const console = require("@bootloader/log4js").getLogger("ajax");

function createTimeout(time) {
  const controller = new AbortController();
  controller.timeout = setTimeout(() => {
    controller.abort();
  }, time || REQUEST_TIMOUT);
  return controller;
}

async function request(url, method, headers, body) {
  //console.log("Request:", url, method, headers, body);
  try {
    const timer = createTimeout();
    const response = await fetch(url, {
      method,
      mode: "cors",
      cache: "no-cache",
      credentials: "same-origin",
      headers,
      redirect: "follow",
      referrerPolicy: "no-referrer",
      body: body,
      signal: timer.signal,
    });
    if (!response.ok) {
      let json = await response.json();
      console.log("Response:", json);
      throw new Error(`Response status: ${response.status}`);
    }
    clearTimeout(timer.timeout);
    return response;
  } catch (error) {
    console.log(`${method} Error:`, error);
    //LOGGER.error(`${method} Error:`, error)
    throw error;
  }
}

function RespPromise(promise) {
  this.text = async function (callback) {
    let response = await promise;
    let textResponse = await response.text();
    if (typeof callback == "function") return await callback(textResponse);
    return textResponse;
  };

  this.json = async function (callback) {
    let response = await promise;
    let jsonResponse = await response.json();
    if (typeof callback == "function") return await callback(jsonResponse);
    return jsonResponse;
  };
}

module.exports = function (options) {
  if (typeof options == "string") {
    options = { url: options };
  }
  options.headers = options.headers || {};

  return {
    post(json) {
      return new RespPromise(
        request(
          options.url,
          "POST",
          {
            "Content-Type": "application/json",
            ...options.headers,
          },
          JSON.stringify(json)
        )
      );
    },
    put(json) {
      return new RespPromise(
        request(
          options.url,
          "PUT",
          {
            "Content-Type": "application/json",
            ...options.headers,
          },
          JSON.stringify(json)
        )
      );
    },
    submit(form) {
      let data = new URLSearchParams();
      for (let key in form) {
        data.append(key, form[key]);
      }
      return new RespPromise(
        request(
          options.url,
          "PUT",
          {
            "Content-Type": "application/x-www-form-urlencoded",
            ...options.headers,
          },
          data
        )
      );
    },
    get(query) {
      let data = new URLSearchParams();
      for (let key in query) {
        data.append(key, query[key]);
      }
      let url = options.url.split("?");
      let endUrl = url[0] + "?" + (url[1] || "") + "&" + data.toString();
      return new RespPromise(request(endUrl, "GET", options.headers));
    },
    delete(query) {
      let data = new URLSearchParams();
      for (let key in query) {
        data.append(key, query[key]);
      }
      let url = options.url.split("?");
      let endUrl = url[0] + "?" + (url[1] || "") + "&" + data.toString();
      return new RespPromise(request(endUrl, "DELETE", options.headers));
    },
  };
};
