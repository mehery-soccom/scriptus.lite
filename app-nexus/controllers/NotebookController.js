import { Controller, RequestMapping, ResponseBody, ResponseView } from "@bootloader/core/decorators";
import mongon from "@bootloader/mongon";
const log4js = require("@bootloader/log4js");
import { ensure } from "@bootloader/utils";
import ajax from "../../@core/ajax";
import { redis, waitForReady } from "@bootloader/redison";
import { context } from "@bootloader/utils";
import config, { store } from "@bootloader/config";
import { z } from "zod";
import { generateEmbeddingOpenAi } from "../services/gpt";
import { collection_name } from "../models/clients";
import { vectorDb } from "../models/clients";
import { off } from "../app";
import { saveFaqs , fetchDocsByIds , getDocsUpdateStatus , deleteKbqaDocs , getPaginatedDocs , updateQaDocs } from "../services/kbqa";

import crypto from "crypto";
import UserService from "../services/UserService";

const console = log4js.getLogger("NotebookController");

const questionSchema = z.object({
  que: z.string().min(1, { message: "Question text cannot be empty." }).optional(),
  ans: z.string().min(1, { message: "Answer text cannot be empty." }).optional(),
});

async function insertQaPairs(collection_name, data){
  return await vectorDb.insert({collection_name, data});
}
const qapairs = z.object({
  kb_id: z.string({ required_error: "kb_id is required." }).min(1, { message: "kb_id cannot be empty." }),
  ques: z.array(questionSchema, { required_error: "ques array is required." })
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
async function deleteQaDocs(ids , tenant_partition_key){
  const resVectorDb = await deleteQaDocsVectorDb(ids,tenant_partition_key);
  const mongodeleteResult = await deleteKbqaDocs(ids,tenant_partition_key)
  return { resVectorDb , mongodeleteResult };
  // return { resVectorDb };
}
async function deleteQaDocsVectorDb(ids,tenant_partition_key){
  const filter = `tenant_partition_key == "${tenant_partition_key}" AND article_id in ${JSON.stringify(ids)}`;
  const resVectorDb = await vectorDb.delete({
    collection_name : collection_name,
    filter : filter
  });
  return { resVectorDb };
}

@Controller("/notebook")
export default class NotebookController {
  constructor() {
    console.info("===NotebookController instantsiated:", this.constructor);
  }

  @ResponseView
  @RequestMapping({ path: "/list", method: "get", query: {} })
  async homePage() {
    return UserService.getUsersAll();
  }

  @RequestMapping({ path: "/create", method: "post", form: { name: "NAME", email: "name@name.com", code: "COD" } })
  @ResponseBody
  async postMessage({
    request: {
      body: { name, email, code },
      cookies,
    },
    response,
  }) {
    ensure.params({ name, email, code }).required();
    console.log("createUsers", { name, email, code });
    return UserService.createUsers({ name, email, code });
  }

  @ResponseView
  @RequestMapping({ path: ["","/*"], method: "get" })
  async defaultPage({ CONST }) {
    CONST.WEBAPP = "nexus/notebook";
    return "notebook";
  }

  @RequestMapping({ path : '/api/qapairs' , method : "delete"})
  @ResponseBody
  async deleteQaPairs({ request }){
    const body = request.body;
    const ids = body.del_ids;
    // console.log(`body : ${JSON.stringify(body)}`);
    // console.log(`ids : ${JSON.stringify(ids)}`);
    const tenant_partition_key = context.getTenant();
    // const filter = `tenant_partition_key == "${tenant_partition_key}"`;
    const delRes = await deleteQaDocs(ids , tenant_partition_key);
    return { ids , tenant_partition_key , delRes };
  }

  @RequestMapping({ path : '/api/qapairs/mongodb' , 'method' : "get"})
  @ResponseBody
  async getQaPairsMongodb({ request }){
    const query = request.query;
    console.log(JSON.stringify(query))
    const page = Number(query.page)
    const pageSize = Number(query.pageSize)
    const tenant_partition_key = context.getTenant();
    const lastSeenId = query.lastSeenId || null;
    const paginatedDocs = await getPaginatedDocs(tenant_partition_key , lastSeenId , pageSize , page);
    console.log(`page data length = ${paginatedDocs.data.length}`)
    return { data : paginatedDocs.data , 
      lastSeenId : paginatedDocs.nextCursor , 
      total : paginatedDocs.totalCount , 
      totalPages : paginatedDocs.totalPages ,
      currentPage : page 
    };
  }

  @RequestMapping({ path : '/api/qapairs/vectordb' , method : "get"})
  @ResponseBody
  async getQaPairsVectordb({ request }){
    const query = request.query;
    console.log(JSON.stringify(query))
    const page = Number(query.page)
    const pageSize = Number(query.pageSize)
    const tenant_partition_key = context.getTenant();
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
  @RequestMapping({ path : "/api/qapairs" , method : "patch" })
  @ResponseBody
  async qaUpdate({ request }){
    const body = request.body;
    const updateDocs = body.updateDocs;
    const update_ids = updateDocs.map(doc => doc._id);
    const storedDocs = await fetchDocsByIds(update_ids);
    const tenant_partition_key = context.getTenant();
    const newDocs = await getDocsUpdateStatus(updateDocs,storedDocs);
    const updatedDocs = await updateQaDocs(newDocs);
    const resVectorDb = await deleteQaDocsVectorDb(update_ids, tenant_partition_key);
    let data = [];
    for(const doc of newDocs){
      const questionEmbedding = await generateEmbeddingOpenAi(doc.question); 
      const element = {
        tenant_partition_key: doc.tenant_partition_key,
        kb_id : doc.kb_id,
        article_id : doc._id,
        fast_dense_vector: questionEmbedding,
        knowledgebase: `Question : ${doc.question} \n Answer : ${doc.answer}`,
        question : doc.question,
        answer : doc.answer,
      };
      data.push(element);
    }
    const res = await insertQaPairs(collection_name,data);
    // const ids = res.IDs.int_id.data;
    // const stored_data = await vectorDb.get({
    //   collection_name : collection_name,
    //   ids : ids,
    //   output_fields : ['id','kb_id','article_id','knowledgebase','question','answer','tenant_partition_key']
    // });
    // const mongo_data = stored_data.data;
    // const mongo_saved_data = await saveFaqs(mongo_data);
    // const delRes = await deleteQaDocs(docIds, tenant_partition_key);
    // return { mongo_saved_data , resVectorDb : res, delRes };
    return { mongoUpdate : updatedDocs , vectorDbDel : resVectorDb , vectorDbIns : res };
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
    
    let data = [];
    for (const item of ques) {
      
      const element = {
        tenant_partition_key: tenant_partition_key,
        
        knowledgebase: `Question : ${item.que} \n Answer : ${item.ans}`,
        question : item.que,
        answer : item.ans,
        kb_id,
        // article_id,
      };
      data.push(element);
    }
    const mongo_saved_data = await saveFaqs(data);
    let vectorDbData = [];
    for(const doc of mongo_saved_data){
      console.log(`docs : ${doc}`);
      const questionEmbedding = await generateEmbeddingOpenAi(doc.question); 
      const vectorDbDoc = {
        tenant_partition_key : tenant_partition_key,
        fast_dense_vector: questionEmbedding,
        knowledgebase: `Question : ${doc.question} \n Answer : ${doc.answer}`,
        question : doc.question,
        answer : doc.answer,
        article_id : doc._id,
        kb_id : doc.kb_id
      }
      vectorDbData.push(vectorDbDoc);
    }

    // console.log(`data : ${JSON.stringify(data)}`)

    const res = await insertQaPairs(collection_name,vectorDbData);
    // const ids = res.IDs.int_id.data;
    // console.log(`ids : ${ids}`);
    // const stored_data = await vectorDb.get({
    //   collection_name : collection_name,
    //   ids : ids,
    //   output_fields : ['id','kb_id','article_id','knowledgebase','question','answer','tenant_partition_key']
    // });
    // const mongo_data = stored_data.data;
    // console.log(`mongo_data : ${JSON.stringify(mongo_data)}`);
    
    // console.log(`retrived data length : ${stored_data.data.length}`);
    return { tenant_partition_key, ques, kb_id, collection_name , mongo_saved_data , res };
    // return { mongo_saved_data , res };
  }
}
