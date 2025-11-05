# 🧭 Conceptual Model: How a Job Works

Every **Job** in this framework is composed of **three conceptual stages**:
`Run`, `Execute`, and `Aggregate`.
Together, these form the complete lifecycle of a background process —
from initiating work, to performing distributed tasks, to consolidating results.

---

## 1. **Run → The Job Instance**

`Run` represents a **single execution instance of a Job**.

* A job can be **triggered manually** (`MyTask.run()`) or **scheduled automatically**
  using a cron expression like `@Job({ schedule: "* * * * *" })`.
* Each trigger — whether manual or scheduled — creates a **new job instance**.
* Within a single job run, you can repeatedly continue execution
  by returning `true` (the framework will re-run the same job instance again).
* Returning `false` stops the job instance gracefully.

Think of **Run** as:

> “What should this job do as a whole?”
> “Should I keep running again or stop?”

It’s like the **brain** of the job — deciding what needs to be done and when to stop.

---

## 2. **Execute → The Task Workers**

`Execute` represents the **individual units of work** that a job breaks itself into.

* Each `Run` can produce multiple small **tasks**.
* These tasks are distributed and processed by workers according to the **execution strategy**:

  * **Concurrent** – tasks run in parallel.
  * **Sequential** – tasks run in order.
  * **Mutex** – one task per lock/key (prevents overlapping for same entity).
* Each execution is isolated, lightweight, and retryable.

Conceptually:

> “How should each piece of this job be processed?”

It’s like the **muscle** of the job — where the actual heavy lifting happens.

---

## 3. **Aggregate → The Summary Stage**

`Aggregate` represents the **collection and summarization** of completed tasks.

* Tasks belonging to the same logical group (e.g., campaign, batch, or user)
  can be aggregated periodically or at the end of a job run.
* The aggregate stage is ideal for **reporting**, **batch summarization**, or **cleanup**.

Conceptually:

> “What did all these tasks produce together?”
> “How do I combine their outcomes?”

It’s like the **heart** of the job — collecting and summarizing everything that happened.

---

## 🧩 Putting It All Together

| Stage         | Represents                | Scope              | Typical Role                          |
| ------------- | ------------------------- | ------------------ | ------------------------------------- |
| **Run**       | Job instance lifecycle    | Whole job          | Controls flow and triggers executions |
| **Execute**   | Individual task operation | Per task           | Processes or performs actual work     |
| **Aggregate** | Post-task summarization   | Per group or batch | Compiles results, reports, or cleanup |

---

## 🔁 Example Timeline (Conceptually)

```
MyTask.run()     ──▶  generates tasks
                     │
                     ▼
MyTask.execute()  ──▶  processes each task (possibly across multiple workers)
                     │
                     ▼
MyTask.aggregate()──▶  combines task results into summary or report
```

Each **Run** can lead to **many Executes**, which may later feed into a single **Aggregate** step.

---

## 🕒 Scheduling and Repetition

* **Manual trigger:** `MyTask.run()` starts immediately.
* **Scheduled trigger:** `@Job({ schedule: "* * * * *" })` runs per cron event.
* Each trigger creates a **new, independent job instance**.
* If `onRun` returns `true`, the same job instance repeats internally
  (without needing a new cron event).

So:

> * **Cron hit → new job instance**
> * **Return `true` → repeat current job instance**

---

## 🧠 In Essence

| Concept     | Analogy          | Purpose                      |
| ----------- | ---------------- | ---------------------------- |
| `Run`       | The **director** | Decides what needs to happen |
| `Execute`   | The **workers**  | Perform the actual work      |
| `Aggregate` | The **reporter** | Summarizes what’s done       |

Together, these three phases let you define jobs that are:

* **Scalable** (through parallel task execution)
* **Controlled** (through execution strategies)
* **Insightful** (through aggregation and summary)

---
```
┌────────────────────┐
│     MyTask.run()   │
│  (plan & delegate) │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  MyTask.execute()  │
│  (distributed work)│
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ MyTask.aggregate() │
│ (summarize result) │
└────────────────────┘
```