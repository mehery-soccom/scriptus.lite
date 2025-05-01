const mongon = require('@bootloader/mongon');

const KbqaSchema = mongon.Schema({
  docId: {
    type: String,
    index: true,
    required: true,
    unique: true,
  },
  kb_id: {
    type: String,
    required: true,
  },
  article_id: {
    type: String,
    required: true,
  },
  knowledgebase: {
    type: String,
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  tenant_partition_key: {
    type: String,
    required: true,
  },
},{
  // Add createdAt and updatedAt timestamps automatically
  timestamps: true , collection : "kbqa"
});


module.exports = { KbqaSchema };