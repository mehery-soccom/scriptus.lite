const mongon = require('@bootloader/mongon');

const KbqaSchema = mongon.Schema({
  kb_id: {
    type: String,
    default: null,
    index: true
  },
  kb_name: {
    type: String,
    default: undefined,
    index: true,
    unique: true, // This will enforce uniqueness for all kb_name values
    sparse: true // Allows multiple documents to have a null kb_name without violating the unique constraint
  },
  topic_id:{
    type : String,
    default:null,
    index:true
  },
  topic_name:{
    type: String,
    default: undefined,
    index: true,
    unique: true, // This will enforce uniqueness for all kb_name values
    sparse: true // Allows multiple documents to have a null kb_name without violating the unique constraint
  },
  question: {
    type: String,
    default: null
  },
  answer: {
    type: String,
    default: null
  },
  tenant_partition_key: {
    type: String,
    required: true
  },
}, {
  timestamps: true,
  collection: "kbqa"
});


module.exports = { KbqaSchema };