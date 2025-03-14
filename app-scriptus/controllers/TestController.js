import { Controller, RequestMapping, ResponseBody, ResponseView } from "@bootloader/core/decorators";
import ajax from "../../@core/ajax";
import { redis, waitForReady } from "@bootloader/redison";

@Controller("/test")
export default class TestController {
  constructor() {
    console.log("===TestController instantsiated:", this.constructor);
  }

  @ResponseView
  @RequestMapping({ path: "/home", method: "get" })
  async homePage() {
    return "home";
  }

  @ResponseBody
  @RequestMapping({ path: "/api/messages", method: "get" })
  async getMessage({ headers }) {
    let keys = [];
    let resp = await ajax("https://app.mehery.xyz/pub/amx/device").get({ key: "app.name" });

    keys.push((await resp.json()).meta["app.name"]);

    let resp2 = await ajax("https://app.mehery.xyz/pub/amx/device").get({ key: "app.name" }).json();
    keys.push(resp2.meta["app.name"]);
    return [{ id: 1, keys: keys }];
  }

  @RequestMapping({ path: "/api/messages", method: "post" })
  @ResponseBody
  async postMessage() {
    return [{ id: 1, name: "John Doe" }];
  }

  @RequestMapping({ path: "/api/queue", method: "get" })
  @ResponseBody
  async getQueue() {
    console.log("ppppppppps");
    await redis.lpush("eq:app:XMS:topic:TEST_TOPIC", JSON.stringify({ data: {motp : "235"} }));
    console.log("pppppppppe");
    //redis.keys("*").then(console.log);
    return [{ id: 1, name: "John Queue" }];
  }

  @ResponseView
  @RequestMapping({ path: "/*", method: "get" })
  async defaultPage() {
    return "home";
  }
}
