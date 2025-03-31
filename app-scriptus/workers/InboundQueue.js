import { Job } from "@bootloader/core/decorators";
import { ChatBox } from "./../../@core/scriptus";
import { XMSAdapter, LocalAdapter } from "./../../@core/scriptus/adapters";

ChatBox.load({
  dir: "../",
});

@Job({ name: "inboundQueue", workers: 4 })
export default class InboundQueue {
  async run(job, {}) {
    console.log(`running...`, job);
  }

  async execute(message, { queue }) {
    //console.log("InboundQueue > execute > " + queue, JSON.stringify(message));
    const contact_id = queue;
    const sessionId = queue;
    try {
      new ChatBox({
        adapter: message.meta
          ? new XMSAdapter({ message: message, contact_id, sessionId })
          : new LocalAdapter({ message: message, contact_id, sessionId }),
      }).execute();
    } catch (e) {
      console.error("InboundQueue > execute > ", e);
    }
  }

  async poll(data) {
    console.log("data====", data);
  }
}
