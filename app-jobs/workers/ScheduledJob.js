import { Job } from "@bootloader/core/decorators";

const TASKS = [{ task: 1 }, { task: 2 }, { task: 3 }, { task: 4 }];

@Job({ name: "scheduledJob", workers: 4, executionStrategy: Job.EXECUTION_STRATEGY.CONCURRENT, schedule: '*/5 * * * * *' })
export default class ScheduledJob {
  async onRun(job,{jobId}) {
    console.log(`running...`, jobId);
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onExecute(task, options) {
    console.log(`executing:`, task, options);
    await this.sleep(5000);
  }

  async onAggregate(tasks, options) {
    console.log(`aggregated:`, tasks, options);
    await this.sleep(5000);
  }
}
