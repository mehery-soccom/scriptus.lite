import { Controller, RequestMapping, ResponseBody, ResponseView } from "@bootloader/core/decorators";
import ajax from "../../@core/ajax";
import { redis, waitForReady } from "@bootloader/redison";
import { context } from "@bootloader/utils";
import config from "@bootloader/config";
import { z } from "zod";
import { generateEmbeddingOpenAi } from "../services/gpt";
import { insertQaPairs } from "../services/rag";
import { collection_name } from "../models/clients";
import { vectorDb } from "../models/clients";
import { off } from "../app";
const questionSchema = z.object({
  que: z.string().min(1, { message: "Question text cannot be empty." }).optional(),
  ans: z.string().min(1, { message: "Answer text cannot be empty." }).optional(),
});

// Main schema with required fields
const qapairs = z.object({
  kb_id: z.string({ required_error: "kb_id is required." }).min(1, { message: "kb_id cannot be empty." }),
  article_id: z.string({ required_error: "article_id is required." }).min(1, { message: "article_id cannot be empty." }),
  ques: z
    .array(questionSchema, { required_error: "ques array is required." })
    .nonempty({ message: "ques array cannot be empty." })
    .superRefine((ques, ctx) => {
      ques.forEach((q, index) => {
        if (q.que === undefined) {
          ctx.addIssue({
            path: ["ques", index, "que"],
            message: `Question at index ${index + 1} is missing.`,
          });
        } else if (q.que.trim() === "") {
          ctx.addIssue({
            path: ["ques", index, "que"],
            message: `Question at index ${index + 1} cannot be empty.`,
          });
        }

        if (q.ans === undefined) {
          ctx.addIssue({
            path: ["ques", index, "ans"],
            message: `Answer for question at index ${index + 1} is missing.`,
          });
        } else if (q.ans.trim() === "") {
          ctx.addIssue({
            path: ["ques", index, "ans"],
            message: `Answer for question at index ${index + 1} cannot be empty.`,
          });
        }
      });
    }),
});

@Controller("/qa")
export default class QaController {
  constructor() {
    console.log("===TestController instantsiated:", this.constructor);
  }

  @ResponseView
  @RequestMapping({ path: "/home", method: "get" })
  async homePage() {
    return "home";
  }
  @RequestMapping({ path : '/api/qapairs' , method : "delete"})
  @ResponseBody
  async deleteQaPairs({ request }){
    const body = request.body;
    const ids = body.del_ids;
    // console.log(`body : ${JSON.stringify(body)}`);
    // console.log(`ids : ${JSON.stringify(ids)}`);
    const tenant_partition_key = body.tenant_partition_key;
    const filter = `tenant_partition_key == "${tenant_partition_key}" AND id in [${ids}]`;
    const res = await vectorDb.delete({
      collection_name : collection_name,
      filter : filter
    });
    return { ids , tenant_partition_key , filter : filter , res : res };
    
  }
  @RequestMapping({ path : '/api/qapairs' , method : "get"})
  @ResponseBody
  async getQaPairs({ request }){
    const query = request.query;
    console.log(JSON.stringify(query))
    const page = Number(query.page)
    const pageSize = Number(query.pageSize)
    const tenant_partition_key = query.tenant_partition_key || context.getTenant();
    const countResult = await vectorDb.query({
      collection_name: collection_name,
      filter: `tenant_partition_key == "${tenant_partition_key}"`,
      output_fields: ['count(*)']
    });
    const total = countResult.data[0]['count(*)'];
    const totalPages = Math.ceil(total / pageSize);
    const output_fields = ['id','kb_id','article_id','knowledgebase']
    let paginationQuery = {}
    if(page<=1){
      paginationQuery = {
        collection_name: collection_name,
        filter: `tenant_partition_key == "${tenant_partition_key}"`,
        output_fields: output_fields,
        limit: pageSize
      }
    } else {
      const lastSeenId = BigInt(query.lastSeenId);
      paginationQuery = {
        collection_name: collection_name,
        filter: `tenant_partition_key == "${tenant_partition_key}" AND id > ${lastSeenId}`,
        output_fields: output_fields,
        limit: pageSize
      }
    }
    const queryResult = await vectorDb.query(paginationQuery);
    // if (queryResult.data.length > pageSize) {
    //   // Remove the extra document we fetched
    //   queryResult.data.pop();
    // }
    console.log(`page data length = ${queryResult.data.length}`)
    const data = queryResult.data;
    const sorted = data.sort((a, b) => {
      const idA = BigInt(a.id);
      const idB = BigInt(b.id);
    
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    });
    
    const lastSeenId = sorted[sorted.length - 1]?.id;
    return {
      data: sorted,
      lastSeenId : lastSeenId,
      total,
      totalPages,
      currentPage: page
    };
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

  @RequestMapping({ path: "/api/qapairs", method: "post" })
  @ResponseBody
  async qaEmbed({ request }) {
    const body = request.body;
    try {
      qapairs.parse(body);
      console.log("Validation Passed ✅");
    } catch (err) {
      if (err instanceof z.ZodError) {
        // console.error("Validation Failed ❌", err.errors);
        const errorMessages = err.errors.map((e) => e.message).join(" | ");
        console.log(err.errors)
        // Return a structured HTTP 400 response
        const response = {
          status: 400,
          error: "Validation Failed ❌",
          message: errorMessages,
        };
        return { response };
      }
    }
    
    // const tenant_domain =   //"kedar";
    // const server = config.getIfPresent("mry.scriptus.server");
    const tenant_partition_key = context.getTenant();
    // console.log(`<<<<<TENANT: ${JSON.stringify(tenant_partition_key)}`, );
    const ques = body.ques;
    const kb_id = body.kb_id;
    const article_id = body.article_id;
    let data = [];
    for (const item of ques) {
      const questionEmbedding = await generateEmbeddingOpenAi(item.que); 
      const element = {
        tenant_partition_key: tenant_partition_key,
        fast_dense_vector: questionEmbedding,
        knowledgebase: `Question : ${item.que} \n Answer : ${item.ans}`,
        kb_id,
        article_id,
      };
      data.push(element);
    }
    // console.log(`data : ${JSON.stringify(data)}`)
    const res = await insertQaPairs(collection_name,data);
    console.log(JSON.stringify(res));
    return { tenant_partition_key, ques, kb_id, article_id , collection_name , result : res };
  }

  @RequestMapping({ path: "/api/messages", method: "post" })
  @ResponseBody
  async postMessage() {
    return [{ id: 1, name: "John Doe" }];
  }

  @RequestMapping({ path: "/api/queue", method: "get" })
  @ResponseBody
  async getQueue() {
    await redis.lpush("eq:app:XMS:topic:TEST_TOPIC", JSON.stringify({ data: { motp: "235" } }));
    //redis.keys("*").then(console.log);
    return [{ id: 1, name: "John Queue" }];
  }

  // @ResponseView
  // @RequestMapping({ path: "/*", method: "get" })
  // async defaultPage() {
  //   return "home";
  // }
}
