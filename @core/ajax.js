const fetch = require("node-fetch");
import ChainedPromise from "./lib/ChainedPromise";

const AbortController = globalThis.AbortController || require("abort-controller");
const REQUEST_TIMOUT = 50000;

const console = require("@bootloader/log4js").getLogger("ajax");

function createTimeout(time) {
  const controller = new AbortController();
  controller.timeout = setTimeout(() => {
    controller.abort();
  }, time || REQUEST_TIMOUT);
  return controller;
}

async function request(url, method, headers, body) {
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

class RespPromise extends ChainedPromise {
  constructor(executor = (resolve) => resolve(0)) {
    super(executor);
  }
  text(callback) {
    return this.chain(async function (response) {
      let textResponse = await response.text();
      if (typeof callback == "function") return await callback(textResponse);
      return textResponse;
    });
  }

  json(callback) {
    return this.chain(async function (response) {
      let jsonResponse = await response.json();
      if (typeof callback == "function") return await callback(jsonResponse);
      return jsonResponse;
    });
  }

  request(url, method, headers, body, options) {
    this._request = { url, method, headers, body };
    if (options.debug) console.log("Request", this._request);
    return this.chain(async function (parentResp) {
      return await request(url, method, headers, body);
    });
  }

  print() {
    return this.chain(async function (parentResp) {
      console.log("Response", parentResp);
    });
  }
}

export default function (options) {
  if (typeof options == "string") {
    options = { url: options };
  }
  options.headers = options.headers || {};

  return {
    post(json) {
      return new RespPromise().request(
        options.url,
        "POST",
        {
          "Content-Type": "application/json",
          ...options.headers,
        },
        JSON.stringify(json)
      );
    },
    put(json) {
      return new RespPromise().request(
        options.url,
        "PUT",
        {
          "Content-Type": "application/json",
          ...options.headers,
        },
        JSON.stringify(json),
        options
      );
    },
    submit(form) {
      let data = new URLSearchParams();
      for (let key in form) {
        data.append(key, form[key]);
      }
      return new RespPromise().request(
        options.url,
        "PUT",
        {
          "Content-Type": "application/x-www-form-urlencoded",
          ...options.headers,
        },
        data,
        options
      );
    },
    get(query) {
      let data = new URLSearchParams();
      for (let key in query) {
        data.append(key, query[key]);
      }
      let url = options.url.split("?");
      let endUrl = url[0] + "?" + (url[1] || "") + "&" + data.toString();
      return new RespPromise().request(
        endUrl,
        "GET",
        {
          "Content-Type": "application/json",
          Accept: "application/json",
          Connection: "keep-alive",
          ...options.headers,
        },
        undefined,
        options
      );
    },
    delete(query) {
      let data = new URLSearchParams();
      for (let key in query) {
        data.append(key, query[key]);
      }
      let url = options.url.split("?");
      let endUrl = url[0] + "?" + (url[1] || "") + "&" + data.toString();
      return new RespPromise().request(endUrl, "DELETE", options.headers, undefined, options);
    },
  };
}
