import { Job } from "@bootloader/core/decorators";

const TASKS = [{ task: 1 }, { task: 2 }, { task: 3 }, { task: 4 }];

@Job({ name: "sendCampaign", workers: 4 })
export default class SendCampaignJob {
  async onRun(job) {
    console.log(`running...`, job);
    this.execute(TASKS.pop());
    this.execute(TASKS.pop());
    if (TASKS.length.length == 0) {
      return false; //Do not continue the Job
    } else {
      return true; //Continue running
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onExecute(task) {
    console.log(`executing:`, task);
    await this.sleep(5000);
  }
}
