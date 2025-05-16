import { Controller, RequestMapping, ResponseBody, ResponseView } from "@bootloader/core/decorators";
const log4js = require("@bootloader/log4js");
import { ensure } from "@bootloader/utils";
import ajax from "../../@core/ajax";
import { redis, waitForReady } from "@bootloader/redison";
import { context } from "@bootloader/utils";
import config, { store } from "@bootloader/config";
import { z } from "zod";
import { generateEmbeddingOpenAi } from "../services/gpt";
import { collection_kbarticle } from "../models/clients";
import { vectorDb } from "../models/clients";
import { off } from "../app";
import {
  createRandomString,
  createKbs,
  getAllKbs,
  saveDocs,
  getPaginatedArticleDocs,
  deleteArticleDocs,
  fetchArticlesByIds,
  getArticleUpdateStatus,
  updateArticleDocs
} from "../services/knowbase";

import crypto from "crypto";
import UserService from "../services/UserService";

const console = log4js.getLogger("KnowBaseController");

const DocumentSchema = z.object({
  document: z.string().min(1, { message: "Question text cannot be empty." }).optional(),
  title: z.string().min(1, { message: "Answer text cannot be empty." }).optional(),
});

async function insertQaPairs(collection_name, data) {
  return await vectorDb.insert({ collection_name, data });
}
const documents = z.object({
  kb_id: z.string({ required_error: "kb_id is required." }).min(1, { message: "kb_id cannot be empty." }),
  code: z.string({ required_error: "code is required." }).min(1, { message: "code cannot be empty." }),
  docs: z
    .array(DocumentSchema, { required_error: "docs array is required." })
    .nonempty({ message: "docs array cannot be empty." })
    .superRefine((docs, ctx) => {
      docs.forEach((q, index) => {
        if (q.document === undefined) {
          ctx.addIssue({
            path: ["docs", index, "document"],
            message: `Document at index ${index + 1} is missing.`,
          });
        } else if (q.document.trim() === "") {
          ctx.addIssue({
            path: ["docs", index, "document"],
            message: `Document at index ${index + 1} cannot be empty.`,
          });
        }

        if (q.title === undefined) {
          ctx.addIssue({
            path: ["docs", index, "title"],
            message: `Title at index ${index + 1} is missing.`,
          });
        } else if (q.title.trim() === "") {
          ctx.addIssue({
            path: ["docs", index, "title"],
            message: `Title at index ${index + 1} cannot be empty.`,
          });
        }
      });
    }),
});
async function deleteQaDocs(ids, tenant_partition_key, kb_id) {
  const filter = `tenant_partition_key == "${tenant_partition_key}" AND kb_id == "${kb_id}" AND article_id in ${JSON.stringify(ids)}`;
  const resVectorDb = await deleteQaDocsVectorDb(filter);
  const mongodeleteResult = await deleteArticleDocs(ids, tenant_partition_key, kb_id);
  return { resVectorDb, mongodeleteResult };
  // return { resVectorDb };
}
async function deleteQaDocsVectorDb(filter) {
  
  // const filter = `tenant_partition_key == "${tenant_partition_key}"`;
  const resVectorDb = await vectorDb.delete({
    collection_name: collection_kbarticle,
    filter: filter,
  });
  return { resVectorDb };
}

@Controller("/notebook/article")
export default class KnowBaseController {
  constructor() {
    console.info("===KnowBaseController instantsiated:", this.constructor);
  }

  @RequestMapping({ path: "/api/pages", method: "delete" })
  @ResponseBody
  async deleteQaPairs({ request }) {
    const body = request.body;
    const ids = body.del_ids;
    const kb_id = body.kb_id;
    // const topic_id = body.topic_id;
    // console.log(`body : ${JSON.stringify(body)}`);
    // console.log(`ids : ${JSON.stringify(ids)}`);
    const tenant_partition_key = context.getTenant();
    // const filter = `tenant_partition_key == "${tenant_partition_key}"`;
    const delRes = await deleteQaDocs(ids, tenant_partition_key, kb_id);
    return { ids, tenant_partition_key, delRes };
  }

  @RequestMapping({ path: "/api/pages/mongodb", method: "get" })
  @ResponseBody
  async getQaPairsMongodb({ request }) {
    const query = request.query;
    console.log(JSON.stringify(query));
    const kb_id = query.kb_id;
    // const topic_id = query.topic_id;
    const page = Number(query.page);
    const pageSize = Number(query.pageSize);
    const tenant_partition_key = context.getTenant();
    const lastSeenId = query.lastSeenId || null;
    const paginatedDocs = await getPaginatedArticleDocs(kb_id, lastSeenId, pageSize, page);
    console.log(`page data length = ${paginatedDocs.data.length}`);
    return {
      success : true,
      data: paginatedDocs.data,
      lastSeenId: paginatedDocs.nextCursor,
      total: paginatedDocs.totalCount,
      totalPages: paginatedDocs.totalPages,
      currentPage: page,
    };
  }

  @RequestMapping({ path: "/api/pages/vectordb", method: "get" })
  @ResponseBody
  async getQaPairsVectordb({ request }) {
    const query = request.query;
    console.log(JSON.stringify(query));
    const kb_id = query.kb_id;
    // const topic_id = query.topic_id;
    const page = Number(query.page);
    const pageSize = Number(query.pageSize);
    const tenant_partition_key = context.getTenant();
    const countResult = await vectorDb.query({
      collection_name: collection_kbarticle,
      filter: `tenant_partition_key == "${tenant_partition_key}" AND kb_id == "${kb_id}"`,
      output_fields: ["count(*)"],
    });
    console.log(`count result : ${JSON.stringify(countResult)}`);
    const total = countResult.data[0]["count(*)"];
    const totalPages = Math.ceil(total / pageSize);
    const output_fields = ["id", "kb_id", "article_id", "knowledgebase"];
    let paginationQuery = {};
    if (page <= 1) {
      paginationQuery = {
        collection_name: collection_kbarticle,
        filter: `tenant_partition_key == "${tenant_partition_key}" AND kb_id == "${kb_id}"`,
        output_fields: output_fields,
        limit: pageSize,
      };
    } else {
      const lastSeenId = BigInt(query.lastSeenId);
      paginationQuery = {
        collection_name: collection_kbarticle,
        filter: `tenant_partition_key == "${tenant_partition_key}" AND kb_id == "${kb_id}" AND id > ${lastSeenId}`,
        output_fields: output_fields,
        limit: pageSize,
      };
    }
    const queryResult = await vectorDb.query(paginationQuery);
    // if (queryResult.data.length > pageSize) {
    //   // Remove the extra document we fetched
    //   queryResult.data.pop();
    // }
    console.log(`page data length = ${queryResult.data.length}`);
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
      success : true,
      data: sorted,
      lastSeenId: lastSeenId,
      total,
      totalPages,
      currentPage: page,
    };
  }
  @RequestMapping({ path: "/api/pages", method: "patch" })
  @ResponseBody
  async qaUpdate({ request }) {
    const body = request.body;
    const kb_id = body.kb_id;
    const code = body.code;
    const category = body.category;
    const type = body.type;
    // const topic_id = body.topic_id;
    const updateDocs = body.updateDocs;
    const update_ids = updateDocs.map((doc) => doc._id);
    const tenant_partition_key = context.getTenant();
    const storedDocs = await fetchArticlesByIds(update_ids, kb_id,tenant_partition_key);
    const newDocs = await getArticleUpdateStatus(updateDocs, storedDocs);
    const updatedDocs = await updateArticleDocs(newDocs);
    const filter = `tenant_partition_key == "${tenant_partition_key}" AND kb_id == "${kb_id}" AND article_id in ${JSON.stringify(update_ids)}`;
    // const resVectorDb = await deleteQaDocsVectorDb(update_ids, tenant_partition_key, kb_id,topic_id);
    const resVectorDb = await deleteQaDocsVectorDb(filter);
    let data = [];
    for (const doc of newDocs) {
      const documentEmbedding = await generateEmbeddingOpenAi(doc.content,1536,"text-embedding-3-large");
      const vectorDbDoc = {
        tenant_partition_key: tenant_partition_key,
        article_vector: documentEmbedding,
        knowledgebase: doc.content,
        article_id: doc._id,
        title : doc.title,
        kb_id: kb_id,
        code : code,
        category : category,
        type : type
      };
      data.push(vectorDbDoc);
    }
    const res = await insertQaPairs(collection_kbarticle, data);
    return { success : true, mongoUpdate: updatedDocs, vectorDbDel: resVectorDb, vectorDbIns: res };
    // return { storedDocs };
  }
  @RequestMapping({ path: "/api/kb", method: "post" })
  @ResponseBody
  async createKbs({ request }) {
    const body = request.body;
    const type = body.type;
    const category = body.category;
    const title = body.title;
    console.log(`body : ${JSON.stringify(body)}`);
    const result = await createKbs(type,category,title);
    
    return { success : true , result };
  }
  @RequestMapping({ path: "/api/kb", method: "get" })
  @ResponseBody
  async getKbs({ request }) {
    // const query = request.query;
    // const tenant_partition_key = context.getTenant();
    const result = await getAllKbs();
    return { success : true , result };
  }
  @RequestMapping({ path: "/api/kb", method: "delete" })
  @ResponseBody
  async deleteKbs({ request }) {
    const tenant_partition_key = context.getTenant();
    const body = request.body;
    const kb_id = body.kb_id;
    const resultMongo = await deleteKb(kb_id, tenant_partition_key);
    const filter = `tenant_partition_key == "${tenant_partition_key}" AND kb_id == "${kb_id}"`;
    const resultVectordb = await deleteQaDocsVectorDb(filter);
    return {  success : true,  resultMongo , resultVectordb };
  }

  

  @RequestMapping({ path: "/api/pages", method: "post" })
  @ResponseBody
  async qaEmbed({ request }) {
    const body = request.body;
    try {
      documents.parse(body);
      console.log("Validation Passed ✅");
    } catch (err) {
      if (err instanceof z.ZodError) {
        // console.error("Validation Failed ❌", err.errors);
        const errorMessages = err.errors.map((e) => e.message).join(" | ");
        console.log(err.errors);
        // Return a structured HTTP 400 response
        const response = {
          status: 200,
          success : false,
          error: `Validation Failed ❌ ${errorMessages}`
        };
        return { response };
      }
    }

    // const tenant_domain =   //"kedar";
    // const server = config.getIfPresent("mry.scriptus.server");
    const tenant_partition_key = context.getTenant();
    // console.log(`<<<<<TENANT: ${JSON.stringify(tenant_partition_key)}`, );
    const docs = body.docs;
    const kb_id = body.kb_id;
    const code = body.code;
    const category = body.category;
    const type = body.type;
    // const topic_id = body.topic_id;
    console.log(`docs : ${JSON.stringify(docs)}`);

    let data = [];
    // for (const item of docs) {
    for(let i=0;i<docs.length;i++){
      console.log(`item : ${JSON.stringify(docs[i])}`);
      
      const element = {
        tenant_partition_key: tenant_partition_key,
        // knowledgebase: `Question : ${item.que} \n Answer : ${item.ans}`,
        title: docs[i].title,
        content: docs[i].document,
        code : code,
        type : type,
        category : category,
        parentId : kb_id,
        // topic_id
        // article_id,
      };
      data.push(element);
    }
    const mongo_saved_data = await saveDocs(data);
    let vectorDbData = [];
    for (const doc of mongo_saved_data) {
      console.log(`docs : ${doc}`);
      const documentEmbedding = await generateEmbeddingOpenAi(doc.content,1536,"text-embedding-3-large");
      const vectorDbDoc = {
        tenant_partition_key: tenant_partition_key,
        article_vector: documentEmbedding,
        knowledgebase: doc.content,
        article_id: doc._id,
        kb_id: kb_id,
        code : code,
        category : category,
        title : doc.title,
        type : type
      };
      vectorDbData.push(vectorDbDoc);
    }

    // console.log(`data : ${JSON.stringify(data)}`)

    const res = await insertQaPairs(collection_kbarticle, vectorDbData);
    console.log(`res : ${JSON.stringify(res)}`);
    return { success  : true , tenant_partition_key, kb_id, collection_name : collection_kbarticle , mongo_saved_data, res };
    // return { mongo_saved_data , res };
  }
}